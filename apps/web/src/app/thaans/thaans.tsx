"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";

import { rupees } from "@slk/domain/money";

import {
  Cell,
  ColumnsControl,
  FilterChips,
  FilterControl,
  HeaderCell,
  Pager,
  useColumnDrag,
  type Filters,
} from "@/components/grid";
import { usePreferences } from "@/components/preferences-provider";
import { ConfirmDialog, ToastBar, useToast } from "@/components/ui";
import {
  MIN_COLUMN_WIDTH,
  useColumnOrder,
  useColumnWidths,
  useVisibleColumns,
} from "@/lib/column-widths";
import type { StageFunnelRow, ThaanPage, ThaanQuery, ThaanRow } from "@/lib/thaans";
import { BALE_TYPES } from "@/app/bales/constants";

import { flagThaanDamaged, restoreThaan, voidThaan, type ActionResult } from "./actions";

/**
 * Stock Records: one row per Thaan, from the moment a bale is cut.
 *
 * A Thaan is the unit that moves — through the vendor stages, into a
 * Product Management record, and onto the shelf as the piece that carries
 * its own code. So the row that follows it is the row that answers "which
 * saree is this" once it is stock, and the same row answers "where has it
 * got to" while it is still in the pipeline. The old piece-based Stock
 * Records page said only the second half of that; this says both.
 *
 * The instrument is the shared grid — the same sort, one-button filter,
 * Columns menu, draggable widths and pager as Product Management — so
 * someone who has learnt one table has learnt this one.
 */
const COLUMNS = [
  { key: "code", label: "Thaan Code", width: 130 },
  { key: "stockStatus", label: "Stock Status", width: 118 },
  { key: "pipelineStatus", label: "Pipeline Status", width: 160 },
  { key: "recordCode", label: "Record Code", width: 130 },
  { key: "recordName", label: "Product", width: 280 },
  { key: "recordColour", label: "Colour", width: 130 },
  { key: "pieceCode", label: "Piece Code", width: 120 },
  { key: "productCode", label: "Product Code", width: 130 },
  { key: "locationName", label: "Location", width: 150 },
  { key: "price", label: "Price", width: 110 },
  { key: "baleCode", label: "Bale", width: 110 },
  { key: "itemName", label: "Item", width: 220 },
  { key: "billEntryDate", label: "Received", width: 124 },

  // Everything else a Thaan carries from its bale and cloth item. In the
  // Columns menu rather than on by default — the default set is what a
  // label in one hand asks for; these are what a stock-take asks for.
  { key: "supplierName", label: "Supplier", width: 180 },
  { key: "baleType", label: "Bale Type", width: 110 },
  { key: "fibre", label: "Fibre", width: 120 },
  { key: "textileMaterial", label: "Textile Material", width: 160 },
  { key: "weave", label: "Weave", width: 120 },
  { key: "productionMethod", label: "Production", width: 140 },
  { key: "audience", label: "Audience", width: 110 },
  { key: "border", label: "Border", width: 150 },
  { key: "pallu", label: "Pallu", width: 120 },
  { key: "blouse", label: "Blouse", width: 150 },
  { key: "sareeSize", label: "Saree Size", width: 130 },
  { key: "gradeCode", label: "Grade", width: 90 },
  { key: "invoiceNumber", label: "Invoice", width: 130 },
  { key: "transporter", label: "Transporter", width: 150 },
  { key: "baleTotal", label: "Bale Total", width: 110 },
  { key: "perThaanMetres", label: "Per Thaan", width: 100 },
  { key: "needsSecondPrint", label: "2nd Print", width: 90 },
  { key: "qrGeneratedAt", label: "QR Generated", width: 180 },
] as const;

type ColumnKey = (typeof COLUMNS)[number]["key"];

/** Module-level, so the stored-preference hooks are handed the same array every render. */
const COLUMN_KEYS: readonly string[] = COLUMNS.map((c) => c.key);

const OFF_BY_DEFAULT = new Set<ColumnKey>([
  "supplierName",
  "baleType",
  "fibre",
  "textileMaterial",
  "weave",
  "productionMethod",
  "audience",
  "border",
  "pallu",
  "blouse",
  "sareeSize",
  "gradeCode",
  "invoiceNumber",
  "transporter",
  "baleTotal",
  "perThaanMetres",
  "needsSecondPrint",
  "qrGeneratedAt",
]);

const DEFAULT_VISIBLE: readonly string[] = COLUMN_KEYS.filter(
  (k) => !OFF_BY_DEFAULT.has(k as ColumnKey),
);

const NUMERIC = new Set<ColumnKey>(["price", "baleTotal", "perThaanMetres"]);

/**
 * Columns the filter panel does not offer: the codes are unique to the row
 * (a tick-list as long as the table narrows nothing), and Stock Status,
 * Location and Bale Type each have their own dropdown in the header —
 * offering them twice is how two controls end up disagreeing.
 */
const NOT_FILTERABLE = new Set<ColumnKey>([
  "code",
  "recordCode",
  "pieceCode",
  "productCode",
  "stockStatus",
  "locationName",
  "baleType",
  "invoiceNumber",
  "qrGeneratedAt",
]);

const MONO = new Set<ColumnKey>(["code", "recordCode", "pieceCode", "productCode", "baleCode"]);

/** Print and Flag damaged, plus cell padding. */
const ACTIONS_WIDTH = 168;

/** The void checkbox: a tick, a border and its own padding. */
const CHECKBOX_WIDTH = 56;

type Status = NonNullable<ThaanQuery["status"]>;

/** Joins whichever parts are set with ", " — "" when none are. */
function joinSet(...parts: (string | null)[]): string {
  return parts.filter((p): p is string => p !== null).join(", ");
}

function money(minor: number | null): string {
  return minor === null ? "" : rupees(minor);
}

/** "01 Sep 2026" sorted as text puts the 1st of every month together. */
function dateValue(s: string | null): number {
  if (s === null) return -1;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : -1;
}

function stockStatusStyle(status: string): { background: string; color: string } {
  if (status === "On shelf") return { background: "var(--ok-soft)", color: "var(--ok)" };
  if (status === "In pipeline") return { background: "var(--warn-soft)", color: "var(--warn)" };
  if (status === "Voided") return { background: "var(--brick-soft)", color: "var(--brick)" };
  // "Gone" — it left the ledger; nothing to act on.
  return { background: "var(--off-soft)", color: "var(--off)" };
}

/** Matched by prefix, not exact value — "Out for X"/"Ready for X" name a different X per row. */
function pipelineStatusStyle(status: string): { background: string; color: string } {
  if (status === "Finished") return { background: "var(--ok-soft)", color: "var(--ok)" };
  if (status.startsWith("Out for ")) return { background: "var(--off-soft)", color: "var(--off)" };
  if (status === "QR Generated") return { background: "var(--off-soft)", color: "var(--off)" };
  // "QR Pending" and "Ready for X" both mean the same thing: waiting on someone to act.
  return { background: "var(--warn-soft)", color: "var(--warn)" };
}

function cell(row: ThaanRow, key: ColumnKey): string {
  switch (key) {
    case "price":
      return money(row.priceMinor);
    case "border":
      return joinSet(row.borderStyle, row.borderHeight);
    case "blouse":
      if (row.hasBlouse === null) return "";
      if (!row.hasBlouse) return "No";
      return joinSet(row.blouseStyle, row.blouseMaterial) || "Yes";
    case "sareeSize":
      return row.sareeLengthCm === null && row.sareeWidthCm === null
        ? ""
        : `${row.sareeLengthCm ?? "?"} × ${row.sareeWidthCm ?? "?"} cm`;
    case "baleTotal":
      return `${row.metresReceived} ${row.uom}`;
    case "perThaanMetres":
      return row.perThaanMetres === null ? "" : String(row.perThaanMetres);
    case "needsSecondPrint":
      return row.needsSecondPrint ? "Yes" : "No";
    default:
      return row[key] ?? "";
  }
}

function sortValue(row: ThaanRow, key: ColumnKey): string | number {
  switch (key) {
    case "price":
      return row.priceMinor ?? -1;
    case "baleTotal":
      return row.metresReceived;
    case "perThaanMetres":
      return row.perThaanMetres ?? -1;
    case "billEntryDate":
      return dateValue(row.billEntryDate);
    case "qrGeneratedAt":
      return dateValue(row.qrGeneratedAt);
    // Codes are numbers wearing a string (sometimes behind a letter), and
    // 500009 must not sort above 5000010 the way it would character by character.
    case "code":
    case "recordCode":
    case "pieceCode":
    case "productCode":
    case "baleCode": {
      const n = Number((row[key] ?? "").replace(/^[A-Za-z]+/, ""));
      return Number.isFinite(n) && row[key] !== null ? n : -1;
    }
    default:
      return cell(row, key).toLowerCase();
  }
}

/**
 * The search box and the three dropdowns are answered by the database, not
 * the browser: they live in the URL, the server answers with the first
 * hundred matches and the total, and everything below — column filters,
 * sorting, the pager — works on those rows.
 */
export function Thaans({
  page: served,
  locations,
  funnel,
  initial,
}: {
  page: ThaanPage;
  locations: string[];
  funnel: { eligible: number; stages: StageFunnelRow[] };
  initial: Required<ThaanQuery>;
}) {
  const rows = served.rows;
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [acting, startAction] = useTransition();
  const [toast, showToast] = useToast();

  const [query, setQuery] = useState(initial.q);
  const [status, setStatus] = useState<Status>(initial.status);
  const [location, setLocation] = useState(initial.location);
  const [baleType, setBaleType] = useState(initial.baleType);

  /*
    Typing waits a beat before asking the server; the dropdowns go through
    the same door so there is one door. A barcode scanner types a whole code
    in a few milliseconds and then presses Enter, well inside the delay.
  */
  useEffect(() => {
    const wanted = new URLSearchParams();
    const q = query.trim();
    if (q !== "") wanted.set("q", q);
    if (status !== "all") wanted.set("status", status);
    if (location !== "") wanted.set("location", location);
    if (baleType !== "") wanted.set("baleType", baleType);

    const current = new URLSearchParams();
    if (initial.q !== "") current.set("q", initial.q);
    if (initial.status !== "all") current.set("status", initial.status);
    if (initial.location !== "") current.set("location", initial.location);
    if (initial.baleType !== "") current.set("baleType", initial.baleType);

    if (wanted.toString() === current.toString()) return;

    const timer = setTimeout(() => {
      const search = wanted.toString();
      startTransition(() => {
        router.replace(search === "" ? pathname : `${pathname}?${search}`);
      });
    }, 250);

    return () => clearTimeout(timer);
  }, [query, status, location, baleType, initial, pathname, router]);

  const [filters, setFilters] = useState<Filters<ColumnKey>>({});
  const [sort, setSort] = useState<{ key: ColumnKey; dir: 1 | -1 } | null>(null);
  const [page, setPage] = useState(1);
  const [voiding, setVoiding] = useState<ThaanRow | null>(null);
  const [flagging, setFlagging] = useState<ThaanRow | null>(null);

  const { preferences } = usePreferences();
  const PER_PAGE = preferences.pageSize;

  const {
    visible,
    setVisible,
    reset: resetColumns,
    chosen: columnsChosen,
  } = useVisibleColumns("thaans", DEFAULT_VISIBLE);

  const { widths, setWidth, reset: resetWidths, resized } = useColumnWidths("thaans");

  const { order, move, reset: resetOrder, ordered } = useColumnOrder("thaans", COLUMN_KEYS);

  /** The order someone put them in, less the ones they have switched off. */
  const columns = order
    .map((key) => COLUMNS.find((c) => c.key === key))
    .filter((c): c is (typeof COLUMNS)[number] => c !== undefined && visible.has(c.key));

  const drag = useColumnDrag<ColumnKey>(
    columns.map((c) => c.key),
    move,
  );

  /** A dragged width if there is one, otherwise the width the column was designed at. */
  const widthOf = (c: { key: ColumnKey; width: number }) => widths[c.key] ?? c.width;

  const filtered = useMemo(() => {
    let out = rows.filter((r) => {
      for (const [key, want] of Object.entries(filters)) {
        if (!Array.isArray(want) || want.length === 0) continue;
        if (!want.includes(cell(r, key as ColumnKey))) return false;
      }
      return true;
    });

    if (sort !== null) {
      const { key, dir } = sort;
      out = [...out].sort((a, b) => {
        const x = sortValue(a, key);
        const y = sortValue(b, key);
        if (x < y) return -dir;
        if (x > y) return dir;
        return 0;
      });
    }

    return out;
  }, [rows, filters, sort]);

  /** Whether the server had more matches than it sent. */
  const truncated = served.total > rows.length;

  /** No search, no dropdowns, and still nothing: no Thaans at all. */
  const nothingAtAll =
    initial.q === "" &&
    initial.status === "all" &&
    initial.location === "" &&
    initial.baleType === "" &&
    served.total === 0;

  const pages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const current = Math.min(page, pages);
  const from = (current - 1) * PER_PAGE;
  const pageRows = filtered.slice(from, from + PER_PAGE);

  /** Distinct values actually present, so a filter can never return nothing. */
  const valuesFor = (key: ColumnKey): string[] =>
    [...new Set(rows.map((r) => cell(r, key)).filter((v) => v !== ""))].sort();

  function run(action: () => Promise<ActionResult>, onOk?: () => void) {
    startAction(async () => {
      const result = await action();
      showToast(result);
      if (result.ok) {
        onOk?.();
        router.refresh();
      }
    });
  }

  const statusLabel: Record<Status, string> = {
    all: "",
    in_pipeline: " in the pipeline",
    on_shelf: " on the shelf",
    gone: " that have left",
    voided: " voided",
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden px-8 py-8">
      {/*
        The control bar sits above the grid (z-30) so the Columns and Filter
        panels paint over the sticky column headings (z-20) rather than under.
      */}
      <header className="relative z-30 mb-5 flex flex-none flex-wrap items-end gap-3">
        <h1 className="mr-auto text-[24px] font-semibold tracking-tight text-ink">
          Stock Records
        </h1>

        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as Status);
            setPage(1);
          }}
          aria-label="Filter by stock status"
          className="rounded-lg border border-rule-2 bg-surface px-3 py-2 text-[13.5px] text-ink"
        >
          <option value="all">All Thaans</option>
          <option value="in_pipeline">In Pipeline</option>
          <option value="on_shelf">On Shelf</option>
          <option value="gone">Gone</option>
          <option value="voided">Voided</option>
        </select>

        <select
          value={location}
          onChange={(e) => {
            setLocation(e.target.value);
            setPage(1);
          }}
          aria-label="Filter by location"
          className="rounded-lg border border-rule-2 bg-surface px-3 py-2 text-[13.5px] text-ink"
        >
          <option value="">All Locations</option>
          {locations.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>

        <select
          value={baleType}
          onChange={(e) => {
            setBaleType(e.target.value);
            setPage(1);
          }}
          aria-label="Filter by bale type"
          className="rounded-lg border border-rule-2 bg-surface px-3 py-2 text-[13.5px] text-ink"
        >
          <option value="">All Types</option>
          {BALE_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>

        <input
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(1);
          }}
          placeholder="Scan or type a code…"
          aria-label="Search Thaans"
          // Autofocused because a barcode scanner is a keyboard that types
          // very fast and then presses Enter.
          autoFocus
          className={`w-56 rounded-lg border border-rule-2 bg-surface px-3 py-2 text-[13.5px] text-ink placeholder:text-faint ${
            pending ? "opacity-60" : ""
          }`}
        />

        <FilterControl
          columns={COLUMNS.filter((c) => !NUMERIC.has(c.key) && !NOT_FILTERABLE.has(c.key))}
          valuesFor={valuesFor}
          filters={filters}
          onChange={(key, values) => {
            setFilters((prev) => ({ ...prev, [key]: values }));
            setPage(1);
          }}
          onClearAll={() => {
            setFilters({});
            setPage(1);
          }}
        />

        <ColumnsControl
          columns={COLUMNS}
          order={order}
          visible={visible}
          onChange={setVisible}
          onMove={move}
          chosen={columnsChosen}
          resized={resized}
          ordered={ordered}
          onResetColumns={resetColumns}
          onResetWidths={resetWidths}
          onResetOrder={resetOrder}
        />
      </header>

      <FilterChips
        columns={COLUMNS}
        filters={filters}
        onRemove={(key) =>
          setFilters((prev) => {
            const { [key]: _drop, ...rest } = prev;
            return rest;
          })
        }
        onClearAll={() => setFilters({})}
      />

      {funnel.eligible > 0 && (
        <div className="mb-4 flex-none rounded-lg border border-rule bg-surface p-4">
          <StageFunnel eligible={funnel.eligible} stages={funnel.stages} />
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-rule bg-surface">
        <div className="flex flex-none items-center gap-3 border-b border-rule px-4 py-2.5">
          <span className="text-[12.5px] text-muted">
            {pending
              ? "Searching…"
              : `${served.total.toLocaleString("en-IN")} Thaan${served.total === 1 ? "" : "s"}`}
            {!pending && statusLabel[status]}
            {!pending && location && ` at ${location}`}
            {!pending && baleType && ` · ${baleType}`}
            {!pending && initial.q !== "" && ` matching “${initial.q}”`}
            {!pending && truncated && (
              <>
                {" — showing the newest "}
                {rows.length.toLocaleString("en-IN")}
                {". Type a code or a word to find any Thaan."}
              </>
            )}
          </span>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          <table
            className="w-full table-fixed text-[13.5px]"
            style={{
              minWidth:
                columns.reduce((sum, c) => sum + widthOf(c), 0) + ACTIONS_WIDTH + CHECKBOX_WIDTH,
            }}
          >
            <thead>
              <tr>
                {columns.map((c) => (
                  <HeaderCell
                    key={c.key}
                    column={c}
                    width={widthOf(c)}
                    numeric={NUMERIC.has(c.key)}
                    sortDir={sort?.key === c.key ? sort.dir : null}
                    onSort={() =>
                      setSort((prev) =>
                        prev?.key === c.key
                          ? { key: c.key, dir: prev.dir === 1 ? -1 : 1 }
                          : { key: c.key, dir: 1 },
                      )
                    }
                    onResize={(w) => setWidth(c.key, Math.max(MIN_COLUMN_WIDTH, w))}
                    drag={drag}
                  />
                ))}
                <th
                  style={{ width: CHECKBOX_WIDTH }}
                  className={`sticky top-0 z-20 border-b border-rule bg-surface px-3 py-2.5 text-left text-[12px] font-medium text-muted ${
                    drag.active !== null && drag.before === "end"
                      ? "shadow-[inset_2px_0_0_0_var(--brick)]"
                      : ""
                  }`}
                >
                  Void
                </th>
                <th
                  style={{ width: ACTIONS_WIDTH }}
                  className="sticky top-0 z-20 border-b border-rule bg-surface px-4 py-2.5 text-right text-[12px] font-medium text-muted"
                >
                  Actions
                </th>
              </tr>
            </thead>

            <tbody>
              {pageRows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length + 2} className="px-4 py-16 text-center">
                    <p className="mb-1 text-[15px] font-medium text-ink">
                      {pending ? "Searching…" : nothingAtAll ? "No Thaans yet" : "No Thaans match"}
                    </p>
                    <p className="mx-auto max-w-md text-[13.5px] leading-relaxed text-muted">
                      {pending
                        ? ""
                        : nothingAtAll
                          ? "They appear here once a bale is cut, from Bale Intake."
                          : "Clear the status, location, type or search to see everything. Thaan, bale, record, piece and product codes, items, suppliers and locations are all searchable."}
                    </p>
                  </td>
                </tr>
              ) : (
                pageRows.map((r) => (
                  <tr
                    key={r.id}
                    className={`h-11 border-b border-rule last:border-b-0 hover:bg-surface-2 ${
                      r.voidedAt !== null ? "opacity-60" : ""
                    }`}
                  >
                    {columns.map((c) => {
                      const value = cell(r, c.key);

                      if (c.key === "stockStatus" || c.key === "pipelineStatus") {
                        const style =
                          c.key === "stockStatus"
                            ? stockStatusStyle(value)
                            : pipelineStatusStyle(value);
                        return (
                          <Cell key={c.key} title={value}>
                            <span
                              className="rounded px-1.5 py-0.5 text-[11px] font-medium"
                              style={style}
                            >
                              {value}
                            </span>
                          </Cell>
                        );
                      }

                      if (c.key === "baleCode") {
                        return (
                          <Cell key={c.key} title={value} className="font-mono text-[12.5px]">
                            <Link
                              href={`/thaans/print/${r.baleId}`}
                              className="text-brick underline"
                            >
                              {value}
                            </Link>
                          </Cell>
                        );
                      }

                      if (c.key === "invoiceNumber") {
                        return (
                          <Cell
                            key={c.key}
                            title={
                              r.invoiceAmount !== null
                                ? `₹${r.invoiceAmount.toLocaleString("en-IN")}${r.invoiceDate !== null ? ` · ${r.invoiceDate}` : ""}`
                                : (r.invoiceDate ?? value ?? "Not set")
                            }
                            className="text-ink-2"
                          >
                            {value || "—"}
                          </Cell>
                        );
                      }

                      if (c.key === "qrGeneratedAt") {
                        return (
                          <Cell
                            key={c.key}
                            title={
                              r.qrGeneratedByName !== null
                                ? `Generated by ${r.qrGeneratedByName}`
                                : value || "Not set"
                            }
                            className="text-ink-2"
                          >
                            {value || "—"}
                          </Cell>
                        );
                      }

                      return (
                        <Cell
                          key={c.key}
                          numeric={NUMERIC.has(c.key)}
                          title={value || "Not set"}
                          className={
                            MONO.has(c.key)
                              ? `font-mono text-[12.5px] ${c.key === "code" ? "font-medium text-ink" : "text-ink-2"}`
                              : c.key === "recordName"
                                ? "text-ink"
                                : "text-ink-2"
                          }
                        >
                          {value || "—"}
                        </Cell>
                      );
                    })}

                    <td
                      className="px-3"
                      title={
                        r.voidedAt !== null
                          ? r.voidedByName !== null
                            ? `Voided by ${r.voidedByName}, ${r.voidedAt}`
                            : r.voidedAt
                          : "Mark this Thaan damaged, miscounted, or otherwise unusable"
                      }
                    >
                      <input
                        type="checkbox"
                        aria-label={`Void ${r.code ?? "this Thaan"}`}
                        checked={r.voidedAt !== null}
                        disabled={acting}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setVoiding(r);
                          } else {
                            run(() => restoreThaan(r.id));
                          }
                        }}
                        className="size-3.5"
                      />
                    </td>

                    <td className="px-4">
                      <div className="flex items-center justify-end gap-3 whitespace-nowrap">
                        {r.voidedAt === null && (
                          <button
                            type="button"
                            disabled={acting}
                            onClick={() => setFlagging(r)}
                            title="Flag this Thaan damaged — voids it and records who last held it"
                            className="text-[12.5px] text-muted underline hover:text-ink disabled:opacity-40"
                          >
                            Flag damaged
                          </button>
                        )}
                        {r.code !== null && (
                          <Link
                            href={`/thaans/print/${r.baleId}?thaan=${r.id}`}
                            className="text-[12.5px] text-brick underline"
                          >
                            Print
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <Pager total={filtered.length} page={current} perPage={PER_PAGE} onPage={setPage} />
      </div>

      {voiding !== null && (
        <ConfirmDialog
          title={`Void ${voiding.code ?? "this Thaan"}?`}
          description="Marks it damaged, miscounted, or otherwise unusable — it won't be sendable through Handovers until restored. This doesn't delete anything and can be undone."
          confirmLabel="Void"
          danger
          pending={acting}
          onConfirm={() => run(() => voidThaan(voiding.id), () => setVoiding(null))}
          onCancel={() => setVoiding(null)}
        />
      )}

      {flagging !== null && (
        <ConfirmDialog
          title={`Flag ${flagging.code ?? "this Thaan"} damaged?`}
          description="Records the damage against whichever vendor last held it and voids the Thaan so it stops moving through the pipeline. The void can be undone; the damage record stays for the vendor ledger."
          confirmLabel="Flag damaged"
          danger
          pending={acting}
          onConfirm={() =>
            run(
              () => flagThaanDamaged(flagging.id, null, ""),
              () => setFlagging(null),
            )
          }
          onCancel={() => setFlagging(null)}
        />
      )}

      <ToastBar toast={toast} onDismiss={() => showToast(null)} />
    </div>
  );
}

/**
 * How many Thaans have cleared each stage, in pipeline order — a funnel
 * against every Thaan that's entered the pipeline (has a QR code, isn't
 * voided), not just the page below it. Ironing is always the last stage a
 * Thaan can pass through (see `lib/stages.ts`), so its bar is also "how many
 * Thaans are fully finished" — there's no separate bar for that.
 */
function StageFunnel({ eligible, stages }: { eligible: number; stages: StageFunnelRow[] }) {
  return (
    <div className="flex flex-col gap-2.5">
      <p className="text-[11.5px] font-medium text-muted">
        Thaans completed per stage, of {eligible} in the pipeline
      </p>
      {stages.map((s, i) => (
        <div key={s.stage} className="flex items-center gap-3">
          <span className="w-28 flex-none truncate text-[12.5px] text-ink-2">
            {i === stages.length - 1 ? "Ironing (finished)" : s.stage}
          </span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-3">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.max(s.completed > 0 ? 2 : 0, (s.completed / Math.max(1, eligible)) * 100)}%`,
                background: i === stages.length - 1 ? "var(--ok)" : "var(--brick)",
              }}
            />
          </div>
          <span className="w-10 flex-none text-right font-mono text-[12px] tabular-nums text-muted">
            {s.completed}
          </span>
        </div>
      ))}
    </div>
  );
}

"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { colourSwatch, isPaleSwatch, titleCase } from "@slk/domain";

import type { Options, RecordDetail } from "@/lib/editor";
import type { RecordRow } from "@/lib/records";

import { copyRecord } from "./actions";
import { ArchiveDialog, RecordEditor } from "./record-editor";

/**
 * Product Records, as the prototype has it: twelve columns, each sortable and
 * filterable, two off by default, and six actions per row.
 *
 * Widths are sized to the longest value each column actually holds, because
 * every cell truncates rather than wraps. A cell that wraps makes its row
 * taller than its neighbours, and a handful of tall rows is what makes a data
 * grid look broken at a glance — the horizontal rules stop lining up.
 *
 *   Product      "Traditional Kalamkari Srikalahasti Mul Mul Cotton Saree"
 *   Fiber Type   "Sico (Silk-Cotton Blend)"
 *   Colour       "dark olive green", plus its swatch
 */
const COLUMNS = [
  { key: "name", label: "Product", width: 400 },
  { key: "productType", label: "Product Type", width: 130 },
  { key: "subType", label: "Product Sub Type", width: 138 },
  { key: "productionMethod", label: "Production Method", width: 150 },
  { key: "fibreType", label: "Fiber Type", width: 178 },
  { key: "regionalStyle", label: "Region Style", width: 126 },
  { key: "craftTechnique", label: "Craft Technique", width: 148 },
  { key: "code", label: "Design Code", width: 150 },
  { key: "audienceType", label: "Audience", width: 96 },
  { key: "colour", label: "Colour", width: 150 },
  { key: "quantity", label: "Quantity", width: 88 },
  { key: "price", label: "Price", width: 100 },
] as const;

type ColumnKey = (typeof COLUMNS)[number]["key"];

/**
 * Craft Technique and Region Style start hidden because the Product column
 * already reads "Soft Kantha Work Gadwal Sico Saree" — the craft and the
 * region are in the name. Both are one tick away in the Columns menu.
 */
const OFF_BY_DEFAULT = new Set<ColumnKey>(["craftTechnique", "regionalStyle"]);

const NUMERIC = new Set<ColumnKey>(["quantity", "price"]);

/** Six icon buttons at ~25px plus gaps and cell padding. */
const ACTIONS_WIDTH = 190;

const PER_PAGE = 25;

function cell(row: RecordRow, key: ColumnKey): string {
  switch (key) {
    case "price":
      return row.priceMinor === null ? "" : money(row.priceMinor);
    case "quantity":
      return String(row.quantity);
    // Stored lower case because the workbook has it that way; read as a
    // proper name.
    case "colour":
      return titleCase(row.colour);
    default:
      return row[key] ?? "";
  }
}

function sortValue(row: RecordRow, key: ColumnKey): string | number {
  if (key === "quantity") return row.quantity;
  if (key === "price") return row.priceMinor ?? -1;
  return (row[key] ?? "").toLowerCase();
}

export function money(minor: number): string {
  return `₹${(minor / 100).toLocaleString("en-IN", {
    maximumFractionDigits: 0,
  })}`;
}

export function RecordsTable({
  rows,
  industries,
  options,
}: {
  rows: RecordRow[];
  industries: string[];
  options: Options;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<{
    record: RecordDetail | null;
    tab: "basic" | "prices" | "images" | "stock";
  } | null>(null);
  const [archiving, setArchiving] = useState<RecordRow | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [loading, startLoading] = useTransition();

  /**
   * A record is fetched when it is opened rather than shipped with the table.
   * Eighteen rows would be fine; four thousand, each with a stock summary and
   * eight movements, would not.
   */
  const open = (id: string, tab: "basic" | "prices" | "images" | "stock") => {
    startLoading(async () => {
      const response = await fetch(`/records/${id}`);
      if (!response.ok) {
        setToast("Could not open that record.");
        return;
      }
      setEditing({ record: (await response.json()) as RecordDetail, tab });
    });
  };

  const done = (message: string) => {
    setEditing(null);
    setArchiving(null);
    setToast(message);
    router.refresh();
  };

  const [query, setQuery] = useState("");
  const [industry, setIndustry] = useState("");
  const [filters, setFilters] = useState<Partial<Record<ColumnKey, string>>>({});
  const [visible, setVisible] = useState<Set<ColumnKey>>(
    () => new Set(COLUMNS.map((c) => c.key).filter((k) => !OFF_BY_DEFAULT.has(k))),
  );
  const [showColumns, setShowColumns] = useState(false);
  const [sort, setSort] = useState<{ key: ColumnKey; dir: 1 | -1 } | null>(null);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);

  const columns = COLUMNS.filter((c) => visible.has(c.key));

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    let out = rows.filter((row) => {
      if (industry !== "" && row.industry !== industry) return false;

      for (const [key, want] of Object.entries(filters)) {
        if (want === undefined || want === "") continue;
        if (cell(row, key as ColumnKey) !== want) return false;
      }

      if (q === "") return true;

      return [row.name, row.code, row.colour, row.productType, row.craftTechnique]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(q));
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
  }, [rows, query, industry, filters, sort]);

  const pages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const current = Math.min(page, pages);
  const from = (current - 1) * PER_PAGE;
  const pageRows = filtered.slice(from, from + PER_PAGE);

  const activeFilters = Object.entries(filters).filter(
    ([, v]) => v !== undefined && v !== "",
  );

  /** Distinct values actually present, so a filter can never return nothing. */
  const valuesFor = (key: ColumnKey): string[] => {
    if (NUMERIC.has(key)) return [];
    return [...new Set(rows.map((r) => cell(r, key)).filter((v) => v !== ""))].sort();
  };

  return (
    <div className="px-8 py-8">
      <header className="mb-5 flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h1 className="text-[24px] font-semibold tracking-tight text-ink">
            Product Records
          </h1>
          <p className="mt-1 text-[13.5px] text-muted">
            One row per colour. Every attribute comes from Master Lists.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setEditing({ record: null, tab: "basic" })}
          className="rounded-lg bg-brick px-4 py-2 text-[13.5px] font-medium text-on-brick hover:bg-brick-2"
        >
          New Record
        </button>

        <select
          value={industry}
          onChange={(e) => {
            setIndustry(e.target.value);
            setPage(1);
          }}
          aria-label="Filter by industry"
          className="rounded-lg border border-rule-2 bg-surface px-3 py-2 text-[13.5px] text-ink"
        >
          <option value="">All Industries</option>
          {industries.map((i) => (
            <option key={i} value={i}>
              {i}
            </option>
          ))}
        </select>

        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(1);
          }}
          placeholder="Search records…"
          aria-label="Search records"
          className="w-56 rounded-lg border border-rule-2 bg-surface px-3 py-2 text-[13.5px] text-ink placeholder:text-faint"
        />

        <div className="relative">
          <button
            type="button"
            onClick={() => setShowColumns((v) => !v)}
            aria-expanded={showColumns}
            className="rounded-lg border border-rule-2 bg-surface px-3 py-2 text-[13.5px] text-ink-2 hover:border-ink-2"
          >
            Columns
          </button>

          {showColumns && (
            <>
              {/* Clicking anywhere else closes the menu, which is what every
                  dropdown does and what people expect. */}
              <button
                type="button"
                aria-label="Close columns menu"
                onClick={() => setShowColumns(false)}
                className="fixed inset-0 z-10 cursor-default"
              />
              <div className="absolute right-0 z-20 mt-1 w-56 rounded-lg border border-rule-2 bg-surface p-2 shadow-lg">
              {COLUMNS.map((c) => (
                <label
                  key={c.key}
                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-[13px] text-ink-2 hover:bg-surface-2"
                >
                  <input
                    type="checkbox"
                    checked={visible.has(c.key)}
                    onChange={() => {
                      setVisible((prev) => {
                        const next = new Set(prev);
                        if (next.has(c.key)) next.delete(c.key);
                        else next.add(c.key);
                        return next;
                      });
                    }}
                    className="accent-[var(--brick)]"
                  />
                  {c.label}
                </label>
              ))}
              </div>
            </>
          )}
        </div>
      </header>

      {activeFilters.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {activeFilters.map(([key, value]) => (
            <button
              key={key}
              type="button"
              onClick={() =>
                setFilters((prev) => {
                  const { [key as ColumnKey]: _drop, ...rest } = prev;
                  return rest;
                })
              }
              className="rounded-full border border-brick bg-brick-soft px-3 py-1 text-[12px] text-brick"
            >
              {COLUMNS.find((c) => c.key === key)?.label}: {value} ✕
            </button>
          ))}
          <button
            type="button"
            onClick={() => setFilters({})}
            className="text-[12.5px] text-muted hover:text-ink"
          >
            Clear All
          </button>
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-rule bg-surface">
        <div className="flex items-center gap-3 border-b border-rule px-4 py-2.5">
          <span className="text-[12.5px] text-muted">
            {filtered.length.toLocaleString("en-IN")} record
            {filtered.length === 1 ? "" : "s"}
            {industry && ` in ${industry}`}
          </span>
        </div>

        <div className="overflow-x-auto">
          {/*
            Fixed layout with an explicit minimum: the columns keep the widths
            they were given, and the container scrolls sideways rather than
            squeezing Product down to an ellipsis.
          */}
          <table
            className="w-full table-fixed text-[13.5px]"
            style={{
              minWidth:
                columns.reduce((sum, c) => sum + c.width, 0) + ACTIONS_WIDTH,
            }}
          >
            <thead>
              <tr>
                {columns.map((c) => {
                  const on = sort?.key === c.key;
                  const values = valuesFor(c.key);

                  return (
                    <th
                      key={c.key}
                      style={c.width ? { width: c.width } : undefined}
                      className={`border-b border-rule px-3 py-2.5 text-left text-[12px] font-medium whitespace-nowrap text-muted ${
                        NUMERIC.has(c.key) ? "text-right" : ""
                      }`}
                    >
                      <span className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            setSort((prev) =>
                              prev?.key === c.key
                                ? { key: c.key, dir: prev.dir === 1 ? -1 : 1 }
                                : { key: c.key, dir: 1 },
                            )
                          }
                          className={`hover:text-ink ${on ? "text-ink" : ""} ${
                            NUMERIC.has(c.key) ? "ml-auto" : ""
                          }`}
                        >
                          {c.label}
                          <span className={on ? "ml-1" : "ml-1 opacity-40"}>
                            {on ? (sort.dir > 0 ? "↑" : "↓") : "↕"}
                          </span>
                        </button>

                        {values.length > 0 && (
                          <select
                            value={filters[c.key] ?? ""}
                            onChange={(e) => {
                              const v = e.target.value;
                              setFilters((prev) => ({ ...prev, [c.key]: v }));
                              setPage(1);
                            }}
                            aria-label={`Filter by ${c.label}`}
                            className={`w-4 shrink-0 cursor-pointer appearance-none bg-transparent text-center ${
                              filters[c.key] ? "text-brick" : "text-faint hover:text-ink-2"
                            }`}
                          >
                            <option value="">All</option>
                            {values.map((v) => (
                              <option key={v} value={v}>
                                {v}
                              </option>
                            ))}
                          </select>
                        )}
                      </span>
                    </th>
                  );
                })}
                <th className="w-[190px] border-b border-rule px-4 py-2.5 text-right text-[12px] font-medium text-muted">
                  Actions
                </th>
              </tr>
            </thead>

            <tbody>
              {pageRows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length + 1} className="px-4 py-16 text-center">
                    <p className="mb-1 text-[15px] font-medium text-ink">
                      No records match
                    </p>
                    <p className="text-[13.5px] text-muted">
                      {industry || query || activeFilters.length
                        ? "Clear the industry filter or the search to see everything."
                        : "Add your first record to get started."}
                    </p>
                  </td>
                </tr>
              ) : (
                pageRows.map((row) => (
                  <tr
                    key={row.id}
                    onClick={() => setSelected(row.id)}
                    // A single fixed height for every row. Nothing inside a
                    // cell is allowed to change it.
                    className={`h-11 cursor-pointer border-b border-rule last:border-b-0 ${
                      selected === row.id ? "bg-brick-soft" : "hover:bg-surface-2"
                    }`}
                  >
                    {columns.map((c) => {
                      const value = cell(row, c.key);

                      if (c.key === "colour") {
                        const swatch = colourSwatch(row.colour, row.colourHex);

                        return (
                          <Cell key={c.key} title={value || "Not set"}>
                            <span className="flex min-w-0 items-center gap-2">
                              <span
                                aria-hidden
                                className={`size-3.5 shrink-0 rounded-full ${
                                  isPaleSwatch(swatch)
                                    ? "border border-rule-2"
                                    : "border border-black/10"
                                }`}
                                style={{ background: swatch }}
                              />
                              <span className="truncate text-ink-2">
                                {value || "—"}
                              </span>
                            </span>
                          </Cell>
                        );
                      }

                      if (c.key === "quantity") {
                        return (
                          <Cell key={c.key} numeric title={`${value}${row.uom === "Metre" ? " metres" : ""}`}>
                            <span className={row.quantity === 0 ? "text-warn" : "text-ink"}>
                              {value}
                            </span>
                            {row.uom === "Metre" && (
                              <span className="ml-1 text-[11px] text-faint">m</span>
                            )}
                          </Cell>
                        );
                      }

                      return (
                        <Cell
                          key={c.key}
                          numeric={NUMERIC.has(c.key)}
                          title={value || "Not set"}
                          className={
                            c.key === "code"
                              ? "font-mono text-[12px] text-ink-2"
                              : c.key === "name"
                                ? "text-ink"
                                : "text-ink-2"
                          }
                        >
                          {value || "—"}
                        </Cell>
                      );
                    })}

                    <td className="px-4 py-2">
                      <RowActions
                        serialised={row.isSerialised}
                        pieces={row.pieces}
                        busy={loading}
                        onAction={(action) => {
                          if (action === "delete") setArchiving(row);
                          else if (action === "copy") {
                            startLoading(async () => {
                              done((await copyRecord(row.id)).message);
                            });
                          } else open(row.id, action);
                        }}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center gap-2 border-t border-rule px-4 py-2.5">
          <span className="text-[12.5px] text-muted">
            Showing {filtered.length === 0 ? 0 : from + 1}–
            {Math.min(from + PER_PAGE, filtered.length)} of{" "}
            {filtered.length.toLocaleString("en-IN")}
          </span>

          {pages > 1 && (
            <span className="ml-auto flex items-center gap-1">
              <PageButton disabled={current === 1} onClick={() => setPage(current - 1)}>
                ‹
              </PageButton>
              {Array.from({ length: Math.min(5, pages) }, (_, i) => {
                const lo = Math.max(1, Math.min(current - 2, pages - 4));
                return lo + i;
              })
                .filter((n) => n >= 1 && n <= pages)
                .map((n) => (
                  <PageButton key={n} on={n === current} onClick={() => setPage(n)}>
                    {n}
                  </PageButton>
                ))}
              <PageButton
                disabled={current === pages}
                onClick={() => setPage(current + 1)}
              >
                ›
              </PageButton>
            </span>
          )}
        </div>
      </div>

      {toast && (
        <div
          role="status"
          className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2 rounded-lg border border-rule bg-surface px-4 py-2.5 text-[13.5px] text-ink shadow-lg"
        >
          {toast}
          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label="Dismiss"
            className="ml-3 text-muted hover:text-ink"
          >
            ✕
          </button>
        </div>
      )}

      {editing && (
        <RecordEditor
          record={editing.record}
          options={options}
          initialTab={editing.tab}
          onClose={() => setEditing(null)}
          onSaved={done}
        />
      )}

      {archiving && (
        <ArchiveDialog
          record={{ id: archiving.id, name: archiving.name, code: archiving.code }}
          onClose={() => setArchiving(null)}
          onDone={done}
        />
      )}
    </div>
  );
}

/**
 * One rule for every cell: never wrap, truncate with an ellipsis, and carry
 * the whole value in the title so hovering reveals what was cut.
 *
 * Applied without exception. Letting one column wrap while its neighbours
 * truncate is what made "bottle green" and "Sico (Silk-Cotton Blend)" push
 * their rows taller than the rest.
 */
function Cell({
  children,
  title,
  numeric,
  className = "",
}: {
  children: React.ReactNode;
  title: string;
  numeric?: boolean;
  className?: string;
}) {
  return (
    <td
      title={title}
      className={`overflow-hidden px-3 whitespace-nowrap ${
        numeric ? "text-right tabular-nums" : "truncate"
      } ${className}`}
    >
      {children}
    </td>
  );
}

function PageButton({
  children,
  on,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  on?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-current={on ? "page" : undefined}
      className={`min-w-7 rounded px-2 py-1 text-[12.5px] ${
        on
          ? "bg-ink text-ground"
          : "text-ink-2 hover:bg-surface-2 disabled:opacity-30 disabled:hover:bg-transparent"
      }`}
    >
      {children}
    </button>
  );
}

/**
 * The six row actions from the prototype. Four of them open the same editor
 * on a different tab — one record has one editor, not four dialogs.
 */
type RowAction = "prices" | "images" | "stock" | "basic" | "copy" | "delete";

const ACTIONS: { key: RowAction; title: string; path: string }[] = [
  { key: "prices", title: "All prices", path: "M6 4h7 M6 7.5h7 M12.5 4c0 2.5-1.6 3.5-4 3.5h-.5L13 15 M6 7.5h1.5" },
  { key: "images", title: "Product images", path: "M3 5h14v10H3z M3 12.5l4-3.5 3 2.5 3.5-3.5L17 12" },
  { key: "stock", title: "Stock — available, sold, damaged", path: "M3 6l7-3 7 3v8l-7 3-7-3z M3 6l7 3 7-3 M10 9v8" },
  { key: "basic", title: "Open the full record", path: "M13.5 3.5l3 3L7 16H4v-3z" },
  { key: "copy", title: "Copy to a new colour", path: "M7 7h9v9H7z M4 13V4h9" },
  { key: "delete", title: "Archive this record", path: "M4 6h12 M8 6V4h4v2 M6 6l1 10h6l1-10" },
];

function RowActions({
  serialised,
  pieces,
  busy,
  onAction,
}: {
  serialised: boolean;
  pieces: number;
  busy: boolean;
  onAction: (action: RowAction) => void;
}) {
  return (
    <div className="flex items-center justify-end gap-0.5">
      {serialised && (
        <span
          className="mr-1 font-mono text-[10px] text-faint"
          title={`${pieces} pieces tagged individually`}
        >
          {pieces}p
        </span>
      )}
      {ACTIONS.map((a) => (
        <button
          key={a.key}
          type="button"
          title={a.title}
          aria-label={a.title}
          disabled={busy}
          onClick={(e) => {
            e.stopPropagation();
            onAction(a.key);
          }}
          className={`rounded p-1.5 text-faint hover:bg-surface-3 disabled:opacity-40 ${
            a.key === "delete" ? "hover:text-brick" : "hover:text-ink"
          }`}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d={a.path} />
          </svg>
        </button>
      ))}
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";

import {
  Cell,
  ColumnsControl,
  FilterChips,
  FilterControl,
  Pager,
  ResizeHandle,
  SortButton,
  Toast,
  type Filters,
} from "@/components/grid";
import { MIN_COLUMN_WIDTH, useColumnWidths, useVisibleColumns } from "@/lib/column-widths";
import type { PieceRow } from "@/lib/pieces";

/**
 * Stock, one physical piece at a time.
 *
 * Product Management answers "what do we sell and how much is there". This
 * answers "which saree is this", which is the question asked with a label in
 * one hand — so the codes are the first thing on the row and the QR is
 * beside them rather than hidden behind a click.
 *
 * Everything else is the same instrument as Product Management: the same
 * sorting, the same one-button filter, the same Columns menu, the same
 * draggable widths, the same pager. Someone who has learnt one table has
 * learnt both, and the components come from `components/grid` so the two
 * cannot quietly drift apart.
 */
const COLUMNS = [
  { key: "itemCode", label: "Item Code", width: 156 },
  { key: "productCode", label: "Product Code", width: 156 },
  { key: "name", label: "Product", width: 320 },
  { key: "designCode", label: "Design Code", width: 150 },
  { key: "colour", label: "Colour", width: 140 },
  { key: "motif", label: "Motif", width: 130 },
  { key: "location", label: "Location", width: 150 },
  { key: "receivedAt", label: "Received", width: 124 },

  // Everything else a piece carries. Available in the Columns menu rather
  // than shown by default, and three of these used to be second lines
  // underneath other cells — which made them unsortable, unfilterable, and
  // invisible to anyone who did not already know they were there.
  { key: "productType", label: "Product Type", width: 130 },
  { key: "motifCategory", label: "Motif Category", width: 148 },
  { key: "reference", label: "Reference", width: 150 },
  { key: "serial", label: "Serial", width: 88 },

  { key: "price", label: "Price", width: 110 },
] as const;

type ColumnKey = (typeof COLUMNS)[number]["key"];

const OFF_BY_DEFAULT = new Set<ColumnKey>([
  "productType",
  "motifCategory",
  "reference",
  "serial",
]);

const NUMERIC = new Set<ColumnKey>(["serial", "price"]);

/**
 * Columns the filter panel does not offer.
 *
 * Item Code is unique to the piece and Design Code very nearly so, which
 * makes a tick-list of them a list as long as the table — a filter that
 * cannot narrow anything is worse than no filter, because it still has to be
 * read past to reach the ones that can. Location is absent for the opposite
 * reason: it has its own dropdown in the header, and offering it twice is how
 * you end up with two controls disagreeing about the same thing.
 */
const NOT_FILTERABLE = new Set<ColumnKey>(["itemCode", "designCode", "location"]);

/** Three icon buttons at ~28px plus gaps and cell padding. */
const ACTIONS_WIDTH = 116;

const PER_PAGE = 25;

function money(minor: number | null): string {
  return minor === null
    ? ""
    : `₹${(minor / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function cell(row: PieceRow, key: ColumnKey): string {
  switch (key) {
    case "price":
      return money(row.priceMinor);
    case "serial":
      return String(row.serial);
    default:
      return row[key] ?? "";
  }
}

function sortValue(row: PieceRow, key: ColumnKey): string | number {
  switch (key) {
    case "price":
      return row.priceMinor ?? -1;
    case "serial":
      return row.serial;
    // Codes are numbers wearing a string, and 500009 must not sort above
    // 5000010 the way it would character by character.
    case "itemCode":
    case "productCode": {
      const n = Number(row[key]);
      return Number.isFinite(n) ? n : -1;
    }
    // "01 Sep 2026" sorted as text puts the 1st of every month together.
    // The ISO date comes down the wire beside it for exactly this.
    case "receivedAt":
      return row.receivedOn ?? "";
    default:
      return (row[key] ?? "").toLowerCase();
  }
}

export function StockRecords({
  pieces,
  locations,
}: {
  pieces: PieceRow[];
  locations: string[];
}) {
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("");
  const [filters, setFilters] = useState<Filters<ColumnKey>>({});
  const [sort, setSort] = useState<{ key: ColumnKey; dir: 1 | -1 } | null>(null);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const [viewing, setViewing] = useState<PieceRow | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  /**
   * The QR codes, on or off.
   *
   * Stock-specific and kept from the first version of this screen: they are
   * the point of the page when you are matching a label to a row, and they
   * are noise when you are reading it as a table.
   */
  const [showQr, setShowQr] = useState(true);

  const {
    visible,
    setVisible,
    reset: resetColumns,
    chosen: columnsChosen,
  } = useVisibleColumns(
    "stock",
    () => new Set(COLUMNS.map((c) => c.key).filter((k) => !OFF_BY_DEFAULT.has(k))),
  );

  const { widths, setWidth, reset: resetWidths, resized } = useColumnWidths("stock");

  const columns = COLUMNS.filter((c) => visible.has(c.key));

  /** A dragged width if there is one, otherwise the width the column was designed at. */
  const widthOf = (c: { key: ColumnKey; width: number }) => widths[c.key] ?? c.width;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    let out = pieces.filter((p) => {
      if (location !== "" && p.location !== location) return false;

      for (const [key, want] of Object.entries(filters)) {
        if (!Array.isArray(want) || want.length === 0) continue;
        if (!want.includes(cell(p, key as ColumnKey))) return false;
      }

      if (q === "") return true;

      return [p.itemCode, p.productCode, p.designCode, p.name, p.colour, p.motif]
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
  }, [pieces, query, location, filters, sort]);

  const pages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const current = Math.min(page, pages);
  const from = (current - 1) * PER_PAGE;
  const pageRows = filtered.slice(from, from + PER_PAGE);

  /** Distinct values actually present, so a filter can never return nothing. */
  const valuesFor = (key: ColumnKey): string[] =>
    [...new Set(pieces.map((p) => cell(p, key)).filter((v) => v !== ""))].sort();

  const copy = async (what: string, value: string | null) => {
    if (value === null) {
      setToast(`This piece has no ${what.toLowerCase()}.`);
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      setToast(`${what} ${value} copied.`);
    } catch {
      // A page served over plain HTTP, or a browser that wants a gesture it
      // did not see. Saying so beats a button that silently does nothing.
      setToast("Could not reach the clipboard. Copy it by hand.");
    }
  };

  /*
    The grid fills the window rather than shrinking to its rows, so the
    column headings stay put while the body scrolls under them and the count
    and the pager stay where they were put.
  */
  return (
    <div className="flex h-screen flex-col overflow-hidden px-8 py-8">
      {/*
        The control bar sits above the grid, and says so once here rather than
        each menu bidding its z-index up against the table.

        The column headings are `sticky z-20` so they survive the body
        scrolling under them. The Columns and Filter panels were also z-20, and
        at equal z-index the later element in the document wins — so the
        headings painted over the open menu and swallowed whichever entries
        happened to fall behind them. "Product" was unreachable.
      */}
      <header className="relative z-30 mb-5 flex flex-none flex-wrap items-end gap-3">
        <h1 className="mr-auto text-[24px] font-semibold tracking-tight text-ink">
          Stock Records
        </h1>

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

        <input
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(1);
          }}
          placeholder="Scan or type a code…"
          aria-label="Search pieces"
          // Autofocused because a barcode scanner is a keyboard that types
          // very fast and then presses Enter. If the field is not focused the
          // scan goes nowhere, which is a confusing way to discover it.
          autoFocus
          className="w-56 rounded-lg border border-rule-2 bg-surface px-3 py-2 text-[13.5px] text-ink placeholder:text-faint"
        />

        <FilterControl
          columns={COLUMNS.filter(
            (c) => !NUMERIC.has(c.key) && !NOT_FILTERABLE.has(c.key),
          )}
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
          visible={visible}
          onChange={setVisible}
          chosen={columnsChosen}
          resized={resized}
          onResetColumns={resetColumns}
          onResetWidths={resetWidths}
        />

        <button
          type="button"
          onClick={() => setShowQr((v) => !v)}
          aria-pressed={showQr}
          className={`rounded-lg border px-3 py-2 text-[13.5px] ${
            showQr
              ? "border-brick bg-brick-soft text-brick"
              : "border-rule-2 bg-surface text-ink-2 hover:border-ink-2"
          }`}
        >
          QR
        </button>
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

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-rule bg-surface">
        <div className="flex flex-none items-center gap-3 border-b border-rule px-4 py-2.5">
          <span className="text-[12.5px] text-muted">
            {filtered.length.toLocaleString("en-IN")} piece
            {filtered.length === 1 ? "" : "s"}
            {location && ` at ${location}`}
            {query.trim() !== "" && ` matching “${query.trim()}”`}
          </span>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          {/*
            Fixed layout with an explicit minimum: the columns keep the widths
            they were given, and the container scrolls sideways rather than
            squeezing Product down to an ellipsis.
          */}
          <table
            className="w-full table-fixed text-[13.5px]"
            style={{
              minWidth:
                columns.reduce((sum, c) => sum + widthOf(c), 0) + ACTIONS_WIDTH,
            }}
          >
            <thead>
              <tr>
                {columns.map((c) => (
                  <th
                    key={c.key}
                    style={{ width: widthOf(c) }}
                    className={`sticky top-0 z-20 border-b border-rule bg-surface px-3 py-2.5 text-left text-[12px] font-medium whitespace-nowrap text-muted ${
                      NUMERIC.has(c.key) ? "text-right" : ""
                    }`}
                  >
                    <SortButton
                      label={c.label}
                      dir={sort?.key === c.key ? sort.dir : null}
                      numeric={NUMERIC.has(c.key)}
                      onToggle={() =>
                        setSort((prev) =>
                          prev?.key === c.key
                            ? { key: c.key, dir: prev.dir === 1 ? -1 : 1 }
                            : { key: c.key, dir: 1 },
                        )
                      }
                    />

                    <ResizeHandle
                      label={c.label}
                      width={widthOf(c)}
                      defaultWidth={c.width}
                      onResize={(w) => setWidth(c.key, Math.max(MIN_COLUMN_WIDTH, w))}
                    />
                  </th>
                ))}
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
                  <td colSpan={columns.length + 1} className="px-4 py-16 text-center">
                    <p className="mb-1 text-[15px] font-medium text-ink">
                      {pieces.length === 0 ? "No pieces yet" : "No pieces match"}
                    </p>
                    <p className="mx-auto max-w-md text-[13.5px] leading-relaxed text-muted">
                      {pieces.length === 0
                        ? "A piece is minted when stock is received against a serialised design — sarees are tagged one by one, so each gets its own item code and QR."
                        : "Clear the location filter or the search to see everything. Item codes, product codes, design codes, names, colours and motifs are all searchable."}
                    </p>
                  </td>
                </tr>
              ) : (
                pageRows.map((p) => (
                  <tr
                    key={p.id}
                    onClick={() => {
                      setSelected(p.id);
                      setViewing(p);
                    }}
                    /*
                      One fixed height for every row, and nothing inside a cell
                      is allowed to change it. The two heights are the QR
                      toggle: a 40px code needs the room, and a table with no
                      codes in it should not keep paying for them.
                    */
                    className={`cursor-pointer border-b border-rule last:border-b-0 ${
                      showQr ? "h-14" : "h-11"
                    } ${
                      selected === p.id ? "bg-brick-soft" : "hover:bg-surface-2"
                    }`}
                  >
                    {columns.map((c) => {
                      const value = cell(p, c.key);

                      if (c.key === "itemCode" || c.key === "productCode") {
                        const code = c.key === "itemCode" ? p.itemCode : p.productCode;
                        const qr = c.key === "itemCode" ? p.itemQr : p.productQr;

                        return (
                          <Cell key={c.key} title={code ?? "Not set"}>
                            <span className="flex items-center gap-2">
                              {showQr && qr !== null && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={qr}
                                  alt={`QR code for ${code}`}
                                  width={40}
                                  height={40}
                                  className="flex-none rounded-sm bg-white p-0.5"
                                />
                              )}
                              <span
                                className={`min-w-0 truncate font-mono text-[13px] ${
                                  c.key === "itemCode"
                                    ? "font-medium text-ink"
                                    : "text-ink-2"
                                }`}
                              >
                                {code ?? "—"}
                              </span>
                            </span>
                          </Cell>
                        );
                      }

                      return (
                        <Cell
                          key={c.key}
                          numeric={NUMERIC.has(c.key)}
                          title={value || "Not set"}
                          className={
                            c.key === "designCode"
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

                    <td className="px-4">
                      <RowActions
                        hasProductCode={p.productCode !== null}
                        onOpen={() => {
                          setSelected(p.id);
                          setViewing(p);
                        }}
                        onCopyItem={() => void copy("Item code", p.itemCode)}
                        onCopyProduct={() => void copy("Product code", p.productCode)}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <Pager
          total={filtered.length}
          page={current}
          perPage={PER_PAGE}
          onPage={setPage}
        />
      </div>

      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}

      {viewing && (
        <PiecePanel
          piece={viewing}
          onCopy={(what, value) => void copy(what, value)}
          onClose={() => setViewing(null)}
        />
      )}
    </div>
  );
}

/**
 * What a piece can be asked to do from the row.
 *
 * Three, where Product Management has six, and that is the honest count: a
 * piece is a physical object with a label on it, not a record with prices and
 * images and a stock ledger behind it. The two copy buttons are here because
 * the codes are the reason anyone is on this screen — they get pasted into a
 * courier form, a message, a spreadsheet.
 */
function RowActions({
  hasProductCode,
  onOpen,
  onCopyItem,
  onCopyProduct,
}: {
  hasProductCode: boolean;
  onOpen: () => void;
  onCopyItem: () => void;
  onCopyProduct: () => void;
}) {
  const actions: { title: string; path: string; run: () => void; off?: boolean }[] = [
    {
      title: "Open this piece",
      path: "M12 3h5v5 M17 3l-7 7 M8 17H3v-5 M3 17l7-7",
      run: onOpen,
    },
    {
      title: "Copy the item code",
      path: "M7 7h9v9H7z M4 13V4h9",
      run: onCopyItem,
    },
    {
      title: hasProductCode
        ? "Copy the product code"
        : "This piece has no product code",
      path: "M3 5h14v10H3z M7 8.5h6 M7 11.5h4",
      run: onCopyProduct,
      off: !hasProductCode,
    },
  ];

  return (
    <div className="flex items-center justify-end gap-0.5">
      {actions.map((a) => (
        <button
          key={a.title}
          type="button"
          title={a.title}
          aria-label={a.title}
          disabled={a.off}
          onClick={(e) => {
            // The row opens the piece. A button that copies a code must not
            // also do that on its way past.
            e.stopPropagation();
            a.run();
          }}
          className="rounded p-1.5 text-faint hover:bg-surface-3 hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-faint"
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

/**
 * One piece, at the size a label is read at.
 *
 * Read-only, and deliberately so. Everything on this panel except the codes
 * belongs to the design or the colourway — changing "Colour" here would
 * change it for every other piece cut from the same cloth, which is a Product
 * Management decision made on a Product Management screen. What this panel is
 * for is the other direction: a code in your hand, and the question of what
 * it is attached to.
 */
function PiecePanel({
  piece,
  onCopy,
  onClose,
}: {
  piece: PieceRow;
  onCopy: (what: string, value: string | null) => void;
  onClose: () => void;
}) {
  const fields: [string, string][] = [
    ["Product", piece.name],
    ["Design Code", piece.designCode],
    ["Product Type", piece.productType ?? "—"],
    ["Colour", piece.colour ?? "—"],
    ["Motif", piece.motif ?? "—"],
    ["Motif Category", piece.motifCategory ?? "—"],
    ["Location", piece.location ?? "—"],
    ["Received", piece.receivedAt ?? "—"],
    ["Reference", piece.reference ?? "—"],
    ["Serial", String(piece.serial)],
    ["Price", money(piece.priceMinor) || "—"],
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <button
        type="button"
        aria-label="Close piece"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-ink/25"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Piece ${piece.itemCode}`}
        className="relative flex w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-rule bg-surface shadow-2xl"
      >
        <header className="flex items-baseline gap-3 border-b border-rule px-6 py-5">
          <h2 className="font-mono text-[19px] font-semibold tracking-tight text-ink">
            {piece.itemCode}
          </h2>
          <span className="truncate text-[13.5px] text-muted">{piece.name}</span>
        </header>

        <div className="flex flex-col gap-6 overflow-y-auto bg-surface-2 px-6 py-5 sm:flex-row">
          {/*
            Both codes, big enough to scan off the screen. The item code is
            this saree; the product code is the consignment it arrived in, and
            every piece in that consignment carries the same one.

            Stacked rather than side by side. Two of these in a row took 264px
            of a 640px dialog to show two numbers, and what paid for it was the
            column beside them — "Kalamkari Kashmiri Mul Mul Cotton Saree" came
            out as "Kalamkari Kashmiri Mul Mul C…". A panel whose whole job is
            telling you what a code is attached to cannot cut off the answer.
          */}
          <div className="flex flex-none flex-row gap-4 sm:flex-col">
            <Code label="Item" code={piece.itemCode} qr={piece.itemQr} onCopy={onCopy} />
            <Code
              label="Product"
              code={piece.productCode}
              qr={piece.productQr}
              onCopy={onCopy}
            />
          </div>

          <dl className="min-w-0 flex-1">
            {fields.map(([label, value]) => (
              <div
                key={label}
                className="flex gap-3 border-b border-rule py-1.5 last:border-b-0"
              >
                <dt className="w-28 flex-none text-[12.5px] text-muted">{label}</dt>
                {/*
                  Wraps rather than truncates — the opposite of the rule the
                  table follows, and for the opposite reason. A row truncates
                  so every row is the same height; a panel is read one at a
                  time, and a value it will not show in full is a value it has
                  failed to report.
                */}
                <dd className="min-w-0 flex-1 text-[13.5px] break-words text-ink">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <footer className="flex items-center gap-3 border-t border-rule px-6 py-3">
          <span className="text-[12.5px] text-muted">
            Attributes belong to the design. Change them in Product Records.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto rounded-lg border border-rule-2 bg-surface px-4 py-2 text-[13.5px] text-ink-2 hover:border-ink-2"
          >
            Close
          </button>
        </footer>
      </div>
    </div>
  );
}

function Code({
  label,
  code,
  qr,
  onCopy,
}: {
  label: string;
  code: string | null;
  qr: string | null;
  onCopy: (what: string, value: string | null) => void;
}) {
  return (
    <div className="text-center">
      {qr === null ? (
        <div className="flex size-[120px] items-center justify-center rounded border border-dashed border-rule-2 text-[12px] text-faint">
          None
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={qr}
          alt={`QR code for ${code}`}
          width={120}
          height={120}
          className="rounded bg-white p-1.5"
        />
      )}
      <button
        type="button"
        onClick={() => onCopy(`${label} code`, code)}
        title={`Copy the ${label.toLowerCase()} code`}
        className="mt-1.5 block w-[120px] truncate font-mono text-[12.5px] text-ink-2 hover:text-ink"
      >
        {code ?? "—"}
      </button>
      <span className="block text-[11px] text-faint">{label}</span>
    </div>
  );
}

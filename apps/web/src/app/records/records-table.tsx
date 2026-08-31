"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { colourSwatch, isPaleSwatch } from "@slk/domain";

import {
  HOME_INDUSTRY,
  type Options,
  type RecordDetail,
} from "@/lib/attributes";
import type { RecordRow } from "@/lib/records";

import { copyRecord, setRecordField, type InlineField } from "./actions";
import { InlineLookupCell } from "./inline-cell";
import {
  MIN_COLUMN_WIDTH,
  useColumnWidths,
  useVisibleColumns,
} from "./column-widths";
import { ArchiveDialog, RecordEditor, type PickableLocation } from "./record-editor";

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
 *   Colour       "Dark Olive Green", plus its swatch
 */
const COLUMNS = [
  { key: "name", label: "Product", width: 400 },
  { key: "productType", label: "Product Type", width: 130 },
  { key: "subType", label: "Product Sub Type", width: 138 },
  { key: "productionMethod", label: "Production Method", width: 150 },
  { key: "fibreType", label: "Fiber Type", width: 178 },
  { key: "regionalStyle", label: "Region Style", width: 126 },
  { key: "craftTechnique", label: "Craft Technique", width: 148 },
  { key: "productCode", label: "Product Code", width: 118 },
  { key: "code", label: "Design Code", width: 150 },
  { key: "audienceType", label: "Audience", width: 96 },
  { key: "colour", label: "Colour", width: 150 },

  // Everything else the design carries. Available in the Columns menu rather
  // than shown by default — eighteen columns at once is not a table anyone
  // reads, but which eighteen matter is the reader's business, not mine.
  { key: "subFamily", label: "Sub Family", width: 120 },
  { key: "weaveStructure", label: "Weave Structure", width: 140 },
  { key: "fabricType", label: "Fabric Type", width: 116 },
  { key: "craftSubType", label: "Craft Sub Type", width: 210 },
  { key: "motifCategory", label: "Motif Category", width: 140 },
  { key: "motif", label: "Motif", width: 120 },
  { key: "motifCode", label: "Motif Code", width: 104 },
  { key: "borderHeight", label: "Border Height", width: 124 },
  { key: "palluDesign", label: "Pallu Design", width: 126 },
  { key: "blouseAvailable", label: "Blouse Availability", width: 148 },
  { key: "descriptor", label: "Descriptor", width: 112 },

  { key: "quantity", label: "Quantity", width: 88 },
  { key: "price", label: "Unit Price", width: 110 },
] as const;

type ColumnKey = (typeof COLUMNS)[number]["key"];

/**
 * Craft Technique and Region Style start hidden because the Product column
 * already reads "Soft Kantha Work Gadwal Sico Saree" — the craft and the
 * region are in the name. Both are one tick away in the Columns menu.
 */
const OFF_BY_DEFAULT = new Set<ColumnKey>([
  "craftTechnique",
  "regionalStyle",
  "subFamily",
  "weaveStructure",
  "fabricType",
  "craftSubType",
  "motifCategory",
  "motif",
  "borderHeight",
  "palluDesign",
  "blouseAvailable",
  "descriptor",
  "motifCode",
]);

const NUMERIC = new Set<ColumnKey>(["quantity", "price"]);

/**
 * Columns that can be changed in place, and the Master List each draws from.
 *
 * Nothing here is a hard-coded list of values — only which lookup a column
 * belongs to. The values themselves come from `loadOptions`, which returns
 * Active ones only, so a retired value stops being choosable while records
 * already carrying it keep reading correctly.
 *
 * Product, Design Code, Quantity and Price are absent on purpose: the first
 * two are composed or frozen, the third comes from the ledger, and the last
 * is a number rather than a choice.
 */
const INLINE_COLUMNS: Partial<
  Record<ColumnKey, { field: InlineField; list: string }>
> = {
  productType: { field: "productType", list: "product_type" },
  subType: { field: "subType", list: "garment_type" },
  productionMethod: { field: "productionMethod", list: "production_method" },
  fibreType: { field: "fibreType", list: "fibre_type" },
  regionalStyle: { field: "regionalStyle", list: "regional_style" },
  craftTechnique: { field: "craftTechnique", list: "craft_technique" },
  audienceType: { field: "audienceType", list: "audience_type" },
  weaveStructure: { field: "weaveStructure", list: "weave_structure" },
  fabricType: { field: "fabricType", list: "fabric_type" },
  craftSubType: { field: "craftSubType", list: "craft_sub_type" },
  motifCategory: { field: "motifCategory", list: "motif_category" },
  motif: { field: "motif", list: "motif" },
  borderHeight: { field: "borderHeight", list: "border_height" },
  palluDesign: { field: "palluDesign", list: "pallu_design" },
  blouseAvailable: { field: "blouseAvailable", list: "blouse_available" },
  descriptor: { field: "descriptor", list: "descriptor" },

  // Sub Family is deliberately absent. It reads from two columns — Silk Sub
  // Family and Cotton Sub Family — so which one a change should write to
  // depends on the record's fibre. It can be shown; changing it in place
  // would need that rule, and the editor already has it.
};

/** Six icon buttons at ~25px plus gaps and cell padding. */
const ACTIONS_WIDTH = 190;

const PER_PAGE = 25;

function cell(row: RecordRow, key: ColumnKey): string {
  switch (key) {
    case "price":
      return row.priceMinor === null ? "" : money(row.priceMinor);
    case "quantity":
      return String(row.quantity);
    case "colour":
      return row.colour ?? "";
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

/** The tabs the editor can be opened straight onto from a row action. */
type EditorTab = "basic" | "prices" | "images" | "stock";

export function RecordsTable({
  rows,
  industries,
  options,
  locations,
}: {
  rows: RecordRow[];
  industries: string[];
  options: Options;
  locations: PickableLocation[];
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
   * Which row is being acted on, so the click has something to show for
   * itself straight away.
   *
   * The fetch below takes a moment against a warm server and several seconds
   * against a cold one. All the click used to do in that time was dim every
   * icon in the table by sixty percent — feedback so faint it read as a dead
   * button, and since the buttons were also disabled, clicking again did
   * nothing and confirmed the impression. A click has to produce something
   * the eye catches, immediately, or it has not worked.
   */
  const [opening, setOpening] = useState<{
    id: string;
    action: RowAction;
  } | null>(null);

  /**
   * A record is fetched when it is opened rather than shipped with the table.
   * Eighteen rows would be fine; four thousand, each with a stock summary and
   * eight movements, would not.
   */
  const open = (id: string, action: RowAction, tab: EditorTab) => {
    setOpening({ id, action });

    startLoading(async () => {
      try {
        const response = await fetch(`/records/${id}`);

        if (!response.ok) {
          setToast("Could not open that record.");
          return;
        }

        setEditing({ record: (await response.json()) as RecordDetail, tab });
      } catch {
        // A dropped connection used to leave the row spinning for ever with
        // nothing said.
        setToast("Could not reach the server. Check your connection.");
      } finally {
        setOpening(null);
      }
    });
  };

  /** The row whose inline edit is in flight, so its cells can dim. */
  const [saving, setSaving] = useState<string | null>(null);

  /**
   * Changes one field on one row, in place.
   *
   * Straight to the server rather than optimistically: an attribute lives on
   * the design, so a change can reach sibling rows this table is also
   * showing, and guessing at that locally would put the screen out of step
   * with the database on exactly the cases that matter.
   */
  const edit = (id: string, field: InlineField, valueId: string | null) => {
    setSaving(id);

    startLoading(async () => {
      try {
        const result = await setRecordField(id, field, valueId);
        setToast(result.message);
        if (result.ok) router.refresh();
      } finally {
        setSaving(null);
      }
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
  /**
   * Chosen values per column, rather than one value per column.
   *
   * "Saree or Dupatta" is a question people actually have, and a single-value
   * filter cannot answer it. An empty or absent array means the column is not
   * filtering.
   */
  const [filters, setFilters] = useState<Partial<Record<ColumnKey, string[]>>>(
    {},
  );
  const [showFilters, setShowFilters] = useState(false);
  /** A column whose filter should be open when the panel appears. */
  const [focusFilter, setFocusFilter] = useState<ColumnKey | null>(null);

  const setColumnFilter = (key: ColumnKey) => {
    setFocusFilter(key);
    setShowFilters(true);
  };
  const {
    visible,
    setVisible,
    reset: resetColumns,
    chosen: columnsChosen,
  } = useVisibleColumns(
    () => new Set(COLUMNS.map((c) => c.key).filter((k) => !OFF_BY_DEFAULT.has(k))),
  );
  const [showColumns, setShowColumns] = useState(false);
  const [sort, setSort] = useState<{ key: ColumnKey; dir: 1 | -1 } | null>(null);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);

  const columns = COLUMNS.filter((c) => visible.has(c.key));

  const { widths, setWidth, reset: resetWidths, resized } = useColumnWidths();

  /** A dragged width if there is one, otherwise the width the column was designed at. */
  const widthOf = (c: { key: ColumnKey; width: number }) =>
    widths[c.key] ?? c.width;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    let out = rows.filter((row) => {
      if (industry !== "" && row.industry !== industry) return false;

      for (const [key, want] of Object.entries(filters)) {
        if (want === undefined || want.length === 0) continue;
        if (!want.includes(cell(row, key as ColumnKey))) return false;
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
    ([, v]) => v !== undefined && v.length > 0,
  ) as [ColumnKey, string[]][];

  /** Distinct values actually present, so a filter can never return nothing. */
  const valuesFor = (key: ColumnKey): string[] => {
    if (NUMERIC.has(key)) return [];
    return [...new Set(rows.map((r) => cell(r, key)).filter((v) => v !== ""))].sort();
  };

  return (
    /*
      The grid fills the window rather than shrinking to its rows.

      Two reasons, and the second is the one that matters. A table sized to
      its content leaves a field of empty ground below it, which reads as the
      page having stopped early. But at twenty-five rows a page the column
      headings also scrolled off the top, so by the time you were reading the
      rows that needed identifying you could no longer see what the columns
      were.

      Giving the grid a definite height lets the body scroll inside it with
      the headings pinned, and keeps the record count and the pager where they
      were put instead of wherever the last row happens to end.
    */
    <div className="flex h-screen flex-col overflow-hidden px-8 py-8">
      <header className="mb-5 flex flex-none flex-wrap items-end gap-3">
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
            onClick={() => setShowFilters((v) => !v)}
            aria-expanded={showFilters}
            className={`rounded-lg border px-3 py-2 text-[13.5px] ${
              activeFilters.length > 0
                ? "border-brick bg-brick-soft text-brick"
                : "border-rule-2 bg-surface text-ink-2 hover:border-ink-2"
            }`}
          >
            Filter
            {activeFilters.length > 0 && (
              <span className="ml-1.5 font-mono text-[12px] tabular-nums">
                {activeFilters.length}
              </span>
            )}
          </button>

          {showFilters && (
            <FilterPanel
              columns={COLUMNS.filter((c) => !NUMERIC.has(c.key))}
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
              openColumn={focusFilter}
              onClose={() => {
                setShowFilters(false);
                setFocusFilter(null);
              }}
            />
          )}
        </div>

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
              <div className="absolute right-0 z-20 mt-1 flex max-h-[calc(100vh-9rem)] w-56 flex-col overflow-y-auto rounded-lg border border-rule-2 bg-surface p-2 shadow-lg">
              {COLUMNS.map((c) => (
                <label
                  key={c.key}
                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-[13px] text-ink-2 hover:bg-surface-2"
                >
                  <input
                    type="checkbox"
                    checked={visible.has(c.key)}
                    onChange={() => {
                      const next = new Set(visible);
                      if (next.has(c.key)) next.delete(c.key);
                      else next.add(c.key);
                      // Never all off. An empty table with the only way back
                      // hidden in a menu is a corner nobody should be able to
                      // paint themselves into.
                      if (next.size > 0) setVisible(next);
                    }}
                    className="accent-[var(--brick)]"
                  />
                  {c.label}
                </label>
              ))}

              {/*
                A way back. Widths are dragged and remembered, so a layout can
                be left in a state its owner does not want and cannot undo by
                reloading — which is the trap of persisting anything.
              */}
              {(resized || columnsChosen) && (
                <>
                  <span className="my-1 block border-t border-rule" />
                  {columnsChosen && (
                    <button
                      type="button"
                      onClick={() => {
                        resetColumns();
                        setShowColumns(false);
                      }}
                      className="w-full rounded px-2 py-1.5 text-left text-[13px] text-ink-2 hover:bg-surface-2"
                    >
                      Reset to the default columns
                    </button>
                  )}
                  {resized && (
                    <button
                      type="button"
                      onClick={() => {
                        resetWidths();
                        setShowColumns(false);
                      }}
                      className="w-full rounded px-2 py-1.5 text-left text-[13px] text-ink-2 hover:bg-surface-2"
                    >
                      Reset column widths
                    </button>
                  )}
                </>
              )}
              </div>
            </>
          )}
        </div>
      </header>

      {activeFilters.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {activeFilters.map(([key, values]) => (
            <button
              key={key}
              type="button"
              onClick={() =>
                setFilters((prev) => {
                  const { [key]: _drop, ...rest } = prev;
                  return rest;
                })
              }
              title={values.join(", ")}
              className="rounded-full border border-brick bg-brick-soft px-3 py-1 text-[12px] text-brick"
            >
              {COLUMNS.find((c) => c.key === key)?.label}:{" "}
              {/* Two names fit; five do not, and "5 values" with the list on
                  hover beats a chip that wraps onto three lines. */}
              {values.length <= 2 ? values.join(", ") : `${values.length} values`} ✕
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

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-rule bg-surface">
        <div className="flex flex-none items-center gap-3 border-b border-rule px-4 py-2.5">
          <span className="text-[12.5px] text-muted">
            {filtered.length.toLocaleString("en-IN")} record
            {filtered.length === 1 ? "" : "s"}
            {industry && ` in ${industry}`}
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
                {columns.map((c) => {
                  const on = sort?.key === c.key;

                  return (
                    <th
                      key={c.key}
                      style={{ width: widthOf(c) }}
                      className={`group/th sticky top-0 z-20 border-b border-rule bg-surface px-3 py-2.5 text-left text-[12px] font-medium whitespace-nowrap text-muted ${
                        NUMERIC.has(c.key) ? "text-right" : ""
                      }`}
                    >
                      {/*
                        The header carries the column's name and its sort
                        state, and nothing else.

                        It used to also hold a filter dropdown showing its
                        current value, so ten columns meant the word "All"
                        printed ten times across the top of the table — and
                        "Product Type ↑ All" left the reader parsing which
                        part was the sort and which the filter. Filtering
                        moved to one control above the table; what stays here
                        is a dot saying this column is filtered, which is
                        information rather than a control.
                      */}
                      <button
                        type="button"
                        onClick={() =>
                          setSort((prev) =>
                            prev?.key === c.key
                              ? { key: c.key, dir: prev.dir === 1 ? -1 : 1 }
                              : { key: c.key, dir: 1 },
                          )
                        }
                        aria-label={`Sort by ${c.label}`}
                        className={`group flex w-full items-center gap-1 hover:text-ink ${
                          on ? "text-ink" : ""
                        } ${NUMERIC.has(c.key) ? "justify-end" : ""}`}
                      >
                        {c.label}
                        <span
                          aria-hidden
                          // Only once it is sorted, or on hover. An arrow on
                          // every column at rest is the same clutter as "All"
                          // on every column.
                          className={
                            on
                              ? "text-brick"
                              : "opacity-0 transition-opacity group-hover:opacity-40"
                          }
                        >
                          {on ? (sort.dir > 0 ? "↑" : "↓") : "↕"}
                        </span>

                      </button>

                      {/*
                        The filter for this column, distinct from the cells
                        below it. A funnel belongs to the column and changes
                        which rows you see; the caret in a cell belongs to the
                        value and changes what a record says. They must not
                        look alike.

                        Shown when the column is filtered, and on hover
                        otherwise, so ten columns do not carry ten permanent
                        controls.
                      */}
                      {!NUMERIC.has(c.key) && valuesFor(c.key).length > 0 && (
                        <button
                          type="button"
                          onClick={() => setColumnFilter(c.key)}
                          aria-label={`Filter by ${c.label}`}
                          title={
                            (filters[c.key]?.length ?? 0) > 0
                              ? `Filtered: ${filters[c.key]?.join(", ")}`
                              : `Filter by ${c.label}`
                          }
                          className={`absolute top-1/2 right-3 -translate-y-1/2 rounded p-0.5 transition-opacity ${
                            (filters[c.key]?.length ?? 0) > 0
                              ? "text-brick opacity-100"
                              : "text-faint opacity-0 hover:text-ink-2 group-hover/th:opacity-100"
                          }`}
                        >
                          <svg
                            width="11"
                            height="11"
                            viewBox="0 0 12 12"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.4"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden
                          >
                            <path d="M1 2h10l-4 4.5V11L5 9.5V6.5z" />
                          </svg>
                        </button>
                      )}

                      <ResizeHandle
                        label={c.label}
                        width={widthOf(c)}
                        onResize={(w) => setWidth(c.key, w)}
                      />
                    </th>
                  );
                })}
                <th className="sticky top-0 z-20 w-[190px] border-b border-rule bg-surface px-4 py-2.5 text-right text-[12px] font-medium text-muted">
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
                    /*
                      The row opens the record.

                      It carried `cursor-pointer` and then only highlighted
                      itself, which promises something and delivers nothing.
                      The pencil stays for anyone reaching for it deliberately.

                      The cells that can be edited in place stop the click
                      before it gets here, so tapping Product Type still opens
                      its dropdown rather than the whole record. That is the
                      distinction the caret is there to signal: where you see
                      one, the cell answers; everywhere else, the row does.
                    */
                    onClick={() => {
                      setSelected(row.id);
                      open(row.id, "basic", "basic");
                    }}
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
                            <InlineLookupCell
                              value={row.colour}
                              options={options["colour"] ?? []}
                              busy={saving === row.id}
                              swatch={
                                <span
                                  aria-hidden
                                  className={`size-3.5 shrink-0 rounded-full ${
                                    isPaleSwatch(swatch)
                                      ? "border border-rule-2"
                                      : "border border-black/10"
                                  }`}
                                  style={{ background: swatch }}
                                />
                              }
                              onPick={(id) => edit(row.id, "colour", id)}
                            />
                          </Cell>
                        );
                      }

                      const inline = INLINE_COLUMNS[c.key];

                      if (inline !== undefined) {
                        // Product Type is two lists behind one column, and
                        // which one applies is decided by the record's
                        // industry — the same rule the editor follows.
                        const field =
                          c.key === "productType" && row.industry === HOME_INDUSTRY
                            ? "homeProductType"
                            : inline.field;

                        const list =
                          field === "homeProductType"
                            ? "home_product_type"
                            : inline.list;

                        return (
                          <Cell key={c.key} title={value || "Not set"}>
                            <InlineLookupCell
                              value={value === "" ? null : value}
                              options={options[list] ?? []}
                              busy={saving === row.id}
                              onPick={(id) => edit(row.id, field, id)}
                            />
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
                        // Only this row, not the whole table. One click used
                        // to grey out every action on every row, which looks
                        // like the page has broken rather than like one thing
                        // is loading.
                        busy={loading && opening?.id === row.id ? opening.action : null}
                        onAction={(action) => {
                          if (action === "delete") setArchiving(row);
                          else if (action === "copy") {
                            // Copy has no dialog to open, so the spinner on
                            // its own button is the only thing telling the
                            // reader the click landed.
                            setOpening({ id: row.id, action });
                            startLoading(async () => {
                              try {
                                const result = await copyRecord(row.id);

                                // A copy is not a usable record until it has
                                // a colour — that is the whole reason it
                                // exists. Landing back on the table with a
                                // blank swatch and no way to see where the
                                // colour is set is not finishing the job.
                                if (result.ok && result.colourwayId) {
                                  setToast(result.message);
                                  router.refresh();
                                  open(result.colourwayId, "basic", "basic");
                                  return;
                                }

                                done(result.message);
                              } finally {
                                setOpening(null);
                              }
                            });
                          } else open(row.id, action, action);
                        }}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-none items-center gap-2 border-t border-rule px-4 py-2.5">
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

      {/*
        The dialog appears on the click, not on the response.

        Everything else here is a consolation prize: a spinner still leaves
        the reader watching a table and wondering. Opening the frame straight
        away is the answer to "did that work" — the content arrives into a
        window that is already there.
      */}
      {opening !== null && editing === null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-ink/25" />
          <div
            role="dialog"
            aria-busy="true"
            aria-label="Opening record"
            style={{ height: "min(88vh, 680px)" }}
            className="relative flex w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-rule bg-surface shadow-2xl"
          >
            <header className="border-b border-rule px-6 py-5">
              <div className="h-5 w-64 animate-pulse rounded bg-surface-3" />
            </header>
            <div className="flex flex-1 flex-col gap-4 bg-surface-2 px-6 py-5">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="flex gap-4">
                  <div className="h-9 flex-1 animate-pulse rounded bg-surface-3" />
                  <div className="h-9 flex-1 animate-pulse rounded bg-surface-3" />
                </div>
              ))}
            </div>
            <footer className="border-t border-rule px-6 py-3 text-[13px] text-muted">
              Loading…
            </footer>
          </div>
        </div>
      )}

      {editing && (
        <RecordEditor
          record={editing.record}
          options={options}
          locations={locations}
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
  busy: RowAction | null;
  onAction: (action: RowAction) => void;
}) {
  return (
    <div className="flex items-center justify-end gap-0.5">
      {/*
        Only once something has actually been tagged.

        This read "0p" on every saree — a cryptic badge whose whole content
        was that there was nothing to report. A count of zero is the absence
        of the thing being counted, not a fact about it.
      */}
      {serialised && pieces > 0 && (
        <span
          className="mr-1 rounded bg-surface-3 px-1 font-mono text-[10px] text-muted"
          title={`${pieces} ${pieces === 1 ? "piece" : "pieces"} tagged with their own QR code`}
        >
          {pieces} tagged
        </span>
      )}
      {ACTIONS.map((a) => (
        <button
          key={a.key}
          type="button"
          title={a.title}
          aria-label={a.title}
          disabled={busy !== null}
          onClick={(e) => {
            e.stopPropagation();
            onAction(a.key);
          }}
          className={`rounded p-1.5 text-faint hover:bg-surface-3 disabled:opacity-40 ${
            a.key === "delete" ? "hover:text-brick" : "hover:text-ink"
          }`}
        >
          {busy === a.key ? (
            <svg
              width="16"
              height="16"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              className="animate-spin text-brick"
              aria-hidden
            >
              <path d="M10 2.5a7.5 7.5 0 1 0 7.5 7.5" />
            </svg>
          ) : (
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
          )}
        </button>
      ))}
    </div>
  );
}

/**
 * The grab strip on a column's right edge.
 *
 * Pointer events rather than mouse events, so a trackpad, a pen and a touch
 * screen all work, and so `setPointerCapture` keeps the drag alive when the
 * pointer leaves the four-pixel strip — which it does immediately, because
 * nobody drags in a straight line.
 *
 * The width is tracked in a ref during the drag and only committed on
 * release. Writing to localStorage on every pointermove would be a hundred
 * writes per drag for one useful value.
 */
function ResizeHandle({
  label,
  width,
  onResize,
}: {
  label: string;
  width: number;
  onResize: (width: number) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; width: number } | null>(null);
  const latest = useRef(width);

  return (
    <span
      role="separator"
      aria-orientation="vertical"
      aria-label={`Resize ${label} column`}
      // Focusable and nudgeable, because a drag is not available to everyone
      // and a column nobody can widen is the bug this was meant to fix.
      tabIndex={0}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 32 : 8;
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          onResize(width - step);
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          onResize(width + step);
        }
      }}
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        start.current = { x: e.clientX, width };
        latest.current = width;
        setDragging(true);
      }}
      onPointerMove={(e) => {
        if (start.current === null) return;
        latest.current = Math.max(
          MIN_COLUMN_WIDTH,
          start.current.width + (e.clientX - start.current.x),
        );
        onResize(latest.current);
      }}
      onPointerUp={(e) => {
        if (start.current === null) return;
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
        start.current = null;
        setDragging(false);
        onResize(latest.current);
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onResize(DEFAULT_WIDTHS[label] ?? width);
      }}
      title="Drag to resize. Double-click to reset this column."
      className={`absolute top-0 right-0 z-10 flex h-full w-2 cursor-col-resize touch-none items-center justify-center ${
        dragging ? "bg-brick/15" : "hover:bg-brick/10"
      }`}
    >
      <span
        aria-hidden
        className={`h-1/2 w-px ${dragging ? "bg-brick" : "bg-rule-2"}`}
      />
    </span>
  );
}

/** Label → the width the column was designed at, for double-click to reset. */
const DEFAULT_WIDTHS: Record<string, number> = Object.fromEntries(
  COLUMNS.map((c) => [c.label, c.width]),
);

/**
 * Every filter in one place, opened from one button.
 *
 * A dropdown per column header meant the word "All" printed across the top of
 * the table once per column, and left "Product Type ↑ All" to be parsed into
 * a name, a sort and a filter. Filtering is an occasional act on a screen
 * whose job is showing data, so it lives behind a control rather than in the
 * furniture.
 *
 * Multi-select, because "Saree or Dupatta" is a real question a single value
 * cannot answer. Applied as you tick rather than behind an Apply button —
 * the table is right there, and an Apply step adds a state that can be got
 * wrong.
 */
function FilterPanel({
  columns,
  valuesFor,
  filters,
  onChange,
  onClearAll,
  openColumn: initialColumn,
  onClose,
}: {
  columns: readonly { key: ColumnKey; label: string }[];
  valuesFor: (key: ColumnKey) => string[];
  filters: Partial<Record<ColumnKey, string[]>>;
  onChange: (key: ColumnKey, values: string[]) => void;
  onClearAll: () => void;
  openColumn: ColumnKey | null;
  onClose: () => void;
}) {
  const [openColumn, setOpenColumn] = useState<ColumnKey | null>(initialColumn);
  const [search, setSearch] = useState("");

  const active = Object.values(filters).filter((v) => (v?.length ?? 0) > 0).length;

  return (
    <>
      <button
        type="button"
        aria-label="Close filters"
        onClick={onClose}
        className="fixed inset-0 z-10 cursor-default"
      />

      <div className="absolute right-0 z-20 mt-1 max-h-[calc(100vh-9rem)] w-72 overflow-y-auto rounded-lg border border-rule-2 bg-surface p-2 shadow-lg">
        {columns.map((c) => {
          const chosen = filters[c.key] ?? [];
          const values = valuesFor(c.key);
          const isOpen = openColumn === c.key;

          if (values.length === 0) return null;

          const shown =
            search.trim() === "" || !isOpen
              ? values
              : values.filter((v) =>
                  v.toLowerCase().includes(search.trim().toLowerCase()),
                );

          return (
            <div key={c.key}>
              <button
                type="button"
                onClick={() => {
                  setOpenColumn(isOpen ? null : c.key);
                  setSearch("");
                }}
                aria-expanded={isOpen}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[13px] text-ink-2 hover:bg-surface-2"
              >
                <span className="flex-1 truncate">{c.label}</span>
                <span
                  className={`truncate text-[12px] ${
                    chosen.length > 0 ? "text-brick" : "text-faint"
                  }`}
                >
                  {chosen.length === 0
                    ? "All"
                    : chosen.length === 1
                      ? chosen[0]
                      : `${chosen.length} chosen`}
                </span>
                <span aria-hidden className="flex-none text-faint">
                  {isOpen ? "▴" : "▾"}
                </span>
              </button>

              {isOpen && (
                <div className="mb-1 ml-2 border-l border-rule pl-2">
                  {/*
                    Colour has forty-four values. Scrolling to find "Bottle
                    Green" is the sort of thing that makes people stop using a
                    filter at all.
                  */}
                  {values.length > 8 && (
                    <input
                      autoFocus
                      type="search"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder={`Search ${c.label.toLowerCase()}`}
                      className="mb-1 w-full rounded border border-rule-2 bg-surface px-2 py-1 text-[12.5px] text-ink placeholder:text-faint"
                    />
                  )}

                  <div className="max-h-52 overflow-y-auto">
                    {shown.length === 0 ? (
                      <p className="px-1 py-2 text-[12px] text-muted">
                        Nothing matches “{search}”.
                      </p>
                    ) : (
                      shown.map((v) => (
                        <label
                          key={v}
                          className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-[12.5px] text-ink-2 hover:bg-surface-2"
                        >
                          <input
                            type="checkbox"
                            checked={chosen.includes(v)}
                            onChange={() =>
                              onChange(
                                c.key,
                                chosen.includes(v)
                                  ? chosen.filter((x) => x !== v)
                                  : [...chosen, v],
                              )
                            }
                            className="accent-[var(--brick)]"
                          />
                          <span className="truncate">{v}</span>
                        </label>
                      ))
                    )}
                  </div>

                  {chosen.length > 0 && (
                    <button
                      type="button"
                      onClick={() => onChange(c.key, [])}
                      className="mt-1 px-1 text-[12px] text-muted hover:text-ink"
                    >
                      Clear {c.label}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {active > 0 && (
          <>
            <span className="my-1 block border-t border-rule" />
            <button
              type="button"
              onClick={onClearAll}
              className="w-full rounded px-2 py-1.5 text-left text-[13px] text-ink-2 hover:bg-surface-2"
            >
              Clear all filters
            </button>
          </>
        )}
      </div>
    </>
  );
}

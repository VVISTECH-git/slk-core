"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { colourSwatch, isPaleSwatch } from "@slk/domain";

import {
  Cell,
  ColumnsControl,
  FilterChips,
  FilterControl,
  HeaderCell,
  Pager,
  Toast,
  activeFilters,
  useColumnDrag,
  type Filters,
} from "@/components/grid";
import {
  HOME_INDUSTRY,
  type Options,
  type RecordDetail,
} from "@/lib/attributes";
import { useColumnOrder, useColumnWidths, useVisibleColumns } from "@/lib/column-widths";
import type { RecordRow } from "@/lib/records";

import { copyRecord, setRecordField, type InlineField } from "./actions";
import { InlineLookupCell } from "./inline-cell";
import { ArchiveDialog, RecordEditor, type PickableLocation } from "./record-editor";

/**
 * Product Management, as the prototype has it: twelve columns, each sortable and
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
  { key: "craftTechnique", label: "Craft Technique", width: 148 },
  { key: "productCode", label: "Product Code", width: 118 },
  { key: "code", label: "Design Code", width: 150 },
  { key: "audienceType", label: "Audience", width: 96 },
  { key: "colour", label: "Colour", width: 150 },

  // Everything else the design carries. Available in the Columns menu rather
  // than shown by default — eighteen columns at once is not a table anyone
  // reads, but which eighteen matter is the reader's business, not mine.
  { key: "textileMaterial", label: "Textile Material", width: 140 },
  { key: "weaveStructure", label: "Weave Structure", width: 140 },
  { key: "craftSubType", label: "Craft Sub Type", width: 210 },
  { key: "motifCategory", label: "Motif Category", width: 140 },
  { key: "motif", label: "Motif", width: 120 },
  { key: "motifCode", label: "Motif Code", width: 104 },
  { key: "borderHeight", label: "Border Height", width: 124 },
  { key: "palluDesign", label: "Pallu Design", width: 126 },
  { key: "blouseAvailable", label: "Blouse Availability", width: 148 },
  { key: "descriptor", label: "Descriptor", width: 112 },

  { key: "quantity", label: "Quantity", width: 88 },
  { key: "price", label: "Price per Qty", width: 128 },
  { key: "uom", label: "UOM", width: 84 },
] as const;

type ColumnKey = (typeof COLUMNS)[number]["key"];

/**
 * Module-level, so the stored-preference hooks are handed the same array
 * every render and can memoise against it.
 */
const COLUMN_KEYS: readonly string[] = COLUMNS.map((c) => c.key);

/**
 * Craft Technique and Region Style start hidden because the Product column
 * already reads "Soft Kantha Work Gadwal Sico Saree" — the craft and the
 * region are in the name. Both are one tick away in the Columns menu.
 */
const OFF_BY_DEFAULT = new Set<ColumnKey>([
  "craftTechnique",
  "textileMaterial",
  "weaveStructure",
  "craftSubType",
  "motifCategory",
  "motif",
  "borderHeight",
  "palluDesign",
  "blouseAvailable",
  "descriptor",
  "motifCode",
]);

const DEFAULT_VISIBLE: readonly string[] = COLUMN_KEYS.filter(
  (k) => !OFF_BY_DEFAULT.has(k as ColumnKey),
);

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
  craftTechnique: { field: "craftTechnique", list: "craft_technique" },
  audienceType: { field: "audienceType", list: "audience_type" },
  weaveStructure: { field: "weaveStructure", list: "weave_structure" },
  textileMaterial: { field: "textileMaterial", list: "textile_material" },
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

/**
 * Rupees, with the paise only when there are any.
 *
 * Prices are entered to two decimals now, so a flat maximumFractionDigits
 * of 0 was rounding 1249.50 to 1,250 on the one screen most likely to be
 * read as authoritative.
 */
export function money(minor: number): string {
  return `₹${(minor / 100).toLocaleString("en-IN", {
    minimumFractionDigits: minor % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
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
  const [filters, setFilters] = useState<Filters<ColumnKey>>({});
  const {
    visible,
    setVisible,
    reset: resetColumns,
    chosen: columnsChosen,
  } = useVisibleColumns("records", DEFAULT_VISIBLE);
  const [sort, setSort] = useState<{ key: ColumnKey; dir: 1 | -1 } | null>(null);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);

  const { widths, setWidth, reset: resetWidths, resized } = useColumnWidths("records");

  const {
    order,
    move,
    reset: resetOrder,
    ordered,
  } = useColumnOrder("records", COLUMN_KEYS);

  /** The order someone put them in, less the ones they have switched off. */
  const columns = order
    .map((key) => COLUMNS.find((c) => c.key === key))
    .filter((c): c is (typeof COLUMNS)[number] => c !== undefined && visible.has(c.key));

  const drag = useColumnDrag<ColumnKey>(
    columns.map((c) => c.key),
    move,
  );

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

  const active = activeFilters(filters);

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
      {/*
        Above the grid — the column headings are `sticky z-20`, and a menu at
        the same z-index loses to them because the table comes later in the
        document. See the same note on Stock Records.
      */}
      <header className="relative z-30 mb-5 flex flex-none flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h1 className="text-[24px] font-semibold tracking-tight text-ink">
            Product Management
          </h1>
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

        <FilterControl
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
                    onResize={(w) => setWidth(c.key, w)}
                    drag={drag}
                  />
                ))}
                <th
                  className={`sticky top-0 z-20 w-[190px] border-b border-rule bg-surface px-4 py-2.5 text-right text-[12px] font-medium text-muted ${
                    drag.active !== null && drag.before === "end"
                      ? "shadow-[inset_2px_0_0_0_var(--brick)]"
                      : ""
                  }`}
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
                      No records match
                    </p>
                    <p className="text-[13.5px] text-muted">
                      {industry || query || active.length
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

        <Pager
          total={filtered.length}
          page={current}
          perPage={PER_PAGE}
          onPage={setPage}
        />
      </div>

      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}

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

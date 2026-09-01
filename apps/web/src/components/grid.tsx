"use client";

import { useRef, useState } from "react";

import { MIN_COLUMN_WIDTH } from "@/lib/column-widths";

/**
 * The furniture the data grids are built from.
 *
 * Product Records and Stock Records answer different questions — "what do we
 * sell and how much is there" against "which saree is this" — but they are
 * the same instrument: a wide table with more columns than fit, sorted and
 * filtered and paged, whose widths someone drags to suit the job in front of
 * them.
 *
 * Shared rather than copied. Two tables that merely look alike drift apart on
 * the third change to one of them, and the drift shows up as a chip that is a
 * different shade of brick on one screen than the other — the sort of detail
 * nobody files a bug about and everybody notices.
 *
 * Generic over the column key so each table keeps its own literal union and
 * its own compiler errors; nothing here knows what a piece or a design is.
 */

export interface GridColumn<K extends string> {
  key: K;
  label: string;
  width: number;
}

/**
 * One rule for every cell: never wrap, truncate with an ellipsis, and carry
 * the whole value in the title so hovering reveals what was cut.
 *
 * Applied without exception. Letting one column wrap while its neighbours
 * truncate is what made "bottle green" and "Sico (Silk-Cotton Blend)" push
 * their rows taller than the rest.
 */
export function Cell({
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

/**
 * The header's sort control.
 *
 * The header carries the column's name and its sort state, and nothing else.
 * It used to also hold a filter dropdown showing its current value, so ten
 * columns meant the word "All" printed ten times across the top of the table
 * — and "Product Type ↑ All" left the reader parsing which part was the sort
 * and which the filter. Filtering moved to one control above the table.
 */
export function SortButton({
  label,
  dir,
  numeric,
  onToggle,
}: {
  label: string;
  /** null when this column is not the one being sorted by. */
  dir: 1 | -1 | null;
  numeric?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={`Sort by ${label}`}
      className={`group flex w-full items-center gap-1 hover:text-ink ${
        dir !== null ? "text-ink" : ""
      } ${numeric ? "justify-end" : ""}`}
    >
      {label}
      <span
        aria-hidden
        // Only once it is sorted, or on hover. An arrow on every column at
        // rest is the same clutter as "All" on every column.
        className={
          dir !== null
            ? "text-brick"
            : "opacity-0 transition-opacity group-hover:opacity-40"
        }
      >
        {dir === null ? "↕" : dir > 0 ? "↑" : "↓"}
      </span>
    </button>
  );
}

/**
 * The grab strip on a column's right edge.
 *
 * Pointer events rather than mouse events, so a trackpad, a pen and a touch
 * screen all work, and so `setPointerCapture` keeps the drag alive when the
 * pointer leaves the four-pixel strip — which it does immediately, because
 * nobody drags in a straight line.
 */
export function ResizeHandle({
  label,
  width,
  defaultWidth,
  onResize,
}: {
  label: string;
  width: number;
  /** Where a double-click puts it back to. */
  defaultWidth: number;
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
        onResize(defaultWidth);
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

/**
 * Which columns are shown, behind one button.
 *
 * Everything a row carries is available here rather than shown by default —
 * twenty columns at once is not a table anyone reads, but which twenty matter
 * is the reader's business.
 */
export function ColumnsControl<K extends string>({
  columns,
  visible,
  onChange,
  chosen,
  resized,
  onResetColumns,
  onResetWidths,
}: {
  columns: readonly GridColumn<K>[];
  visible: Set<string>;
  onChange: (next: Set<string>) => void;
  /** Whether the reader has picked columns, so a way back can be offered. */
  chosen: boolean;
  /** Whether any width has been dragged, same reason. */
  resized: boolean;
  onResetColumns: () => void;
  onResetWidths: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="rounded-lg border border-rule-2 bg-surface px-3 py-2 text-[13.5px] text-ink-2 hover:border-ink-2"
      >
        Columns
      </button>

      {open && (
        <>
          {/* Clicking anywhere else closes the menu, which is what every
              dropdown does and what people expect. */}
          <button
            type="button"
            aria-label="Close columns menu"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-10 cursor-default"
          />
          <div className="absolute right-0 z-20 mt-1 flex max-h-[calc(100vh-9rem)] w-56 flex-col overflow-y-auto rounded-lg border border-rule-2 bg-surface p-2 shadow-lg">
            {columns.map((c) => (
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
                    if (next.size > 0) onChange(next);
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
            {(resized || chosen) && (
              <>
                <span className="my-1 block border-t border-rule" />
                {chosen && (
                  <button
                    type="button"
                    onClick={() => {
                      onResetColumns();
                      setOpen(false);
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
                      onResetWidths();
                      setOpen(false);
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
  );
}

export type Filters<K extends string> = Partial<Record<K, string[]>>;

/** The columns actually filtering, in the order they were declared. */
export function activeFilters<K extends string>(
  filters: Filters<K>,
): [K, string[]][] {
  return Object.entries(filters).filter(
    ([, v]) => Array.isArray(v) && v.length > 0,
  ) as [K, string[]][];
}

/**
 * Every filter in one place, opened from one button.
 *
 * Multi-select, because "Saree or Dupatta" is a real question a single value
 * cannot answer. Applied as you tick rather than behind an Apply button —
 * the table is right there, and an Apply step adds a state that can be got
 * wrong.
 */
export function FilterControl<K extends string>({
  columns,
  valuesFor,
  filters,
  onChange,
  onClearAll,
}: {
  columns: readonly { key: K; label: string }[];
  valuesFor: (key: K) => string[];
  filters: Filters<K>;
  onChange: (key: K, values: string[]) => void;
  onClearAll: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [openColumn, setOpenColumn] = useState<K | null>(null);
  const [search, setSearch] = useState("");

  const active = activeFilters(filters);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`rounded-lg border px-3 py-2 text-[13.5px] ${
          active.length > 0
            ? "border-brick bg-brick-soft text-brick"
            : "border-rule-2 bg-surface text-ink-2 hover:border-ink-2"
        }`}
      >
        Filter
        {active.length > 0 && (
          <span className="ml-1.5 font-mono text-[12px] tabular-nums">
            {active.length}
          </span>
        )}
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Close filters"
            onClick={() => setOpen(false)}
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
                        Green" is the sort of thing that makes people stop using
                        a filter at all.
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

            {active.length > 0 && (
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
      )}
    </div>
  );
}

/** What is filtering, said above the table where it cannot be missed. */
export function FilterChips<K extends string>({
  columns,
  filters,
  onRemove,
  onClearAll,
}: {
  columns: readonly { key: K; label: string }[];
  filters: Filters<K>;
  onRemove: (key: K) => void;
  onClearAll: () => void;
}) {
  const active = activeFilters(filters);
  if (active.length === 0) return null;

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      {active.map(([key, values]) => (
        <button
          key={key}
          type="button"
          onClick={() => onRemove(key)}
          title={values.join(", ")}
          className="rounded-full border border-brick bg-brick-soft px-3 py-1 text-[12px] text-brick"
        >
          {columns.find((c) => c.key === key)?.label}:{" "}
          {/* Two names fit; five do not, and "5 values" with the list on
              hover beats a chip that wraps onto three lines. */}
          {values.length <= 2 ? values.join(", ") : `${values.length} values`} ✕
        </button>
      ))}
      <button
        type="button"
        onClick={onClearAll}
        className="text-[12.5px] text-muted hover:text-ink"
      >
        Clear All
      </button>
    </div>
  );
}

export function PageButton({
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
 * How far through the rows you are, and the way to the rest of them.
 *
 * Pinned to the bottom of the grid rather than following the last row, so it
 * stays where it was put whatever the page happens to hold.
 */
export function Pager({
  total,
  page,
  perPage,
  onPage,
}: {
  total: number;
  /** One-based, and already clamped to the number of pages by the caller. */
  page: number;
  perPage: number;
  onPage: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / perPage));
  const from = (page - 1) * perPage;

  return (
    <div className="flex flex-none items-center gap-2 border-t border-rule px-4 py-2.5">
      <span className="text-[12.5px] text-muted">
        Showing {total === 0 ? 0 : from + 1}–{Math.min(from + perPage, total)} of{" "}
        {total.toLocaleString("en-IN")}
      </span>

      {pages > 1 && (
        <span className="ml-auto flex items-center gap-1">
          <PageButton disabled={page === 1} onClick={() => onPage(page - 1)}>
            ‹
          </PageButton>
          {Array.from({ length: Math.min(5, pages) }, (_, i) => {
            const lo = Math.max(1, Math.min(page - 2, pages - 4));
            return lo + i;
          })
            .filter((n) => n >= 1 && n <= pages)
            .map((n) => (
              <PageButton key={n} on={n === page} onClick={() => onPage(n)}>
                {n}
              </PageButton>
            ))}
          <PageButton
            disabled={page === pages}
            onClick={() => onPage(page + 1)}
          >
            ›
          </PageButton>
        </span>
      )}
    </div>
  );
}

export function Toast({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss: () => void;
}) {
  return (
    <div
      role="status"
      /*
        Above the dialogs, not below them.

        At z-40 this sat under the record editor and the piece panel, both of
        which are z-50 and both of which cover the viewport with a scrim — so a
        toast raised from inside one came out dimmed by 25% black. Copying a
        code from the piece panel produced its only feedback behind a grey
        wash. A toast is the newest and shortest-lived thing on the screen; it
        should never be the thing that loses.
      */
      className="fixed bottom-6 left-1/2 z-60 -translate-x-1/2 rounded-lg border border-rule bg-surface px-4 py-2.5 text-[13.5px] text-ink shadow-lg"
    >
      {message}
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="ml-3 text-muted hover:text-ink"
      >
        ✕
      </button>
    </div>
  );
}

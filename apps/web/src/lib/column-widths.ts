"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

/**
 * What someone has done to a grid's columns — how wide they are, which of them
 * show, and the order they sit in — remembered in localStorage.
 *
 * Per browser rather than per account, because there are no accounts yet and
 * because these are working preferences rather than decisions about the data.
 * They survive a reload and do not follow anyone to another machine, which is
 * the honest scope of them.
 *
 * Namespaced per grid. Product Records and Stock Records are both tables with
 * a Columns menu, and sharing one slot would mean ticking "Motif" on one of
 * them hid every column on the other — the stored list is a list of keys, and
 * one table's keys mean nothing to the other.
 *
 * Read through `useSyncExternalStore` rather than copied into state by an
 * effect. localStorage is an external store, and the effect version had to
 * render once with the defaults and again with the stored values — a wasted
 * render, a visible flash of the wrong layout on every load, and no way to
 * notice a write made by another tab or by the other hook on this page.
 *
 * The snapshot is the raw string, not the parsed value. `useSyncExternalStore`
 * compares snapshots with `Object.is`, and a freshly parsed object is never
 * equal to the last one — which is an infinite render loop rather than a
 * subtle inefficiency. Strings compare by value, so parsing happens in a memo
 * keyed on the string instead.
 */

/** Narrow enough to get out of the way, wide enough to still be grabbable. */
export const MIN_COLUMN_WIDTH = 64;

export type ColumnWidths = Record<string, number>;

/** Everyone watching a given key, so a write in one hook reaches the others. */
const listeners = new Map<string, Set<() => void>>();

function readRaw(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    // Private windows, blocked site data, or something else in the slot.
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Not remembering the change is better than failing to make it.
  }

  // Announced even when the write threw. The change still has to reach the
  // screen: a control that appears to do nothing is worse than one that
  // works now and forgets by tomorrow.
  listeners.get(key)?.forEach((notify) => notify());
}

function subscribe(key: string, notify: () => void): () => void {
  let watching = listeners.get(key);
  if (watching === undefined) {
    watching = new Set();
    listeners.set(key, watching);
  }
  watching.add(notify);

  // Another tab writing the same key. `storage` does not fire in the tab that
  // made the change, which is what the set above is for.
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === key) notify();
  };
  window.addEventListener("storage", onStorage);

  return () => {
    watching.delete(notify);
    window.removeEventListener("storage", onStorage);
  };
}

/** The server has no localStorage, so it always sees the defaults. */
const serverSnapshot = (): string | null => null;

function useStored(key: string): string | null {
  const listen = useCallback((notify: () => void) => subscribe(key, notify), [key]);
  const snapshot = useCallback(() => readRaw(key), [key]);

  return useSyncExternalStore(listen, snapshot, serverSnapshot);
}

/**
 * A stored list of column keys, or null when there is nothing usable there.
 *
 * An empty list counts as nothing: it would render a table of no columns at
 * all, with the only way back hidden in a menu the reader has to know about.
 */
function parseKeys(raw: string | null): string[] | null {
  if (raw === null) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;

    const keys = parsed.filter((k): k is string => typeof k === "string");
    return keys.length === 0 ? null : keys;
  } catch {
    return null;
  }
}

function parseWidths(raw: string | null): ColumnWidths {
  if (raw === null) return {};

  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};

    // Anything that is not a usable number is dropped rather than trusted:
    // this is the one input that survives a deploy, so a stale or hand-edited
    // value must not be able to collapse a column to nothing.
    const clean: ColumnWidths = {};
    for (const [name, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === "number" && Number.isFinite(value)) {
        clean[name] = Math.max(MIN_COLUMN_WIDTH, Math.round(value));
      }
    }
    return clean;
  } catch {
    return {};
  }
}

/**
 * Folds a stored order together with the columns that exist today.
 *
 * A stored list is a snapshot of the table as it was when someone last moved a
 * heading, and the table has moved on since. Keys that no longer exist are
 * dropped. Keys that are new go in at the index the table declares them at,
 * rather than on the end — a column someone deliberately put third should
 * appear third the first time you see it, not exiled past everything you have
 * ever reordered.
 */
function mergeOrder(stored: string[], defaults: readonly string[]): string[] {
  const known = new Set(defaults);
  const seen = new Set<string>();
  const out: string[] = [];

  for (const key of stored) {
    if (known.has(key) && !seen.has(key)) {
      out.push(key);
      seen.add(key);
    }
  }

  defaults.forEach((key, i) => {
    if (!seen.has(key)) out.splice(Math.min(i, out.length), 0, key);
  });

  return out;
}

/**
 * Which columns are shown.
 *
 * Stored as the list of visible keys rather than as a difference from the
 * default, so that adding a new column later does not silently switch it on
 * for everyone who has ever touched this menu.
 */
export function useVisibleColumns(
  namespace: string,
  /** The keys shown when nobody has chosen. Must be a stable reference. */
  defaults: readonly string[],
): {
  visible: Set<string>;
  setVisible: (next: Set<string>) => void;
  reset: () => void;
  chosen: boolean;
} {
  const key = `slk.${namespace}.columns`;
  const raw = useStored(key);

  // Keyed on the raw string, not recomputed inline: `parseKeys` builds a new
  // array every call, so memoising on its result would memoise nothing and
  // hand out a new Set on every render.
  const stored = useMemo(() => parseKeys(raw), [raw]);

  const visible = useMemo(() => new Set(stored ?? defaults), [stored, defaults]);

  const setVisible = useCallback(
    (next: Set<string>) => write(key, JSON.stringify([...next])),
    [key],
  );

  const reset = useCallback(() => write(key, null), [key]);

  return { visible, setVisible, reset, chosen: stored !== null };
}

/**
 * The order the columns sit in, if someone has moved them.
 *
 * Held over every column rather than only the visible ones, so hiding a
 * column and showing it again puts it back where it was rather than on the
 * end. `move` therefore takes the key to land *before* rather than an index —
 * an index into the visible columns means nothing to a list that also holds
 * the hidden ones.
 */
export function useColumnOrder(
  namespace: string,
  /** Every column key, in the order the table declares them. Must be stable. */
  defaults: readonly string[],
): {
  order: string[];
  move: (key: string, before: string | "end") => void;
  reset: () => void;
  ordered: boolean;
} {
  const key = `slk.${namespace}.columnOrder`;
  const raw = useStored(key);

  // Keyed on the raw string, for the reason given in useVisibleColumns.
  const stored = useMemo(() => parseKeys(raw), [raw]);

  const order = useMemo(
    () => (stored === null ? [...defaults] : mergeOrder(stored, defaults)),
    [stored, defaults],
  );

  const move = useCallback(
    (moved: string, before: string | "end") => {
      if (moved === before) return;

      // Read back rather than closing over `order`, so the callback keeps one
      // identity for the life of the grid and cannot act on a stale list.
      const held = parseKeys(readRaw(key));
      const current = held === null ? [...defaults] : mergeOrder(held, defaults);

      if (!current.includes(moved)) return;

      const next = current.filter((k) => k !== moved);
      const at = before === "end" ? next.length : next.indexOf(before);
      if (at === -1) return;

      next.splice(at, 0, moved);
      write(key, JSON.stringify(next));
    },
    [defaults, key],
  );

  const reset = useCallback(() => write(key, null), [key]);

  return { order, move, reset, ordered: stored !== null };
}

export function useColumnWidths(namespace: string): {
  widths: ColumnWidths;
  setWidth: (key: string, width: number) => void;
  reset: () => void;
  resized: boolean;
} {
  const key = `slk.${namespace}.columnWidths`;
  const raw = useStored(key);

  const widths = useMemo(() => parseWidths(raw), [raw]);

  const setWidth = useCallback(
    (column: string, width: number) => {
      // Read back for the same reason `move` does: this one is called on every
      // pointermove of a drag, and a callback that changed identity each time
      // would be rebuilt a hundred times on the way across a column.
      const next = {
        ...parseWidths(readRaw(key)),
        [column]: Math.max(MIN_COLUMN_WIDTH, Math.round(width)),
      };

      write(key, JSON.stringify(next));
    },
    [key],
  );

  const reset = useCallback(() => write(key, null), [key]);

  return { widths, setWidth, reset, resized: Object.keys(widths).length > 0 };
}

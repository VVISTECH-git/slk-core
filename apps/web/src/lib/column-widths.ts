"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

/**
 * Column widths and column choices someone has made, remembered for them.
 *
 * The defaults are sized to the longest value each column actually holds,
 * which is right for the catalogue in general and wrong for whoever is
 * working on one part of it today — someone checking design codes wants that
 * column wide and does not care about Production Method.
 *
 * Per browser rather than per account, because there are no accounts yet and
 * because a column width is a working preference rather than a decision about
 * the data. It survives reloads and does not follow anyone to another
 * machine, which is the honest scope of it.
 *
 * Namespaced per grid. Product Records and Stock Records are both tables with
 * a Columns menu, and sharing one slot would mean ticking "Motif" on one of
 * them hid every column on the other — the stored list is a list of keys, and
 * one table's keys mean nothing to the other.
 */

/** Narrow enough to get out of the way, wide enough to still be grabbable. */
export const MIN_COLUMN_WIDTH = 64;

export type ColumnWidths = Record<string, number>;

function widthsKey(namespace: string): string {
  return `slk.${namespace}.columnWidths`;
}

function columnsKey(namespace: string): string {
  return `slk.${namespace}.columns`;
}

function read(key: string): ColumnWidths {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return {};

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
    // Private windows, blocked site data, or something else in the slot.
    return {};
  }
}

/**
 * Which columns someone has chosen to see.
 *
 * Remembered for the same reason widths are, and more urgently: there are
 * twenty-three columns now and only ten showing by default. Someone who
 * works on motifs wants a different ten from someone checking prices, and
 * re-ticking eight boxes on every reload is the kind of small tax that makes
 * people stop using the feature.
 *
 * Stored as the list of visible keys rather than a diff from the default, so
 * that adding a new column later does not silently switch it on for everyone
 * who has ever touched this menu.
 */
export function useVisibleColumns(
  namespace: string,
  fallback: () => Set<string>,
): {
  visible: Set<string>;
  setVisible: (next: Set<string>) => void;
  reset: () => void;
  chosen: boolean;
} {
  const key = useMemo(() => columnsKey(namespace), [namespace]);

  // The default on the server and on the first client render, so the markup
  // matches; a stored choice applies immediately after.
  const [visible, setState] = useState<Set<string>>(fallback);
  const [chosen, setChosen] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw === null) return;

      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;

      const keys = parsed.filter((k): k is string => typeof k === "string");
      // An empty stored list would render a table of nothing, with the only
      // way out being a menu the reader has to know is there.
      if (keys.length === 0) return;

      setState(new Set(keys));
      setChosen(true);
    } catch {
      // Private windows, blocked site data, or something else in the slot.
    }
  }, [key]);

  const setVisible = useCallback(
    (next: Set<string>) => {
      setState(next);
      setChosen(true);
      try {
        window.localStorage.setItem(key, JSON.stringify([...next]));
      } catch {
        // Not remembering the choice is better than failing to make it.
      }
    },
    [key],
  );

  const reset = useCallback(() => {
    setState(fallback());
    setChosen(false);
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Same again.
    }
  }, [fallback, key]);

  return { visible, setVisible, reset, chosen };
}

/**
 * Folds a stored order together with the columns that exist today.
 *
 * A stored list is a snapshot of the table as it was when someone last
 * dragged a heading, and the table has moved on since: columns get added and
 * removed, and a key that means nothing now must not survive as a gap.
 *
 * Keys that no longer exist are dropped. Keys that are new go in at the index
 * the table declares them at, rather than on the end — a column someone
 * deliberately put third should appear third the first time you see it, not
 * exiled past everything you have ever reordered.
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
  const key = useMemo(() => `slk.${namespace}.columnOrder`, [namespace]);

  const [order, setOrder] = useState<string[]>(() => [...defaults]);
  const [ordered, setOrdered] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw === null) return;

      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;

      const stored = parsed.filter((k): k is string => typeof k === "string");
      if (stored.length === 0) return;

      setOrder(mergeOrder(stored, defaults));
      setOrdered(true);
    } catch {
      // Private windows, blocked site data, or something else in the slot.
    }
  }, [key, defaults]);

  const move = useCallback(
    (moved: string, before: string | "end") => {
      setOrder((prev) => {
        if (moved === before) return prev;
        if (prev.indexOf(moved) === -1) return prev;

        const next = prev.filter((k) => k !== moved);
        const at = before === "end" ? next.length : next.indexOf(before);
        if (at === -1) return prev;

        next.splice(at, 0, moved);

        try {
          window.localStorage.setItem(key, JSON.stringify(next));
        } catch {
          // Not remembering the move is better than failing to make it.
        }

        return next;
      });

      setOrdered(true);
    },
    [key],
  );

  const reset = useCallback(() => {
    setOrder([...defaults]);
    setOrdered(false);
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Same again.
    }
  }, [defaults, key]);

  return { order, move, reset, ordered };
}

export function useColumnWidths(namespace: string): {
  widths: ColumnWidths;
  setWidth: (key: string, width: number) => void;
  reset: () => void;
  resized: boolean;
} {
  const key = useMemo(() => widthsKey(namespace), [namespace]);

  // Empty on the server and on the first client render, so the markup matches
  // and hydration does not complain; the stored widths apply immediately
  // after.
  const [widths, setWidths] = useState<ColumnWidths>({});

  useEffect(() => setWidths(read(key)), [key]);

  // Keyed on the namespace, which does not change for the life of a grid, so
  // `setWidth` keeps a stable identity across a drag — it is called on every
  // pointermove.
  const setWidth = useCallback(
    (column: string, width: number) => {
      setWidths((prev) => {
        const next = {
          ...prev,
          [column]: Math.max(MIN_COLUMN_WIDTH, Math.round(width)),
        };
        try {
          window.localStorage.setItem(key, JSON.stringify(next));
        } catch {
          // Not remembering it is better than failing to set it.
        }
        return next;
      });
    },
    [key],
  );

  const reset = useCallback(() => {
    setWidths({});
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Same again.
    }
  }, [key]);

  return { widths, setWidth, reset, resized: Object.keys(widths).length > 0 };
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Column widths someone has dragged, remembered for them.
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
 */

const KEY = "slk.records.columnWidths";

/** Narrow enough to get out of the way, wide enough to still be grabbable. */
export const MIN_COLUMN_WIDTH = 64;

export type ColumnWidths = Record<string, number>;

function read(): ColumnWidths {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw === null) return {};

    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};

    // Anything that is not a usable number is dropped rather than trusted:
    // this is the one input that survives a deploy, so a stale or hand-edited
    // value must not be able to collapse a column to nothing.
    const clean: ColumnWidths = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === "number" && Number.isFinite(value)) {
        clean[key] = Math.max(MIN_COLUMN_WIDTH, Math.round(value));
      }
    }
    return clean;
  } catch {
    // Private windows, blocked site data, or something else in the slot.
    return {};
  }
}

export function useColumnWidths(): {
  widths: ColumnWidths;
  setWidth: (key: string, width: number) => void;
  reset: () => void;
  resized: boolean;
} {
  // Empty on the server and on the first client render, so the markup matches
  // and hydration does not complain; the stored widths apply immediately
  // after.
  const [widths, setWidths] = useState<ColumnWidths>({});

  useEffect(() => setWidths(read()), []);

  const persist = useRef((next: ColumnWidths) => {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // Not remembering it is better than failing to set it.
    }
  });

  const setWidth = useCallback((key: string, width: number) => {
    setWidths((prev) => {
      const next = { ...prev, [key]: Math.max(MIN_COLUMN_WIDTH, Math.round(width)) };
      persist.current(next);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    setWidths({});
    try {
      window.localStorage.removeItem(KEY);
    } catch {
      // Same again.
    }
  }, []);

  return { widths, setWidth, reset, resized: Object.keys(widths).length > 0 };
}

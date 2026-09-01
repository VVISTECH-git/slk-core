"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import type { Option } from "@/lib/attributes";

/**
 * A table cell that can be changed without opening the record.
 *
 * Changing Saree to Dupatta should not cost a six-tab dialog. But a grid
 * whose every cell looks like a form control stops reading as data, so at
 * rest this is ordinary text; the affordance appears on hover, and the
 * control only exists once it is asked for.
 *
 * Deliberately different from the filter in the header above it. That one
 * changes which rows you see; this one changes what a record says. They are
 * opposite kinds of act and must not look alike — hence a caret that belongs
 * to the value, against a funnel that belongs to the column.
 */
export function InlineLookupCell({
  value,
  options,
  disabled,
  disabledReason,
  swatch,
  onPick,
  busy,
}: {
  /** The label as it currently reads, or null for unset. */
  value: string | null;
  /** Choosable values, from Operational Standard. Retired ones are not among them. */
  options: Option[];
  disabled?: boolean;
  disabledReason?: string;
  swatch?: React.ReactNode;
  onPick: (valueId: string | null) => void;
  busy?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const anchor = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!open) return;

    // Drawn into the body, because the table scrolls inside a container with
    // overflow set — an absolutely positioned popover is clipped by it, which
    // is exactly what went wrong with the row menu.
    const r = anchor.current?.getBoundingClientRect();
    if (r) {
      const height = menu.current?.offsetHeight ?? 260;
      const below = window.innerHeight - r.bottom;
      setAt({
        top: below < height + 8 ? Math.max(8, r.top - height - 4) : r.bottom + 4,
        left: Math.max(8, Math.min(r.left, window.innerWidth - 232)),
      });
    }

    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (anchor.current?.contains(t) || menu.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function away() {
      setOpen(false);
    }

    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", away, true);
    window.addEventListener("resize", away);

    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", away, true);
      window.removeEventListener("resize", away);
    };
  }, [open]);

  if (disabled === true) {
    return (
      <span title={disabledReason} className="flex items-center gap-1.5">
        {swatch}
        <span className="truncate">{value ?? "—"}</span>
      </span>
    );
  }

  const shown =
    search.trim() === ""
      ? options
      : options.filter((o) =>
          o.label.toLowerCase().includes(search.trim().toLowerCase()),
        );

  return (
    <>
      <button
        ref={anchor}
        type="button"
        onClick={(e) => {
          // The row underneath opens the whole record. A cell that can be
          // changed where it sits answers for itself instead.
          e.stopPropagation();
          setSearch("");
          setOpen((v) => !v);
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={`${value ?? "Not set"} — click to change`}
        // No border, no background. It is text until someone reaches for it.
        className={`group -mx-1 flex w-[calc(100%+0.5rem)] items-center gap-1.5 rounded px-1 text-left transition-colors hover:bg-surface-3 ${
          busy === true ? "opacity-50" : ""
        } ${open ? "bg-surface-3" : ""}`}
      >
        {swatch}
        <span className={`truncate ${value === null ? "text-faint" : ""}`}>
          {value ?? "—"}
        </span>
        <span
          aria-hidden
          className={`ml-auto flex-none text-[10px] text-faint transition-opacity ${
            open ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          }`}
        >
          ▾
        </span>
      </button>

      {open &&
        createPortal(
          <div
            ref={menu}
            role="listbox"
            style={{
              position: "fixed",
              top: at?.top ?? -9999,
              left: at?.left ?? -9999,
              visibility: at === null ? "hidden" : "visible",
            }}
            className="z-50 w-56 overflow-hidden rounded-lg border border-rule bg-surface py-1 shadow-[var(--shadow)]"
          >
            {options.length > 8 && (
              <input
                autoFocus
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search"
                className="mx-2 mb-1 w-[calc(100%-1rem)] rounded border border-rule-2 bg-surface px-2 py-1 text-[12.5px] text-ink placeholder:text-faint"
              />
            )}

            <div className="max-h-64 overflow-y-auto">
              {/*
                Clearing is a real choice — a record can legitimately have no
                Region Style — and without it the only way back from a
                mis-click is the full editor.
              */}
              <button
                type="button"
                role="option"
                aria-selected={value === null}
                onClick={() => {
                  setOpen(false);
                  onPick(null);
                }}
                className="block w-full px-3 py-1.5 text-left text-[12.5px] text-muted hover:bg-surface-2"
              >
                Not set
              </button>

              {shown.length === 0 ? (
                <p className="px-3 py-2 text-[12px] text-muted">
                  Nothing matches “{search}”.
                </p>
              ) : (
                shown.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    role="option"
                    aria-selected={o.label === value}
                    onClick={() => {
                      setOpen(false);
                      if (o.label !== value) onPick(o.id);
                    }}
                    className={`block w-full px-3 py-1.5 text-left text-[13px] hover:bg-surface-2 ${
                      o.label === value
                        ? "bg-brick-soft font-medium text-brick"
                        : "text-ink-2"
                    }`}
                  >
                    {o.label}
                  </button>
                ))
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

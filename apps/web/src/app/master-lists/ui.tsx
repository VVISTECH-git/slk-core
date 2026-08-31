"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { colourSwatch, isPaleSwatch, type LookupStatus } from "@slk/domain";

import type { ListHealth } from "@/lib/vocabulary";

/* -------------------------------------------------------------------- chrome */

/**
 * Every screen under Master Lists wears the same header: a breadcrumb that
 * says where you are in the hierarchy, a title, and one sentence. The
 * hierarchy is the point of the redesign, so it is visible on every level
 * rather than implied by the URL.
 */
export function Header({
  crumbs,
  title,
  lede,
  actions,
}: {
  crumbs?: { label: string; href?: string }[];
  title: string;
  lede: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="border-b border-rule bg-surface px-8 py-6">
      {crumbs !== undefined && crumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="mb-2 flex items-center gap-1.5 text-[12px] text-muted">
          {crumbs.map((crumb, i) => (
            <span key={crumb.label} className="flex items-center gap-1.5">
              {i > 0 && <span className="text-faint" aria-hidden>/</span>}
              {crumb.href === undefined ? (
                <span>{crumb.label}</span>
              ) : (
                <a href={crumb.href} className="hover:text-ink hover:underline">
                  {crumb.label}
                </a>
              )}
            </span>
          ))}
        </nav>
      )}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[22px] leading-tight font-semibold tracking-tight text-ink">
            {title}
          </h1>
          <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-muted">
            {lede}
          </p>
        </div>

        {actions !== undefined && (
          <div className="flex flex-none items-center gap-2">{actions}</div>
        )}
      </div>
    </header>
  );
}

/* -------------------------------------------------------------------- status */

const STATUS_STYLE: Record<LookupStatus, { bg: string; fg: string; label: string }> = {
  draft: { bg: "var(--off-soft)", fg: "var(--off)", label: "Draft" },
  proposed: { bg: "var(--warn-soft)", fg: "var(--warn)", label: "Proposed" },
  active: { bg: "var(--ok-soft)", fg: "var(--ok)", label: "Active" },
  retired: { bg: "var(--off-soft)", fg: "var(--off)", label: "Retired" },
};

/** The label to show for a status. Real text, not a CSS `capitalize`. */
export function statusLabel(status: LookupStatus): string {
  return STATUS_STYLE[status].label;
}

export function StatusPill({ status }: { status: LookupStatus }) {
  const s = STATUS_STYLE[status];

  return (
    <span
      // A dot as well as the colour. Draft and Retired share a neutral, and
      // colour alone is not a distinction everyone can see.
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap"
      style={{ background: s.bg, color: s.fg }}
    >
      <span
        aria-hidden
        className="h-1.5 w-1.5 rounded-full"
        style={{
          background: "currentColor",
          opacity: status === "retired" ? 0.4 : 1,
        }}
      />
      {s.label}
    </span>
  );
}

const HEALTH_TEXT: Record<ListHealth, string> = {
  empty: "Empty",
  review: "Needs review",
  healthy: "Healthy",
};

const HEALTH_COLOUR: Record<ListHealth, string> = {
  empty: "var(--faint)",
  review: "var(--warn)",
  healthy: "var(--ok)",
};

/**
 * A type's health, stated rather than implied.
 *
 * Each state names a specific condition — no values at all, or something
 * flagged for a decision — so the row says what to do rather than only that
 * something is wrong.
 */
export function HealthMark({ health }: { health: ListHealth }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[12px] whitespace-nowrap"
      style={{ color: HEALTH_COLOUR[health] }}
    >
      <span
        aria-hidden
        className="h-1.5 w-1.5 flex-none rounded-full"
        style={{ background: "currentColor" }}
      />
      {HEALTH_TEXT[health]}
    </span>
  );
}

/* ------------------------------------------------------------------- swatch */

/**
 * Takes the whole value, because whether to draw a swatch at all is a
 * property of the list it belongs to. `colourSwatch` answers with a grey when
 * it does not recognise the word, which is right in a colour column and a
 * meaningless dot beside Ajrakh.
 */
export function Swatch({
  value,
}: {
  value: { label: string; hex: string | null; isColour: boolean };
}) {
  if (!value.isColour) return null;

  const colour = colourSwatch(value.label, value.hex);

  return (
    <span
      aria-hidden
      className="h-3 w-3 flex-none rounded-full"
      style={{
        background: colour,
        // A pale swatch on a white row is an invisible circle. The ring is
        // what makes Ivory and Ghost White read as colours at all.
        boxShadow: isPaleSwatch(colour)
          ? "inset 0 0 0 1px var(--rule-2)"
          : "inset 0 0 0 1px rgba(0,0,0,0.08)",
      }}
    />
  );
}

/* -------------------------------------------------------------------- toast */

export interface Toast {
  ok: boolean;
  message: string;
}

/**
 * One transient message at a time.
 *
 * Actions here are one-at-a-time and immediate — there is no Save button to
 * stand next to, so the confirmation has to come to the reader.
 */
export function useToast(): [Toast | null, (t: Toast | null) => void] {
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((next: Toast | null) => {
    if (timer.current !== null) clearTimeout(timer.current);
    setToast(next);

    // Failures stay until dismissed. A rejection usually says what to do
    // instead, and taking that away after four seconds is unhelpful.
    if (next !== null && next.ok) {
      timer.current = setTimeout(() => setToast(null), 4000);
    }
  }, []);

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  return [toast, show];
}

export function ToastBar({
  toast,
  onDismiss,
}: {
  toast: Toast | null;
  onDismiss: () => void;
}) {
  if (toast === null) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-6 left-1/2 z-50 flex max-w-lg -translate-x-1/2 items-start gap-3 rounded-lg border px-4 py-3 text-[13px] shadow-[var(--shadow)]"
      style={{
        background: toast.ok ? "var(--ok-soft)" : "var(--brick-soft)",
        borderColor: toast.ok ? "var(--ok)" : "var(--brick)",
        color: toast.ok ? "var(--ok)" : "var(--brick-2)",
      }}
    >
      <span className="leading-relaxed">{toast.message}</span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="-mr-1 flex-none rounded px-1 opacity-60 hover:opacity-100"
      >
        ×
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ buttons */

export function Button({
  tone = "quiet",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: "primary" | "quiet" | "danger";
}) {
  const tones = {
    primary:
      "bg-brick text-on-brick hover:bg-brick-2 disabled:opacity-50",
    quiet:
      "border border-rule-2 bg-surface text-ink-2 hover:bg-surface-2 disabled:opacity-50",
    danger:
      "border border-brick bg-surface text-brick hover:bg-brick-soft disabled:opacity-50",
  };

  return (
    <button
      type="button"
      {...props}
      className={`rounded-md px-3 py-1.5 text-[13px] font-medium whitespace-nowrap transition-colors disabled:cursor-not-allowed ${tones[tone]} ${className}`}
    />
  );
}

/* ---------------------------------------------------------------- row menu */

export interface MenuItem {
  label: string;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
  hint?: string;
}

/**
 * The row's actions, behind one control.
 *
 * They used to be spelled out on every row — Set Default, Retire, on all 229
 * of them. Repeating the same two buttons down a table teaches the reader to
 * stop seeing that column, which is the opposite of what an action needs.
 */
export function RowMenu({ items, label }: { items: MenuItem[]; label: string }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function onDown(event: MouseEvent) {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);

    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-label={`Actions for ${label}`}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
        className={`rounded-md px-1.5 py-1 leading-none text-muted transition-colors hover:bg-surface-3 hover:text-ink ${
          open ? "bg-surface-3 text-ink" : ""
        }`}
      >
        <span aria-hidden className="text-[16px]">⋯</span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-1 w-52 overflow-hidden rounded-lg border border-rule bg-surface py-1 shadow-[var(--shadow)]"
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              disabled={item.disabled ?? false}
              title={item.hint}
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
              className={`block w-full px-3 py-1.5 text-left text-[13px] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                item.danger === true
                  ? "text-brick hover:bg-brick-soft"
                  : "text-ink-2 hover:bg-surface-2"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------- drawer */

/**
 * The value editor, anchored to the right.
 *
 * A drawer rather than a page because editing one value should not lose the
 * list it sits in — you are almost always comparing it against its
 * neighbours while you decide.
 */
export function Drawer({
  open,
  title,
  onClose,
  children,
  footer,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="flex-1 bg-black/20"
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="flex w-full max-w-md flex-col border-l border-rule bg-surface shadow-[var(--shadow)]"
      >
        <div className="flex flex-none items-start justify-between gap-3 border-b border-rule px-5 py-4">
          <h2 className="text-[15px] leading-snug font-semibold text-ink">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mt-0.5 -mr-1 flex-none rounded px-1.5 text-[18px] leading-none text-muted hover:text-ink"
          >
            ×
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>

        {footer !== undefined && (
          <div className="flex flex-none items-center justify-end gap-2 border-t border-rule bg-surface-2 px-5 py-3">
            {footer}
          </div>
        )}
      </aside>
    </div>
  );
}

/* -------------------------------------------------------------------- field */

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12px] font-medium text-ink-2">
        {label}
      </span>
      {children}
      {hint !== undefined && (
        <span className="mt-1.5 block text-[11.5px] leading-relaxed text-muted">
          {hint}
        </span>
      )}
    </label>
  );
}

export const inputClass =
  "w-full rounded-md border border-rule-2 bg-surface px-2.5 py-1.5 text-[13px] text-ink placeholder:text-faint focus:border-brick focus:outline-none";

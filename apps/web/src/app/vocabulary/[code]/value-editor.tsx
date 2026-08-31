"use client";

import { useState, useTransition } from "react";

import {
  addValue,
  clearFlags,
  renameValue,
  setValueActive,
  type ActionResult,
} from "./actions";

export interface ValueRow {
  id: string;
  code: string;
  label: string;
  isActive: boolean;
  isProposed: boolean;
  needsReview: boolean;
  meta: unknown;
  parentLabel: string | null;
}

function Notice({ result }: { result: ActionResult | null }) {
  if (result === null || result.message === "") return null;

  return (
    <p
      role="status"
      className={`mt-2 text-[13px] ${result.ok ? "text-ok" : "text-brick"}`}
    >
      {result.message}
    </p>
  );
}

export function ValueRows({
  listCode,
  values,
}: {
  listCode: string;
  values: ValueRow[];
}) {
  const [result, setResult] = useState<ActionResult | null>(null);

  return (
    <>
      <ul className="overflow-hidden rounded-lg border border-rule bg-surface">
        {values.map((value, i) => (
          <ValueItem
            key={value.id}
            listCode={listCode}
            value={value}
            first={i === 0}
            onResult={setResult}
          />
        ))}
      </ul>
      <Notice result={result} />
    </>
  );
}

function ValueItem({
  listCode,
  value,
  first,
  onResult,
}: {
  listCode: string;
  value: ValueRow;
  first: boolean;
  onResult: (result: ActionResult) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value.label);
  const [pending, startTransition] = useTransition();

  const run = (action: (fd: FormData) => Promise<ActionResult>, fd: FormData) => {
    startTransition(async () => {
      onResult(await action(fd));
    });
  };

  const submitRename = () => {
    setEditing(false);
    if (draft.trim() === value.label) return;

    const fd = new FormData();
    fd.set("id", value.id);
    fd.set("label", draft);
    run((f) => renameValue(listCode, f), fd);
  };

  const hex =
    typeof value.meta === "object" &&
    value.meta !== null &&
    "hex" in value.meta &&
    typeof (value.meta as { hex: unknown }).hex === "string"
      ? (value.meta as { hex: string }).hex
      : null;

  return (
    <li
      className={[
        first ? "" : "border-t border-rule",
        "flex items-center gap-3 px-4 py-2.5",
        pending ? "opacity-50" : "",
        value.isActive ? "" : "bg-off-soft",
      ].join(" ")}
    >
      {hex && (
        <span
          aria-hidden
          className="size-4 flex-none rounded-full border border-rule-2"
          style={{ background: hex }}
        />
      )}

      <div className="min-w-0 flex-1">
        {editing ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={submitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitRename();
              if (e.key === "Escape") {
                setDraft(value.label);
                setEditing(false);
              }
            }}
            aria-label={`Rename ${value.label}`}
            className="w-full rounded-md border border-brick bg-surface px-2 py-1 text-[14.5px] text-ink outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="block max-w-full truncate rounded px-2 py-1 text-left text-[14.5px] text-ink hover:bg-surface-2"
            title="Click to rename"
          >
            {value.label}
            {value.parentLabel && (
              <span className="ml-2 font-mono text-[11.5px] text-muted">
                → {value.parentLabel}
              </span>
            )}
          </button>
        )}
      </div>

      {value.isProposed && <Flag tone="proposed">proposed</Flag>}
      {value.needsReview && <Flag tone="review">needs review</Flag>}

      {(value.isProposed || value.needsReview) && (
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            const fd = new FormData();
            fd.set("id", value.id);
            run((f) => clearFlags(listCode, f), fd);
          }}
          className="flex-none rounded-md border border-rule-2 px-2.5 py-1 text-[12px] text-ink-2 hover:border-ok hover:text-ok"
        >
          Confirm
        </button>
      )}

      <button
        type="button"
        disabled={pending}
        onClick={() => {
          const fd = new FormData();
          fd.set("id", value.id);
          fd.set("active", String(!value.isActive));
          run((f) => setValueActive(listCode, f), fd);
        }}
        className="w-16 flex-none rounded-md border border-rule-2 px-2.5 py-1 text-[12px] text-ink-2 hover:border-brick hover:text-brick"
      >
        {value.isActive ? "Retire" : "Restore"}
      </button>
    </li>
  );
}

function Flag({
  tone,
  children,
}: {
  tone: "proposed" | "review";
  children: React.ReactNode;
}) {
  return (
    <span
      className={`flex-none rounded-full px-2.5 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.08em] ${
        tone === "review"
          ? "bg-warn-soft text-warn"
          : "bg-brick-soft text-brick"
      }`}
    >
      {children}
    </span>
  );
}

export function AddValue({
  listCode,
  lowercase,
}: {
  listCode: string;
  lowercase: boolean;
}) {
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="mt-5"
      action={(formData) => {
        startTransition(async () => {
          const outcome = await addValue(listCode, formData);
          setResult(outcome);
        });
      }}
    >
      <div className="flex gap-2">
        <input
          name="label"
          placeholder={lowercase ? "add a value (stored lower case)" : "Add a value"}
          aria-label="New value"
          className="min-w-0 flex-1 rounded-md border border-rule-2 bg-surface px-3 py-2 text-[14.5px] text-ink placeholder:text-faint"
        />
        <button
          type="submit"
          disabled={pending}
          className="flex-none rounded-md bg-brick px-4 py-2 text-[14px] font-medium text-on-brick hover:bg-brick-2 disabled:opacity-50"
        >
          Add
        </button>
      </div>
      <Notice result={result} />
    </form>
  );
}

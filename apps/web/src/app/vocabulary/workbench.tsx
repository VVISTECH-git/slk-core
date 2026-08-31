"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import type { VocabDuplicate, VocabList, VocabValue } from "@/lib/vocabulary";

import {
  applyEdits,
  commitPaste,
  mergeValues,
  previewPaste,
  setDefaultValue,
  type ActionResult,
  type PastePreview,
  type ValueEdit,
} from "./actions";

type Draft = {
  label?: string;
  isActive?: boolean;
  clearFlags?: boolean;
  listCode?: string;
};

type View = "all" | "attention" | "duplicates";

export function Workbench({
  values,
  lists,
  duplicates,
}: {
  values: VocabValue[];
  lists: VocabList[];
  duplicates: VocabDuplicate[];
}) {
  const [query, setQuery] = useState("");
  const [view, setView] = useState<View>("all");
  const [listFilter, setListFilter] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pasteInto, setPasteInto] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const searchRef = useRef<HTMLInputElement>(null);

  // "/" focuses search from anywhere, the way every tool with a lot of rows
  // works. Escape clears the query, then the selection.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target?.tagName === "INPUT" || target?.tagName === "TEXTAREA";

      if (e.key === "/" && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
      }

      if (e.key === "Escape" && !typing) {
        if (query !== "") setQuery("");
        else setSelected(new Set());
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [query]);

  const attention = useMemo(
    () => values.filter((v) => v.isProposed || v.needsReview),
    [values],
  );

  const duplicateIds = useMemo(() => {
    const ids = new Set<string>();
    for (const d of duplicates) {
      ids.add(d.a.id);
      ids.add(d.b.id);
    }
    return ids;
  }, [duplicates]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();

    return values.filter((v) => {
      if (listFilter !== null && v.listCode !== listFilter) return false;
      if (view === "attention" && !(v.isProposed || v.needsReview)) return false;
      if (view === "duplicates" && !duplicateIds.has(v.id)) return false;
      if (q === "") return true;

      return (
        v.label.toLowerCase().includes(q) ||
        v.listLabel.toLowerCase().includes(q) ||
        (v.parentLabel?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [values, query, view, listFilter, duplicateIds]);

  const edits = useMemo<ValueEdit[]>(() => {
    return Object.entries(drafts)
      .filter(([, d]) => Object.keys(d).length > 0)
      .map(([id, d]) => ({ id, ...d }));
  }, [drafts]);

  const setDraft = (id: string, patch: Draft) => {
    setDrafts((prev) => {
      const next = { ...prev[id], ...patch };
      // Dropping back to the stored value removes the pending change rather
      // than saving a no-op.
      const value = values.find((v) => v.id === id);
      if (value && next.label === value.label) delete next.label;
      if (value && next.isActive === value.isActive) delete next.isActive;

      if (Object.keys(next).length === 0) {
        const { [id]: _drop, ...rest } = prev;
        return rest;
      }

      return { ...prev, [id]: next };
    });
  };

  const save = () => {
    startTransition(async () => {
      const outcome = await applyEdits(edits);
      setResult(outcome);
      if (outcome.ok) {
        setDrafts({});
        setSelected(new Set());
      }
    });
  };

  const bulk = (patch: Draft) => {
    setDrafts((prev) => {
      const next = { ...prev };
      for (const id of selected) next[id] = { ...next[id], ...patch };
      return next;
    });
  };

  const selectedValues = values.filter((v) => selected.has(v.id));
  const sameList =
    selectedValues.length > 1 &&
    selectedValues.every((v) => v.listCode === selectedValues[0]?.listCode);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-10 border-b border-rule bg-ground/95 px-8 pt-7 pb-3 backdrop-blur">
        <div className="mx-auto max-w-6xl">
          <div className="mb-4 flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <h1 className="text-[24px] font-semibold tracking-tight text-ink">
              Vocabulary
            </h1>
            <span className="font-mono text-[11.5px] text-faint">
              {values.length} values · {lists.filter((l) => l.count > 0).length} lists
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search every value…"
                aria-label="Search every value"
                className="w-full rounded-lg border border-rule-2 bg-surface py-2.5 pr-16 pl-4 text-[15px] text-ink placeholder:text-faint"
              />
              <kbd className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 rounded border border-rule-2 px-1.5 py-0.5 font-mono text-[10px] text-faint">
                /
              </kbd>
            </div>

            <Tab on={view === "all"} onClick={() => setView("all")}>
              All
            </Tab>
            <Tab
              on={view === "attention"}
              onClick={() => setView("attention")}
              count={attention.length}
              tone="warn"
            >
              Needs Attention
            </Tab>
            <Tab
              on={view === "duplicates"}
              onClick={() => setView("duplicates")}
              count={duplicates.length}
              tone="brick"
            >
              Possible Duplicates
            </Tab>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <Chip on={listFilter === null} onClick={() => setListFilter(null)}>
              Every List
            </Chip>
            {lists
              .filter((l) => l.count > 0)
              .map((l) => (
                <Chip
                  key={l.code}
                  on={listFilter === l.code}
                  onClick={() =>
                    setListFilter(listFilter === l.code ? null : l.code)
                  }
                >
                  {l.label}
                  <span className="ml-1.5 font-mono text-[10px] opacity-60">
                    {l.count}
                  </span>
                </Chip>
              ))}
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-6xl flex-1 px-8 py-6 pb-28">
        {view === "duplicates" ? (
          <Duplicates
            hints={duplicates}
            pending={pending}
            onMerge={(survivorId, mergedIds) => {
              startTransition(async () => {
                setResult(await mergeValues(survivorId, mergedIds));
              });
            }}
          />
        ) : (
          <Table
            rows={rows}
            drafts={drafts}
            selected={selected}
            setSelected={setSelected}
            setDraft={setDraft}
            showList={listFilter === null}
            onSetDefault={(id, makeDefault) => {
              startTransition(async () => {
                setResult(await setDefaultValue(id, makeDefault));
              });
            }}
          />
        )}

        {view !== "duplicates" && rows.length === 0 && (
          <p className="py-16 text-center text-[15px] text-muted">
            Nothing matches{query && ` “${query}”`}.
          </p>
        )}

        {view === "all" && listFilter !== null && (
          <PasteBox
            listCode={listFilter}
            listLabel={
              lists.find((l) => l.code === listFilter)?.label ?? listFilter
            }
            open={pasteInto === listFilter}
            onOpen={() => setPasteInto(listFilter)}
            onClose={() => setPasteInto(null)}
            onResult={setResult}
          />
        )}
      </div>

      <ActionBar
        edits={edits}
        selected={selectedValues}
        sameList={sameList}
        lists={lists}
        pending={pending}
        result={result}
        onSave={save}
        onDiscard={() => {
          setDrafts({});
          setResult(null);
        }}
        onBulk={bulk}
        onMerge={(survivorId) => {
          const others = selectedValues
            .filter((v) => v.id !== survivorId)
            .map((v) => v.id);
          startTransition(async () => {
            const outcome = await mergeValues(survivorId, others);
            setResult(outcome);
            if (outcome.ok) setSelected(new Set());
          });
        }}
        onClearSelection={() => setSelected(new Set())}
      />
    </div>
  );
}

function Tab({
  on,
  onClick,
  children,
  count,
  tone,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
  count?: number;
  tone?: "warn" | "brick";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`flex flex-none items-center gap-2 rounded-lg border px-3.5 py-2.5 text-[13.5px] ${
        on
          ? "border-ink bg-ink text-ground"
          : "border-rule-2 bg-surface text-ink-2 hover:border-ink-2"
      }`}
    >
      {children}
      {count !== undefined && count > 0 && (
        <span
          className={`rounded-full px-1.5 py-0.5 font-mono text-[10px] ${
            on
              ? "bg-ground/20 text-ground"
              : tone === "warn"
                ? "bg-warn-soft text-warn"
                : "bg-brick-soft text-brick"
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
}

function Chip({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`rounded-full border px-2.5 py-1 text-[12px] ${
        on
          ? "border-brick bg-brick-soft text-brick"
          : "border-rule-2 bg-surface text-muted hover:text-ink-2"
      }`}
    >
      {children}
    </button>
  );
}

function Table({
  rows,
  drafts,
  selected,
  setSelected,
  setDraft,
  showList,
  onSetDefault,
}: {
  rows: VocabValue[];
  drafts: Record<string, Draft>;
  selected: Set<string>;
  setSelected: (next: Set<string>) => void;
  setDraft: (id: string, patch: Draft) => void;
  showList: boolean;
  // Applied immediately rather than staged with the other edits: at most one
  // value per list can be the default, so two pending changes would conflict
  // with each other at save time.
  onSetDefault: (id: string, makeDefault: boolean) => void;
}) {
  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  if (rows.length === 0) return null;

  return (
    <div className="overflow-hidden rounded-lg border border-rule bg-surface">
      {rows.map((v, i) => {
        const draft = drafts[v.id] ?? {};
        const changed = Object.keys(draft).length > 0;
        const label = draft.label ?? v.label;
        const active = draft.isActive ?? v.isActive;
        const flagged =
          !(draft.clearFlags ?? false) && (v.isProposed || v.needsReview);

        return (
          <div
            key={v.id}
            className={[
              i > 0 ? "border-t border-rule" : "",
              "flex items-center gap-3 px-3 py-2",
              changed ? "bg-warn-soft/40" : "",
              active ? "" : "opacity-55",
            ].join(" ")}
          >
            <input
              type="checkbox"
              checked={selected.has(v.id)}
              onChange={() => toggle(v.id)}
              aria-label={`Select ${v.label}`}
              className="size-4 flex-none accent-[var(--brick)]"
            />

            {v.hex && (
              <span
                aria-hidden
                className="size-4 flex-none rounded-full border border-rule-2"
                style={{ background: v.hex }}
              />
            )}

            <input
              value={label}
              onChange={(e) => setDraft(v.id, { label: e.target.value })}
              aria-label={`${v.label} in ${v.listLabel}`}
              className={`min-w-0 flex-1 rounded border border-transparent bg-transparent px-2 py-1 text-[14.5px] text-ink hover:border-rule-2 focus:border-brick focus:bg-surface ${
                active ? "" : "line-through"
              }`}
            />

            {v.parentLabel && (
              <span className="hidden flex-none font-mono text-[11px] text-muted sm:inline">
                → {v.parentLabel}
              </span>
            )}

            {showList && (
              <span className="hidden w-44 flex-none truncate text-right text-[12.5px] text-muted md:inline">
                {v.listLabel}
              </span>
            )}

            {flagged && (
              <button
                type="button"
                onClick={() => setDraft(v.id, { clearFlags: true })}
                title="Confirm this value"
                className={`flex-none rounded-full px-2.5 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.08em] ${
                  v.needsReview
                    ? "bg-warn-soft text-warn hover:bg-warn hover:text-ground"
                    : "bg-brick-soft text-brick hover:bg-brick hover:text-on-brick"
                }`}
              >
                {v.needsReview ? "needs review" : "proposed"}
              </button>
            )}

            {draft.clearFlags && (
              <span className="flex-none font-mono text-[9.5px] uppercase tracking-[0.08em] text-ok">
                confirmed
              </span>
            )}

            <button
              type="button"
              title={
                v.isDefault
                  ? "New Records start with this — click to clear"
                  : "Make this the value new records start with"
              }
              aria-pressed={v.isDefault}
              onClick={() => onSetDefault(v.id, !v.isDefault)}
              className={`flex-none rounded border px-2 py-1 text-[11.5px] ${
                v.isDefault
                  ? "border-ok bg-ok-soft text-ok"
                  : "border-rule-2 text-muted hover:border-ok hover:text-ok"
              }`}
            >
              {v.isDefault ? "Default" : "Set Default"}
            </button>

            <button
              type="button"
              onClick={() => setDraft(v.id, { isActive: !active })}
              className="w-16 flex-none rounded border border-rule-2 px-2 py-1 text-[11.5px] text-muted hover:border-brick hover:text-brick"
            >
              {active ? "Retire" : "Restore"}
            </button>
          </div>
        );
      })}
    </div>
  );
}

function Duplicates({
  hints,
  pending,
  onMerge,
}: {
  hints: VocabDuplicate[];
  pending: boolean;
  onMerge: (survivorId: string, mergedIds: string[]) => void;
}) {
  if (hints.length === 0) {
    return (
      <div className="rounded-lg border border-rule bg-surface px-6 py-12 text-center">
        <p className="mb-1 text-[15px] font-medium text-ink">
          No likely duplicates
        </p>
        <p className="mx-auto max-w-[54ch] text-[13.5px] leading-relaxed text-muted">
          Nothing in the vocabulary is within an edit or two of anything else in
          the same list.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="max-w-[70ch] text-[13.5px] leading-relaxed text-muted">
        Pairs close enough to be the same thing entered twice. Keeping one and
        folding the other into it is what the workbook&rsquo;s Correction Log
        records being done by hand — <em>Kanchi</em> into <em>Kanchipuram</em>,{" "}
        <em>Khadhi</em> into <em>Khadi</em>. Merging repoints anything that
        belongs to the losing value.
      </p>

      {hints.map((hint) => (
        <div
          key={`${hint.a.id}-${hint.b.id}`}
          className="rounded-lg border border-rule bg-surface p-4"
        >
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-brick-soft px-2.5 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.08em] text-brick">
              {hint.a.listLabel}
            </span>
            <span className="text-[12.5px] text-muted">{hint.reason}</span>
          </div>

          <div className="flex flex-wrap items-stretch gap-2">
            <Candidate value={hint.a} />
            <Candidate value={hint.b} />
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => onMerge(hint.a.id, [hint.b.id])}
              className="rounded-md border border-rule-2 px-3 py-1.5 text-[12.5px] text-ink-2 hover:border-brick hover:text-brick disabled:opacity-50"
            >
              Keep “{hint.a.label}”
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => onMerge(hint.b.id, [hint.a.id])}
              className="rounded-md border border-rule-2 px-3 py-1.5 text-[12.5px] text-ink-2 hover:border-brick hover:text-brick disabled:opacity-50"
            >
              Keep “{hint.b.label}”
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function Candidate({ value }: { value: VocabValue }) {
  return (
    <div className="min-w-[180px] flex-1 rounded-md border border-rule-2 bg-surface-2 px-3 py-2">
      <div className="text-[14.5px] text-ink">{value.label}</div>
      <div className="font-mono text-[11px] text-faint">{value.listLabel}</div>
    </div>
  );
}

function PasteBox({
  listCode,
  listLabel,
  open,
  onOpen,
  onClose,
  onResult,
}: {
  listCode: string;
  listLabel: string;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onResult: (result: ActionResult) => void;
}) {
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<PastePreview | null>(null);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <button
        type="button"
        onClick={onOpen}
        className="mt-4 rounded-md border border-dashed border-rule-2 px-4 py-2.5 text-[13.5px] text-muted hover:border-brick hover:text-brick"
      >
        Paste a column from the workbook into {listLabel}
      </button>
    );
  }

  return (
    <div className="mt-4 rounded-lg border border-rule bg-surface p-4">
      <p className="mb-2 text-[13.5px] text-ink-2">
        Paste a column of values for <strong>{listLabel}</strong>. Nothing is
        added until you have seen what it would do.
      </p>

      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setPreview(null);
        }}
        rows={5}
        aria-label={`Values to add to ${listLabel}`}
        className="w-full rounded-md border border-rule-2 bg-surface-2 p-3 font-mono text-[13px] text-ink"
        placeholder={"Banarasi\nChanderi\nGadwal"}
      />

      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending || text.trim() === ""}
          onClick={() => {
            startTransition(async () => {
              const outcome = await previewPaste(listCode, text);
              if ("ok" in outcome) onResult(outcome);
              else setPreview(outcome);
            });
          }}
          className="rounded-md border border-rule-2 px-3 py-1.5 text-[13px] text-ink-2 hover:border-brick hover:text-brick disabled:opacity-50"
        >
          Check
        </button>

        {preview && preview.fresh.length > 0 && (
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              startTransition(async () => {
                onResult(await commitPaste(listCode, preview.fresh));
                setText("");
                setPreview(null);
                onClose();
              });
            }}
            className="rounded-md bg-brick px-3 py-1.5 text-[13px] font-medium text-on-brick hover:bg-brick-2 disabled:opacity-50"
          >
            Add {preview.fresh.length} new
          </button>
        )}

        <button
          type="button"
          onClick={onClose}
          className="rounded-md px-3 py-1.5 text-[13px] text-muted hover:text-ink"
        >
          Cancel
        </button>
      </div>

      {preview && (
        <div className="mt-3 border-t border-rule pt-3 text-[13px] leading-relaxed">
          <p className="text-ok">
            {preview.fresh.length} new
            {preview.fresh.length > 0 && `: ${preview.fresh.join(", ")}`}
          </p>
          {preview.existing.length > 0 && (
            <p className="text-muted">
              {preview.existing.length} already here
            </p>
          )}
          {preview.caseOnly.length > 0 && (
            <p className="text-warn">
              {preview.caseOnly.length} differ only by case and will be skipped:{" "}
              {preview.caseOnly
                .map((c) => `${c.pasted} vs ${c.stored}`)
                .join(", ")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function ActionBar({
  edits,
  selected,
  sameList,
  lists,
  pending,
  result,
  onSave,
  onDiscard,
  onBulk,
  onMerge,
  onClearSelection,
}: {
  edits: ValueEdit[];
  selected: VocabValue[];
  sameList: boolean;
  lists: VocabList[];
  pending: boolean;
  result: ActionResult | null;
  onSave: () => void;
  onDiscard: () => void;
  onBulk: (patch: Draft) => void;
  onMerge: (survivorId: string) => void;
  onClearSelection: () => void;
}) {
  const hasEdits = edits.length > 0;
  const hasSelection = selected.length > 0;

  if (!hasEdits && !hasSelection && result === null) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-rule bg-surface/97 px-8 py-3 shadow-[0_-8px_24px_rgba(0,0,0,0.06)] backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3">
        {hasSelection && (
          <>
            <span className="font-mono text-[12px] text-ink">
              {selected.length} selected
            </span>

            <button
              type="button"
              onClick={() => onBulk({ isActive: false })}
              className="rounded-md border border-rule-2 px-3 py-1.5 text-[12.5px] text-ink-2 hover:border-brick hover:text-brick"
            >
              Retire
            </button>
            <button
              type="button"
              onClick={() => onBulk({ clearFlags: true })}
              className="rounded-md border border-rule-2 px-3 py-1.5 text-[12.5px] text-ink-2 hover:border-ok hover:text-ok"
            >
              Confirm
            </button>

            <select
              defaultValue=""
              onChange={(e) => {
                if (e.target.value !== "") onBulk({ listCode: e.target.value });
                e.target.value = "";
              }}
              aria-label="Move selected values to another list"
              className="rounded-md border border-rule-2 bg-surface px-2 py-1.5 text-[12.5px] text-ink-2"
            >
              <option value="">Move to list…</option>
              {lists.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>

            {sameList && selected.length > 1 && (
              <select
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value !== "") onMerge(e.target.value);
                  e.target.value = "";
                }}
                aria-label="Merge selected values, keeping one"
                disabled={pending}
                className="rounded-md border border-rule-2 bg-surface px-2 py-1.5 text-[12.5px] text-ink-2"
              >
                <option value="">Merge, keeping…</option>
                {selected.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                  </option>
                ))}
              </select>
            )}

            <button
              type="button"
              onClick={onClearSelection}
              className="text-[12.5px] text-muted hover:text-ink"
            >
              Clear
            </button>

            <span className="h-5 w-px bg-rule" />
          </>
        )}

        {result && (
          <span
            role="status"
            className={`text-[13px] ${result.ok ? "text-ok" : "text-brick"}`}
          >
            {result.message}
          </span>
        )}

        <span className="ml-auto" />

        {hasEdits && (
          <>
            <span className="font-mono text-[12px] text-warn">
              {edits.length} unsaved change{edits.length === 1 ? "" : "s"}
            </span>
            <button
              type="button"
              onClick={onDiscard}
              className="rounded-md px-3 py-1.5 text-[13px] text-muted hover:text-ink"
            >
              Discard
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={pending}
              className="rounded-md bg-brick px-4 py-2 text-[13.5px] font-medium text-on-brick hover:bg-brick-2 disabled:opacity-50"
            >
              {pending ? "Saving…" : "Save"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

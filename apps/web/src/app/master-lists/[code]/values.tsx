"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { LOOKUP_STATUSES, titleCase, type LookupStatus } from "@slk/domain";

import type { VocabDuplicate, VocabList, VocabValue } from "@/lib/vocabulary";

import {
  clearReview,
  commitPaste,
  createValue,
  deleteValue,
  mergeValues,
  previewPaste,
  saveValue,
  setDefaultValue,
  setStatus,
  type ActionResult,
  type PastePreview,
} from "../actions";
import {
  Button,
  Drawer,
  Field,
  Header,
  RowMenu,
  StatusPill,
  statusLabel,
  Swatch,
  ToastBar,
  inputClass,
  useToast,
} from "../ui";

type Filter = "all" | LookupStatus | "attention";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "proposed", label: "Proposed" },
  { key: "draft", label: "Draft" },
  { key: "retired", label: "Retired" },
  { key: "attention", label: "Needs review" },
];

export function Values({
  list,
  values,
  duplicates,
}: {
  list: VocabList;
  values: VocabValue[];
  duplicates: VocabDuplicate[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const [toast, showToast] = useToast();

  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [pasting, setPasting] = useState(false);

  /**
   * A value can be linked to directly — the directory's cross-list search
   * lands on `?value=<id>`, which is how you get from "zari appears in three
   * lists" to the one you meant.
   */
  useEffect(() => {
    const target = params.get("value");
    if (target !== null && values.some((v) => v.id === target)) {
      setEditing(target);
    }
  }, [params, values]);

  function run(action: () => Promise<ActionResult>, onOk?: () => void) {
    start(async () => {
      const result = await action();
      showToast(result);
      if (result.ok) {
        onOk?.();
        router.refresh();
      }
    });
  }

  const duplicateIds = useMemo(() => {
    const ids = new Set<string>();
    for (const pair of duplicates) {
      ids.add(pair.a.id);
      ids.add(pair.b.id);
    }
    return ids;
  }, [duplicates]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();

    return values.filter((v) => {
      if (filter === "attention") {
        if (!v.needsReview && !duplicateIds.has(v.id)) return false;
      } else if (filter !== "all" && v.status !== filter) {
        return false;
      }

      if (q !== "" && !v.label.toLowerCase().includes(q)) return false;

      return true;
    });
  }, [values, filter, query, duplicateIds]);

  const value = editing === null ? null : (values.find((v) => v.id === editing) ?? null);

  const selectedIds = [...selected].filter((id) => shown.some((v) => v.id === id));

  const counts = useMemo(() => {
    const by: Record<string, number> = { all: values.length };
    for (const s of LOOKUP_STATUSES) {
      by[s] = values.filter((v) => v.status === s).length;
    }
    by["attention"] = values.filter(
      (v) => v.needsReview || duplicateIds.has(v.id),
    ).length;
    return by;
  }, [values, duplicateIds]);

  return (
    <div className="flex min-h-screen flex-col">
      <Header
        crumbs={[{ label: "Master Lists", href: "/master-lists" }, { label: list.label }]}
        title={list.label}
        lede={
          list.description ??
          `${list.total} value${list.total === 1 ? "" : "s"}. ${
            list.defaultLabel === null
              ? "No default — a new record starts with this blank."
              : `A new record starts with ${list.defaultLabel}.`
          }`
        }
        actions={
          <>
            <Button onClick={() => setPasting(true)}>Paste a column</Button>
            <Button tone="primary" onClick={() => setAdding(true)}>
              Add value
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-3 border-b border-rule bg-surface-2 px-8 py-3">
        <div className="flex flex-wrap gap-1">
          {FILTERS.map((f) => {
            const n = counts[f.key] ?? 0;
            if (n === 0 && f.key !== "all") return null;

            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={`rounded-md px-2.5 py-1 text-[12.5px] transition-colors ${
                  filter === f.key
                    ? "bg-surface font-medium text-ink shadow-sm"
                    : "text-muted hover:bg-surface-3 hover:text-ink"
                }`}
              >
                {f.label}
                <span className="ml-1.5 font-mono text-[11px] tabular-nums opacity-60">
                  {n}
                </span>
              </button>
            );
          })}
        </div>

        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${list.label.toLowerCase()}`}
          className="ml-auto w-56 rounded-md border border-rule-2 bg-surface px-2.5 py-1.5 text-[13px] text-ink placeholder:text-faint focus:border-brick focus:outline-none"
        />
      </div>

      {selectedIds.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-rule bg-brick-soft px-8 py-2.5">
          <span className="text-[12.5px] font-medium text-brick-2">
            {selectedIds.length} selected
          </span>
          <span className="mx-1 h-4 w-px bg-rule-2" />
          <Button
            disabled={pending}
            onClick={() => run(() => setStatus(selectedIds, "active"), () => setSelected(new Set()))}
          >
            Activate
          </Button>
          <Button
            disabled={pending}
            onClick={() => run(() => setStatus(selectedIds, "retired"), () => setSelected(new Set()))}
          >
            Retire
          </Button>
          <Button
            disabled={pending}
            onClick={() => run(() => clearReview(selectedIds), () => setSelected(new Set()))}
          >
            Mark checked
          </Button>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="ml-1 text-[12.5px] text-muted hover:text-ink hover:underline"
          >
            Clear
          </button>
        </div>
      )}

      <div className="flex-1 px-8 py-6">
        {duplicates.length > 0 && filter !== "attention" && (
          <button
            type="button"
            onClick={() => setFilter("attention")}
            className="mb-4 block w-full rounded-lg border px-4 py-2.5 text-left text-[13px]"
            style={{
              borderColor: "var(--warn)",
              background: "var(--warn-soft)",
              color: "var(--warn)",
            }}
          >
            {duplicates.length} possible duplicate
            {duplicates.length === 1 ? "" : "s"} in this list —{" "}
            {duplicates
              .slice(0, 2)
              .map((d) => `${d.a.label} / ${d.b.label}`)
              .join(", ")}
            {duplicates.length > 2 ? "…" : ""}
          </button>
        )}

        {shown.length === 0 ? (
          <div className="rounded-lg border border-dashed border-rule-2 px-6 py-14 text-center">
            <p className="text-[14px] text-ink-2">
              {values.length === 0
                ? `${list.label} has no values yet.`
                : "Nothing matches."}
            </p>
            <p className="mx-auto mt-1.5 max-w-md text-[12.5px] leading-relaxed text-muted">
              {values.length === 0
                ? "Until it has some, this attribute is free text on a product record. Add them one at a time, or paste a column straight out of the workbook."
                : "Try a different filter, or clear the search."}
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-rule bg-surface">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-rule bg-surface-2 text-left">
                  <th scope="col" className="w-10 px-3 py-2">
                    <input
                      type="checkbox"
                      aria-label="Select all shown"
                      checked={
                        shown.length > 0 &&
                        shown.every((v) => selected.has(v.id))
                      }
                      onChange={(e) =>
                        setSelected(
                          e.target.checked
                            ? new Set(shown.map((v) => v.id))
                            : new Set(),
                        )
                      }
                    />
                  </th>
                  <th scope="col" className="px-3 py-2 text-[11.5px] font-medium text-muted">
                    Value
                  </th>
                  <th scope="col" className="w-28 px-3 py-2 text-[11.5px] font-medium text-muted">
                    Status
                  </th>
                  <th scope="col" className="w-32 px-3 py-2 text-[11.5px] font-medium text-muted">
                    Belongs to
                  </th>
                  <th scope="col" className="w-24 px-3 py-2 text-right text-[11.5px] font-medium text-muted">
                    Used by
                  </th>
                  <th scope="col" className="w-12 px-3 py-2">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>

              <tbody>
                {shown.map((v) => (
                  <Row
                    key={v.id}
                    value={v}
                    flagged={duplicateIds.has(v.id)}
                    selected={selected.has(v.id)}
                    pending={pending}
                    onSelect={(on) =>
                      setSelected((prev) => {
                        const next = new Set(prev);
                        if (on) next.add(v.id);
                        else next.delete(v.id);
                        return next;
                      })
                    }
                    onEdit={() => setEditing(v.id)}
                    onRun={run}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {value !== null && (
        <ValueDrawer
          value={value}
          siblings={values}
          pending={pending}
          onClose={() => setEditing(null)}
          onRun={run}
        />
      )}

      {adding && (
        <AddDrawer
          list={list}
          pending={pending}
          onClose={() => setAdding(false)}
          onRun={run}
        />
      )}

      {pasting && (
        <PasteDrawer
          list={list}
          pending={pending}
          onClose={() => setPasting(false)}
          onRun={run}
          showToast={showToast}
        />
      )}

      <ToastBar toast={toast} onDismiss={() => showToast(null)} />
    </div>
  );
}

/* ---------------------------------------------------------------------- row */

function Row({
  value: v,
  flagged,
  selected,
  pending,
  onSelect,
  onEdit,
  onRun,
}: {
  value: VocabValue;
  flagged: boolean;
  selected: boolean;
  pending: boolean;
  onSelect: (on: boolean) => void;
  onEdit: () => void;
  onRun: (action: () => Promise<ActionResult>) => void;
}) {
  return (
    <tr
      className={`h-11 border-b border-rule last:border-b-0 transition-colors hover:bg-surface-2 ${
        selected ? "bg-brick-soft" : ""
      }`}
    >
      <td className="px-3">
        <input
          type="checkbox"
          aria-label={`Select ${v.label}`}
          checked={selected}
          onChange={(e) => onSelect(e.target.checked)}
        />
      </td>

      <td className="max-w-0 px-3">
        <button
          type="button"
          onClick={onEdit}
          className="flex w-full items-center gap-2 text-left"
        >
          <Swatch value={v} />
          <span
            className={`truncate text-[13.5px] ${
              v.status === "retired" ? "text-muted line-through" : "text-ink"
            }`}
            title={v.description ?? v.label}
          >
            {v.label}
          </span>

          {v.isDefault && (
            <span
              title="New records start with this"
              className="flex-none rounded px-1.5 py-0.5 text-[10.5px] font-medium"
              style={{ background: "var(--brick-soft)", color: "var(--brick)" }}
            >
              Default
            </span>
          )}

          {(v.needsReview || flagged) && (
            <span
              title={
                v.needsReview
                  ? "Flagged for checking against real stock"
                  : "Looks like another value in this list"
              }
              className="flex-none rounded px-1.5 py-0.5 text-[10.5px] font-medium"
              style={{ background: "var(--warn-soft)", color: "var(--warn)" }}
            >
              {v.needsReview ? "Review" : "Similar"}
            </span>
          )}
        </button>
      </td>

      <td className="px-3">
        <StatusPill status={v.status} />
      </td>

      <td className="max-w-0 px-3">
        <span className="block truncate text-[12.5px] text-muted" title={v.parentLabel ?? ""}>
          {v.parentLabel ?? "—"}
        </span>
      </td>

      <td className="px-3 text-right font-mono text-[12px] text-muted tabular-nums">
        {v.usage === 0 ? "—" : v.usage}
      </td>

      <td className="px-3">
        <RowMenu
          label={v.label}
          items={[
            { label: "Edit", onSelect: onEdit },
            {
              label: v.isDefault ? "Clear default" : "Make default",
              disabled: pending || (!v.isDefault && v.status !== "active"),
              hint:
                !v.isDefault && v.status !== "active"
                  ? "Only an Active value can be the default"
                  : undefined,
              onSelect: () => onRun(() => setDefaultValue(v.id, !v.isDefault)),
            },
            {
              label: v.status === "retired" ? "Restore" : "Retire",
              disabled: pending,
              onSelect: () =>
                onRun(() =>
                  setStatus([v.id], v.status === "retired" ? "active" : "retired"),
                ),
            },
            ...(v.needsReview
              ? [
                  {
                    label: "Mark checked",
                    disabled: pending,
                    onSelect: () => onRun(() => clearReview([v.id])),
                  },
                ]
              : []),
            {
              label: "Delete",
              danger: true,
              disabled: pending || v.usage > 0,
              hint:
                v.usage > 0
                  ? `${v.usage} record${v.usage === 1 ? "" : "s"} use this — retire it instead`
                  : undefined,
              onSelect: () => onRun(() => deleteValue(v.id)),
            },
          ]}
        />
      </td>
    </tr>
  );
}

/* ------------------------------------------------------------------- drawer */

function ValueDrawer({
  value: v,
  siblings,
  pending,
  onClose,
  onRun,
}: {
  value: VocabValue;
  siblings: VocabValue[];
  pending: boolean;
  onClose: () => void;
  onRun: (action: () => Promise<ActionResult>, onOk?: () => void) => void;
}) {
  const [label, setLabel] = useState(v.label);
  const [description, setDescription] = useState(v.description ?? "");
  const [status, setStatusValue] = useState<LookupStatus>(v.status);
  const [needsReview, setNeedsReview] = useState(v.needsReview);
  const [mergeInto, setMergeInto] = useState("");

  const dirty =
    titleCase(label.trim()) !== v.label ||
    description.trim() !== (v.description ?? "") ||
    status !== v.status ||
    needsReview !== v.needsReview;

  return (
    <Drawer
      open
      title={v.label}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            tone="primary"
            disabled={pending || !dirty}
            onClick={() =>
              onRun(
                () =>
                  saveValue(v.id, {
                    label,
                    description,
                    status,
                    needsReview,
                  }),
                onClose,
              )
            }
          >
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <Field
          label="Value"
          hint="Stored as Init Caps however it is typed. Renaming updates every record that carries it — records store the value, not the words."
        >
          <input
            className={inputClass}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onBlur={(e) => setLabel(titleCase(e.target.value.trim()))}
          />
        </Field>

        <Field
          label="Description"
          hint="For values whose names do not distinguish them. Jamdani and Jamevar do not."
        >
          <textarea
            className={`${inputClass} min-h-16 resize-y`}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional"
          />
        </Field>

        <Field
          label="Status"
          hint="Only Active values are offered when someone creates a record. Retiring leaves existing records untouched — they keep the value, it just stops being a choice."
        >
          <div className="flex flex-wrap gap-1.5">
            {LOOKUP_STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatusValue(s)}
                className={`rounded-md border px-2.5 py-1 text-[12.5px] transition-colors ${
                  status === s
                    ? "border-brick bg-brick-soft font-medium text-brick"
                    : "border-rule-2 text-muted hover:bg-surface-2"
                }`}
              >
                {statusLabel(s)}
              </button>
            ))}
          </div>
        </Field>

        <label className="flex items-start gap-2.5">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={needsReview}
            onChange={(e) => setNeedsReview(e.target.checked)}
          />
          <span>
            <span className="block text-[12.5px] font-medium text-ink-2">
              Needs review
            </span>
            <span className="mt-0.5 block text-[11.5px] leading-relaxed text-muted">
              Flagged for checking against real stock. Separate from status on
              purpose — a value can need checking at any point in its life.
            </span>
          </span>
        </label>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-rule pt-4 text-[12px]">
          <dt className="text-muted">Code</dt>
          <dd className="text-right font-mono text-ink-2">{v.code}</dd>

          <dt className="text-muted">Used by</dt>
          <dd className="text-right font-mono text-ink-2 tabular-nums">
            {v.usage} record{v.usage === 1 ? "" : "s"}
          </dd>

          {v.parentLabel !== null && (
            <>
              <dt className="text-muted">Belongs to</dt>
              <dd className="text-right text-ink-2">{v.parentLabel}</dd>
            </>
          )}

          <dt className="text-muted">Added</dt>
          <dd className="text-right text-ink-2">
            {new Date(v.createdAt).toLocaleDateString("en-GB", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </dd>
        </dl>

        <div className="border-t border-rule pt-4">
          <Field
            label="Merge into another value"
            hint="For two values that were always the same thing. Every record pointing at this one is repointed, then this one is removed."
          >
            <div className="flex gap-2">
              <select
                className={inputClass}
                value={mergeInto}
                onChange={(e) => setMergeInto(e.target.value)}
              >
                <option value="">Choose a value…</option>
                {siblings
                  .filter((s) => s.id !== v.id)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
              </select>
              <Button
                tone="danger"
                disabled={pending || mergeInto === ""}
                onClick={() => onRun(() => mergeValues(mergeInto, [v.id]), onClose)}
              >
                Merge
              </Button>
            </div>
          </Field>
        </div>
      </div>
    </Drawer>
  );
}

function AddDrawer({
  list,
  pending,
  onClose,
  onRun,
}: {
  list: VocabList;
  pending: boolean;
  onClose: () => void;
  onRun: (action: () => Promise<ActionResult>, onOk?: () => void) => void;
}) {
  const [label, setLabel] = useState("");

  return (
    <Drawer
      open
      title={`Add to ${list.label}`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            tone="primary"
            disabled={pending || label.trim() === ""}
            onClick={() => onRun(() => createValue(list.code, label), onClose)}
          >
            Add
          </Button>
        </>
      }
    >
      <Field
        label="Value"
        hint="Stored as Init Caps however it is typed. It arrives Active, so it is offered on new records straight away."
      >
        <input
          autoFocus
          className={inputClass}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
      </Field>
    </Drawer>
  );
}

function PasteDrawer({
  list,
  pending,
  onClose,
  onRun,
  showToast,
}: {
  list: VocabList;
  pending: boolean;
  onClose: () => void;
  onRun: (action: () => Promise<ActionResult>, onOk?: () => void) => void;
  showToast: (t: ActionResult) => void;
}) {
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<PastePreview | null>(null);
  const [checking, setChecking] = useState(false);

  async function check() {
    setChecking(true);
    const result = await previewPaste(list.code, text);
    setChecking(false);

    if ("ok" in result) showToast(result);
    else setPreview(result);
  }

  return (
    <Drawer
      open
      title={`Paste into ${list.label}`}
      onClose={onClose}
      footer={
        preview === null ? (
          <>
            <Button onClick={onClose}>Cancel</Button>
            <Button
              tone="primary"
              disabled={checking || text.trim() === ""}
              onClick={check}
            >
              {checking ? "Checking…" : "Check"}
            </Button>
          </>
        ) : (
          <>
            <Button onClick={() => setPreview(null)}>Back</Button>
            <Button
              tone="primary"
              disabled={pending || preview.fresh.length === 0}
              onClick={() =>
                onRun(() => commitPaste(list.code, preview.fresh), onClose)
              }
            >
              Add {preview.fresh.length}
            </Button>
          </>
        )
      }
    >
      {preview === null ? (
        <Field
          label="One value per line"
          hint="Straight out of the workbook — a pasted spreadsheet column works as-is. Nothing is written until you have seen what it would do."
        >
          <textarea
            autoFocus
            className={`${inputClass} min-h-56 resize-y font-mono text-[12.5px]`}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </Field>
      ) : (
        <div className="flex flex-col gap-5 text-[13px]">
          <PasteGroup
            title={`${preview.fresh.length} new`}
            tone="ok"
            items={preview.fresh}
            empty="Nothing new in that paste."
          />
          <PasteGroup
            title={`${preview.existing.length} already here`}
            tone="muted"
            items={preview.existing}
          />
          <PasteGroup
            title={`${preview.caseOnly.length} differ only by case`}
            tone="warn"
            items={preview.caseOnly.map((c) => `${c.pasted} → kept as ${c.stored}`)}
          />
        </div>
      )}
    </Drawer>
  );
}

function PasteGroup({
  title,
  tone,
  items,
  empty,
}: {
  title: string;
  tone: "ok" | "warn" | "muted";
  items: string[];
  empty?: string;
}) {
  if (items.length === 0 && empty === undefined) return null;

  const colour =
    tone === "ok" ? "var(--ok)" : tone === "warn" ? "var(--warn)" : "var(--muted)";

  return (
    <section>
      <h3 className="mb-1.5 text-[12px] font-medium" style={{ color: colour }}>
        {title}
      </h3>
      {items.length === 0 ? (
        <p className="text-[12.5px] text-muted">{empty}</p>
      ) : (
        <ul className="flex flex-wrap gap-1">
          {items.map((item) => (
            <li
              key={item}
              className="rounded px-1.5 py-0.5 text-[12px]"
              style={{ background: "var(--surface-2)", color: "var(--ink-2)" }}
            >
              {item}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import type { Category, Classification } from "@/lib/operational";

import {
  Button,
  Drawer,
  Field,
  Header,
  RowMenu,
  ToastBar,
  inputClass,
  useToast,
} from "../master-lists/ui";
import {
  addCategory,
  addClassification,
  deleteCategories,
  deleteClassifications,
  saveCategory,
  saveClassification,
  setCategoryStatus,
  setClassificationEnabled,
  type Result,
} from "./actions";

const LIST_STATUSES = ["draft", "active", "retired"];
const VALUE_STATUSES = ["draft", "proposed", "active", "retired"];

/**
 * The vocabulary as a structure, in two halves.
 *
 * Master Lists is for filling lists in — open Colour, add a colour. This is
 * for the shape above that: which classifications exist, which depend on
 * which, and which are switched on. Different question, so a different
 * screen, and the second section is filtered by the first because a category
 * only means anything inside a classification.
 */
export function OperationalStandard({
  classifications,
  categories,
}: {
  classifications: Classification[];
  categories: Category[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [toast, showToast] = useToast();

  const run = (action: () => Promise<Result>, onOk?: () => void) => {
    start(async () => {
      const result = await action();
      showToast(result);
      if (result.ok) {
        onOk?.();
        router.refresh();
      }
    });
  };

  return (
    <div className="flex min-h-screen flex-col">
      <Header
        title="Operational Standard"
        lede={`How the catalogue is classified. ${classifications.length} classifications holding ${categories.length} categories between them.`}
      />

      <div className="flex-1 px-8 py-6">
        <div className="mx-auto flex max-w-6xl flex-col gap-10">
          <Classifications
            rows={classifications}
            pending={pending}
            onRun={run}
          />
          <Categories
            rows={categories}
            classifications={classifications}
            pending={pending}
            onRun={run}
          />
        </div>
      </div>

      <ToastBar toast={toast} onDismiss={() => showToast(null)} />
    </div>
  );
}

/* ------------------------------------------------------------ section 1 */

function Classifications({
  rows,
  pending,
  onRun,
}: {
  rows: Classification[];
  pending: boolean;
  onRun: (action: () => Promise<Result>, onOk?: () => void) => void;
}) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const chosen = [...picked];
  const current = rows.find((r) => r.id === editing) ?? null;

  return (
    <section>
      <SectionHead
        title="Classification Structure"
        lede="Every question the catalogue can ask about a product. A classification that depends on another is only asked once that one is answered — Silk Sub Family after Fibre Type."
        action={
          <Button tone="primary" onClick={() => setAdding(true)}>
            Add classification
          </Button>
        }
      />

      {chosen.length > 0 && (
        <BulkBar
          count={chosen.length}
          onClear={() => setPicked(new Set())}
          actions={
            <>
              <Button
                disabled={pending}
                onClick={() =>
                  onRun(() => setClassificationEnabled(chosen, true), () =>
                    setPicked(new Set()),
                  )
                }
              >
                Enable
              </Button>
              <Button
                disabled={pending}
                onClick={() =>
                  onRun(() => setClassificationEnabled(chosen, false), () =>
                    setPicked(new Set()),
                  )
                }
              >
                Disable
              </Button>
              <Button
                tone="danger"
                disabled={pending}
                onClick={() =>
                  onRun(() => deleteClassifications(chosen), () => setPicked(new Set()))
                }
              >
                Delete
              </Button>
            </>
          }
        />
      )}

      <Table
        head={["Name", "Description", "Enabled", "Dependent", "Dependent On", "Status", ""]}
        widths={["", "w-72", "w-20", "w-24", "w-40", "w-24", "w-12"]}
        allPicked={rows.length > 0 && rows.every((r) => picked.has(r.id))}
        onPickAll={(on) => setPicked(on ? new Set(rows.map((r) => r.id)) : new Set())}
      >
        {rows.map((row) => (
          <tr
            key={row.id}
            className={`h-11 border-b border-rule last:border-b-0 hover:bg-surface-2 ${
              picked.has(row.id) ? "bg-brick-soft" : ""
            }`}
          >
            <Pick
              on={picked.has(row.id)}
              label={row.name}
              onChange={(on) =>
                setPicked((prev) => {
                  const next = new Set(prev);
                  if (on) next.add(row.id);
                  else next.delete(row.id);
                  return next;
                })
              }
            />

            <td className="max-w-0 px-3">
              <button
                type="button"
                onClick={() => setEditing(row.id)}
                className="flex w-full items-center gap-2 text-left"
              >
                <span
                  className={`truncate text-[13.5px] ${
                    row.isEnabled ? "text-ink" : "text-muted line-through"
                  }`}
                >
                  {row.name}
                </span>
                {row.isSystem && <Tag>System</Tag>}
                <span className="ml-auto flex-none font-mono text-[11.5px] text-faint">
                  {row.active}/{row.total}
                </span>
              </button>
            </td>

            <Cell muted>{row.description}</Cell>
            <YesNo
              value={row.isEnabled}
              onChange={(on) => onRun(() => setClassificationEnabled([row.id], on))}
            />
            <YesNo
              value={row.dependent}
              onChange={(on) => {
                // Yes on its own says nothing — a dependency needs something
                // to depend on, so choosing it opens the drawer to ask.
                if (on) setEditing(row.id);
                else onRun(() => saveClassification(row.id, { dependsOnId: null }));
              }}
            />
            <Cell muted>{row.dependsOn}</Cell>
            <Cell>{titleish(row.status)}</Cell>

            <td className="px-3">
              <RowMenu
                label={row.name}
                items={[
                  { label: "Modify", onSelect: () => setEditing(row.id) },
                  {
                    label: row.isEnabled ? "Disable" : "Enable",
                    disabled: pending,
                    onSelect: () =>
                      onRun(() => setClassificationEnabled([row.id], !row.isEnabled)),
                  },
                  {
                    label: "Delete",
                    danger: true,
                    disabled: pending || row.total > 0 || row.isSystem,
                    hint:
                      row.total > 0
                        ? "It still has categories — disable it instead"
                        : row.isSystem
                          ? "The application reads this one by code"
                          : undefined,
                    onSelect: () => onRun(() => deleteClassifications([row.id])),
                  },
                ]}
              />
            </td>
          </tr>
        ))}
      </Table>

      {current !== null && (
        <ClassificationDrawer
          row={current}
          others={rows.filter((r) => r.id !== current.id)}
          pending={pending}
          onClose={() => setEditing(null)}
          onRun={onRun}
        />
      )}

      {adding && (
        <AddDrawer
          title="Add classification"
          label="Name"
          hint="A new question the catalogue can ask. It starts empty; categories go in below."
          extra={(dependsOn, setDependsOn) => (
            <Field
              label="Depends on"
              hint="Leave blank unless this only makes sense under another classification."
            >
              <select
                className={inputClass}
                value={dependsOn}
                onChange={(e) => setDependsOn(e.target.value)}
              >
                <option value="">Nothing — it stands alone</option>
                {rows.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          pending={pending}
          onClose={() => setAdding(false)}
          onAdd={(name, dependsOn) =>
            onRun(
              () => addClassification(name, dependsOn === "" ? null : dependsOn),
              () => setAdding(false),
            )
          }
        />
      )}
    </section>
  );
}

/* ------------------------------------------------------------ section 2 */

function Categories({
  rows,
  classifications,
  pending,
  onRun,
}: {
  rows: Category[];
  classifications: Classification[];
  pending: boolean;
  onRun: (action: () => Promise<Result>, onOk?: () => void) => void;
}) {
  const [filter, setFilter] = useState("");
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();

    return rows.filter((r) => {
      if (filter !== "" && r.classificationId !== filter) return false;
      if (q !== "" && !r.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, filter, query]);

  const chosen = [...picked].filter((id) => shown.some((r) => r.id === id));
  const current = rows.find((r) => r.id === editing) ?? null;

  /** Candidate parents: the values of whatever this one's classification depends on. */
  const parentsFor = (categoryId: string): Category[] => {
    const row = rows.find((r) => r.id === categoryId);
    if (row === undefined) return [];

    const list = classifications.find((c) => c.id === row.classificationId);
    if (list?.dependsOnId == null) return [];

    return rows.filter((r) => r.classificationId === list.dependsOnId);
  };

  return (
    <section>
      <SectionHead
        title="Category List"
        lede="The values each classification can take. Filter by classification to work on one at a time."
        action={
          <Button
            tone="primary"
            disabled={filter === ""}
            title={filter === "" ? "Choose a classification first" : undefined}
            onClick={() => setAdding(true)}
          >
            Add category
          </Button>
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value);
            setPicked(new Set());
          }}
          aria-label="Filter by classification"
          className="w-56 rounded-md border border-rule-2 bg-surface px-2.5 py-1.5 text-[13px] text-ink"
        >
          <option value="">Every classification</option>
          {classifications.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.total})
            </option>
          ))}
        </select>

        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search categories"
          className="w-56 rounded-md border border-rule-2 bg-surface px-2.5 py-1.5 text-[13px] text-ink placeholder:text-faint"
        />

        <span className="text-[12.5px] text-muted">
          {shown.length} of {rows.length}
        </span>
      </div>

      {chosen.length > 0 && (
        <BulkBar
          count={chosen.length}
          onClear={() => setPicked(new Set())}
          actions={
            <>
              <Button
                disabled={pending}
                onClick={() =>
                  onRun(() => setCategoryStatus(chosen, "active"), () =>
                    setPicked(new Set()),
                  )
                }
              >
                Enable
              </Button>
              <Button
                disabled={pending}
                onClick={() =>
                  onRun(() => setCategoryStatus(chosen, "retired"), () =>
                    setPicked(new Set()),
                  )
                }
              >
                Disable
              </Button>
              <Button
                tone="danger"
                disabled={pending}
                onClick={() =>
                  onRun(() => deleteCategories(chosen), () => setPicked(new Set()))
                }
              >
                Delete
              </Button>
            </>
          }
        />
      )}

      <Table
        head={[
          "Name",
          "Description",
          "Enabled",
          "Dependent",
          "Belongs To",
          "Status",
          "",
        ]}
        widths={["", "w-64", "w-20", "w-24", "w-36", "w-24", "w-12"]}
        allPicked={shown.length > 0 && shown.every((r) => picked.has(r.id))}
        onPickAll={(on) => setPicked(on ? new Set(shown.map((r) => r.id)) : new Set())}
        empty={
          shown.length === 0
            ? rows.length === 0
              ? "No categories yet."
              : "Nothing matches."
            : null
        }
      >
        {shown.map((row) => (
          <tr
            key={row.id}
            className={`h-11 border-b border-rule last:border-b-0 hover:bg-surface-2 ${
              picked.has(row.id) ? "bg-brick-soft" : ""
            }`}
          >
            <Pick
              on={picked.has(row.id)}
              label={row.name}
              onChange={(on) =>
                setPicked((prev) => {
                  const next = new Set(prev);
                  if (on) next.add(row.id);
                  else next.delete(row.id);
                  return next;
                })
              }
            />

            <td className="max-w-0 px-3">
              <button
                type="button"
                onClick={() => setEditing(row.id)}
                className="flex w-full items-center gap-2 text-left"
              >
                <span
                  className={`truncate text-[13.5px] ${
                    row.isEnabled ? "text-ink" : "text-muted line-through"
                  }`}
                >
                  {row.name}
                </span>
                {filter === "" && (
                  <span className="ml-auto flex-none truncate text-[11.5px] text-faint">
                    {row.classification}
                  </span>
                )}
              </button>
            </td>

            <Cell muted>{row.description}</Cell>
            <YesNo
              value={row.isEnabled}
              onChange={(on) =>
                onRun(() =>
                  setCategoryStatus([row.id], on ? "active" : "retired"),
                )
              }
            />
            {/*
              Read-only, and not for want of wiring.

              Whether a category is dependent is a fact about its
              classification, not about it: every Motif is dependent because
              Motif depends on Motif Category. Letting one Motif be dependent
              and the next not would describe a shape the form cannot ask
              for. It is changed one row up, in Classification Structure.
            */}
            <YesNo
              value={row.dependent}
              disabled
              reason={`Set on the classification.  , so all of its categories do.`}
              onChange={() => undefined}
            />
            <Cell muted>{row.belongsTo}</Cell>
            <Cell>{titleish(row.status)}</Cell>

            <td className="px-3">
              <RowMenu
                label={row.name}
                items={[
                  { label: "Modify", onSelect: () => setEditing(row.id) },
                  {
                    label: row.isEnabled ? "Disable" : "Enable",
                    disabled: pending,
                    onSelect: () =>
                      onRun(() =>
                        setCategoryStatus(
                          [row.id],
                          row.isEnabled ? "retired" : "active",
                        ),
                      ),
                  },
                  {
                    label: "Delete",
                    danger: true,
                    disabled: pending || row.usage > 0,
                    hint:
                      row.usage > 0
                        ? `${row.usage} record${row.usage === 1 ? "" : "s"} use this — disable it instead`
                        : undefined,
                    onSelect: () => onRun(() => deleteCategories([row.id])),
                  },
                ]}
              />
            </td>
          </tr>
        ))}
      </Table>

      {current !== null && (
        <CategoryDrawer
          row={current}
          parents={parentsFor(current.id)}
          pending={pending}
          onClose={() => setEditing(null)}
          onRun={onRun}
        />
      )}

      {adding && filter !== "" && (
        <AddDrawer
          title={`Add to ${classifications.find((c) => c.id === filter)?.name}`}
          label="Name"
          hint="Stored as Init Caps however it is typed."
          pending={pending}
          onClose={() => setAdding(false)}
          onAdd={(name) =>
            onRun(() => addCategory(filter, name, null), () => setAdding(false))
          }
        />
      )}
    </section>
  );
}

/* ------------------------------------------------------------- drawers */

function ClassificationDrawer({
  row,
  others,
  pending,
  onClose,
  onRun,
}: {
  row: Classification;
  others: Classification[];
  pending: boolean;
  onClose: () => void;
  onRun: (action: () => Promise<Result>, onOk?: () => void) => void;
}) {
  const [name, setName] = useState(row.name);
  const [description, setDescription] = useState(row.description ?? "");
  const [dependsOn, setDependsOn] = useState(row.dependsOnId ?? "");
  const [status, setStatus] = useState(row.status);
  const [isEnabled, setIsEnabled] = useState(row.isEnabled);

  return (
    <Drawer
      open
      title={row.name}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            tone="primary"
            disabled={pending}
            onClick={() =>
              onRun(
                () =>
                  saveClassification(row.id, {
                    name,
                    description,
                    dependsOnId: dependsOn === "" ? null : dependsOn,
                    status,
                    isEnabled,
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
        <Field label="Name">
          <input
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>

        <Field label="Description" hint="What this classification is for.">
          <textarea
            className={`${inputClass} min-h-16 resize-y`}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional"
          />
        </Field>

        <Field
          label="Depends on"
          hint="A dependent classification is only asked once its parent is answered — Silk Sub Family after Fibre Type. Its categories then say which parent value they belong to."
        >
          <select
            className={inputClass}
            value={dependsOn}
            onChange={(e) => setDependsOn(e.target.value)}
          >
            <option value="">Nothing — it stands alone</option>
            {others.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Status">
          <div className="flex gap-1.5">
            {LIST_STATUSES.map((s) => (
              <Choice key={s} on={status === s} onPick={() => setStatus(s)}>
                {titleish(s)}
              </Choice>
            ))}
          </div>
        </Field>

        <label className="flex items-start gap-2.5">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={isEnabled}
            onChange={(e) => setIsEnabled(e.target.checked)}
          />
          <span>
            <span className="block text-[12.5px] font-medium text-ink-2">Enabled</span>
            <span className="mt-0.5 block text-[11.5px] leading-relaxed text-muted">
              A disabled classification stops being asked on new records.
              Records that already answered it keep their answer.
            </span>
          </span>
        </label>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-rule pt-4 text-[12px]">
          <dt className="text-muted">Code</dt>
          <dd className="text-right font-mono text-ink-2">{row.code}</dd>
          <dt className="text-muted">Categories</dt>
          <dd className="text-right font-mono text-ink-2 tabular-nums">
            {row.active} active of {row.total}
          </dd>
        </dl>
      </div>
    </Drawer>
  );
}

function CategoryDrawer({
  row,
  parents,
  pending,
  onClose,
  onRun,
}: {
  row: Category;
  parents: Category[];
  pending: boolean;
  onClose: () => void;
  onRun: (action: () => Promise<Result>, onOk?: () => void) => void;
}) {
  const [name, setName] = useState(row.name);
  const [description, setDescription] = useState(row.description ?? "");
  const [belongsTo, setBelongsTo] = useState(row.belongsToId ?? "");
  const [status, setStatus] = useState<string>(row.status);

  return (
    <Drawer
      open
      title={row.name}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            tone="primary"
            disabled={pending}
            onClick={() =>
              onRun(
                () =>
                  saveCategory(row.id, {
                    name,
                    description,
                    status,
                    belongsToId: belongsTo === "" ? null : belongsTo,
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
        <Field label="Name">
          <input
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>

        <Field label="Description">
          <textarea
            className={`${inputClass} min-h-16 resize-y`}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional"
          />
        </Field>

        {row.dependent && (
          <Field
            label="Belongs to"
            hint={`${row.classification} depends on another classification, so each of its categories names the one it sits under.`}
          >
            <select
              className={inputClass}
              value={belongsTo}
              onChange={(e) => setBelongsTo(e.target.value)}
            >
              <option value="">Not set</option>
              {parents.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
        )}

        <Field
          label="Status"
          hint="Only Active categories are offered on a new record. Records already carrying one keep it whatever this says."
        >
          <div className="flex flex-wrap gap-1.5">
            {VALUE_STATUSES.map((s) => (
              <Choice key={s} on={status === s} onPick={() => setStatus(s)}>
                {titleish(s)}
              </Choice>
            ))}
          </div>
        </Field>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-rule pt-4 text-[12px]">
          <dt className="text-muted">Classification</dt>
          <dd className="text-right text-ink-2">{row.classification}</dd>
          <dt className="text-muted">Used by</dt>
          <dd className="text-right font-mono text-ink-2 tabular-nums">
            {row.usage} record{row.usage === 1 ? "" : "s"}
          </dd>
        </dl>
      </div>
    </Drawer>
  );
}

function AddDrawer({
  title,
  label,
  hint,
  extra,
  pending,
  onClose,
  onAdd,
}: {
  title: string;
  label: string;
  hint: string;
  extra?: (
    value: string,
    set: (next: string) => void,
  ) => React.ReactNode;
  pending: boolean;
  onClose: () => void;
  onAdd: (name: string, extraValue: string) => void;
}) {
  const [name, setName] = useState("");
  const [extraValue, setExtraValue] = useState("");

  return (
    <Drawer
      open
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            tone="primary"
            disabled={pending || name.trim() === ""}
            onClick={() => onAdd(name, extraValue)}
          >
            Add
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <Field label={label} hint={hint}>
          <input
            autoFocus
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>

        {extra?.(extraValue, setExtraValue)}
      </div>
    </Drawer>
  );
}

/* --------------------------------------------------------------- bits */

function SectionHead({
  title,
  lede,
  action,
}: {
  title: string;
  lede: string;
  action: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h2 className="text-[16px] font-semibold text-ink">{title}</h2>
        <p className="mt-0.5 max-w-3xl text-[12.5px] leading-relaxed text-muted">
          {lede}
        </p>
      </div>
      <div className="flex-none">{action}</div>
    </div>
  );
}

function BulkBar({
  count,
  actions,
  onClear,
}: {
  count: number;
  actions: React.ReactNode;
  onClear: () => void;
}) {
  return (
    <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg bg-brick-soft px-3 py-2">
      <span className="text-[12.5px] font-medium text-brick-2">
        {count} selected
      </span>
      <span className="mx-1 h-4 w-px bg-rule-2" />
      {actions}
      <button
        type="button"
        onClick={onClear}
        className="ml-1 text-[12.5px] text-muted hover:text-ink hover:underline"
      >
        Clear
      </button>
    </div>
  );
}

function Table({
  head,
  widths,
  allPicked,
  onPickAll,
  empty,
  children,
}: {
  head: string[];
  widths: string[];
  allPicked: boolean;
  onPickAll: (on: boolean) => void;
  empty?: string | null;
  children: React.ReactNode;
}) {
  if (empty != null) {
    return (
      <p className="rounded-lg border border-dashed border-rule-2 px-4 py-10 text-center text-[13px] text-muted">
        {empty}
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-rule bg-surface">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-rule bg-surface-2 text-left">
            <th scope="col" className="w-10 px-3 py-2">
              <input
                type="checkbox"
                aria-label="Select all"
                checked={allPicked}
                onChange={(e) => onPickAll(e.target.checked)}
              />
            </th>
            {head.map((h, i) => (
              <th
                key={h === "" ? `blank-${i}` : h}
                scope="col"
                className={`${widths[i] ?? ""} px-3 py-2 text-[11.5px] font-medium whitespace-nowrap text-muted`}
              >
                {h === "" ? <span className="sr-only">Actions</span> : h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function Pick({
  on,
  label,
  onChange,
}: {
  on: boolean;
  label: string;
  onChange: (on: boolean) => void;
}) {
  return (
    <td className="px-3">
      <input
        type="checkbox"
        aria-label={`Select ${label}`}
        checked={on}
        onChange={(e) => onChange(e.target.checked)}
      />
    </td>
  );
}

function Cell({
  children,
  muted,
}: {
  children: React.ReactNode;
  muted?: boolean;
}) {
  const text = children == null || children === "" ? "—" : children;

  return (
    <td className="max-w-0 px-3">
      <span
        className={`block truncate text-[12.5px] ${muted === true ? "text-muted" : "text-ink-2"}`}
        title={typeof text === "string" ? text : undefined}
      >
        {text}
      </span>
    </td>
  );
}

function Choice({
  on,
  onPick,
  children,
}: {
  on: boolean;
  onPick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      className={`rounded-md border px-2.5 py-1 text-[12.5px] transition-colors ${
        on
          ? "border-brick bg-brick-soft font-medium text-brick"
          : "border-rule-2 text-muted hover:bg-surface-2"
      }`}
    >
      {children}
    </button>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="flex-none rounded px-1.5 py-0.5 text-[10.5px] font-medium"
      style={{ background: "var(--surface-3)", color: "var(--muted)" }}
    >
      {children}
    </span>
  );
}

/** Draft → Draft. Only ever applied to the status words, which are one word. */
function titleish(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * A Yes/No cell you can change where it sits.
 *
 * Plain text until the pointer is over it, like the lookup cells on Product
 * Records — a grid whose every cell looks like a form control has stopped
 * being a grid. The two share nothing but the idea; this one has two fixed
 * answers and no popover to place.
 */
function YesNo({
  value,
  onChange,
  disabled,
  reason,
}: {
  value: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  /** Why it cannot be changed, shown on hover. */
  reason?: string;
}) {
  if (disabled === true) {
    return (
      <td className="px-3">
        <span
          title={reason}
          className="text-[12.5px] text-muted"
          // Dotted underline rather than a disabled control: there is nothing
          // to disable, because this one is worked out rather than chosen.
          style={{ textDecoration: "underline dotted", textUnderlineOffset: 3 }}
        >
          {value ? "Yes" : "No"}
        </span>
      </td>
    );
  }

  return (
    <td className="px-3">
      <select
        value={value ? "yes" : "no"}
        onChange={(e) => onChange(e.target.value === "yes")}
        aria-label={value ? "Yes" : "No"}
        className="-mx-1 w-full cursor-pointer rounded border border-transparent bg-transparent px-1 py-0.5 text-[12.5px] text-ink-2 hover:border-rule-2 hover:bg-surface focus:border-brick focus:outline-none"
      >
        <option value="yes">Yes</option>
        <option value="no">No</option>
      </select>
    </td>
  );
}

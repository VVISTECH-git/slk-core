"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import type { Category, Classification } from "@/lib/operational";

import {
  Button,
  Drawer,
  Field,
  Header,
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

/**
 * The columns, stated once.
 *
 * Module level rather than inside the component so the identity is stable —
 * `useSortFilter` memoises on the array, and rebuilding it every render would
 * re-sort the table on every keystroke.
 */
const CLASSIFICATION_COLUMNS: Col<Classification>[] = [
  { key: "name", label: "Name", width: "w-56", value: (r) => r.name, filter: "text" },
  {
    key: "description",
    label: "Description",
    value: (r) => r.description ?? "",
    filter: "text",
  },
  {
    key: "enabled",
    label: "Enabled",
    width: "w-20",
    value: (r) => (r.isEnabled ? "Yes" : "No"),
    filter: "choice",
  },
  {
    key: "dependent",
    label: "Dependent",
    width: "w-24",
    value: (r) => (r.dependent ? "Yes" : "No"),
    filter: "choice",
  },
  {
    key: "dependsOn",
    label: "Dependent On",
    width: "w-40",
    value: (r) => r.dependsOn ?? "",
    filter: "choice",
  },
  {
    key: "status",
    label: "Status",
    width: "w-24",
    value: (r) => titleish(r.status),
    filter: "choice",
  },
];

const CATEGORY_COLUMNS: Col<Category>[] = [
  { key: "name", label: "Name", width: "w-56", value: (r) => r.name, filter: "text" },
  {
    key: "description",
    label: "Description",
    value: (r) => r.description ?? "",
    filter: "text",
  },
  {
    key: "enabled",
    label: "Enabled",
    width: "w-20",
    value: (r) => (r.isEnabled ? "Yes" : "No"),
    filter: "choice",
  },
  {
    key: "dependent",
    label: "Dependent",
    width: "w-24",
    value: (r) => (r.dependent ? "Yes" : "No"),
    filter: "choice",
  },
  {
    key: "belongsTo",
    label: "Belongs To",
    width: "w-40",
    value: (r) => r.belongsTo ?? "",
    filter: "choice",
  },
  {
    key: "status",
    label: "Status",
    width: "w-24",
    value: (r) => titleish(r.status),
    filter: "choice",
  },
];

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

  const { shown, sort, toggle, filters, setFilter, clear, active } =
    useSortFilter(rows, CLASSIFICATION_COLUMNS, sinkDisabled);

  const chosen = [...picked].filter((id) => shown.some((r) => r.id === id));
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

      <div className="mb-3">
        <Counted
          shown={shown.length}
          total={rows.length}
          active={active}
          onClear={clear}
        />
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
        empty={
          shown.length === 0
            ? active > 0
              ? "Nothing matches those filters."
              : "No classifications yet."
            : null
        }
        allPicked={shown.length > 0 && shown.every((r) => picked.has(r.id))}
        onPickAll={(on) => setPicked(on ? new Set(shown.map((r) => r.id)) : new Set())}
        head={
          <Head
            columns={CLASSIFICATION_COLUMNS}
            rows={rows}
            sort={sort}
            onSort={toggle}
            filters={filters}
            onFilter={setFilter}
            allPicked={shown.length > 0 && shown.every((r) => picked.has(r.id))}
            onPickAll={(on) =>
              setPicked(on ? new Set(shown.map((r) => r.id)) : new Set())
            }
          />
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

            <RowActions
              label={row.name}
              enabled={row.isEnabled}
              pending={pending}
              blocked={
                row.total > 0
                  ? "It still has categories — disable it instead"
                  : row.isSystem
                    ? "The application reads this one by code"
                    : undefined
              }
              onModify={() => setEditing(row.id)}
              onToggle={() =>
                onRun(() => setClassificationEnabled([row.id], !row.isEnabled))
              }
              onDelete={() => onRun(() => deleteClassifications([row.id]))}
            />
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
                {rows
                  .filter((r) => r.isEnabled)
                  .map((r) => (
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
  const [list, setList] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  // Nothing until a classification is chosen. All 227 values at once is a
  // list of everything, which is a list of nothing in particular — the work
  // here is always inside one classification.
  const inList = useMemo(
    () => (list === "" ? [] : rows.filter((r) => r.classificationId === list)),
    [rows, list],
  );

  const { shown, sort, toggle, filters, setFilter, clear, active } =
    useSortFilter(inList, CATEGORY_COLUMNS, sinkDisabled);

  const chosen = [...picked].filter((id) => shown.some((r) => r.id === id));
  const current = rows.find((r) => r.id === editing) ?? null;

  /** Candidate parents: the values of whatever this one's classification depends on. */
  const parentsFor = (categoryId: string): Category[] => {
    const row = rows.find((r) => r.id === categoryId);
    if (row === undefined) return [];

    const list = classifications.find((c) => c.id === row.classificationId);
    if (list?.dependsOnId == null) return [];

    // Disabled categories are not offered as a parent, but the one already
    // chosen stays in the list so saving cannot quietly drop it.
    return rows.filter(
      (r) =>
        r.classificationId === list.dependsOnId &&
        (r.isEnabled || r.id === row.belongsToId),
    );
  };

  return (
    <section>
      <SectionHead
        title="Category List"
        lede="The values each classification can take. Choose a classification to work on one at a time."
        action={
          <Button
            tone="primary"
            disabled={list === ""}
            title={list === "" ? "Choose a classification first" : undefined}
            onClick={() => setAdding(true)}
          >
            Add category
          </Button>
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select
          value={list}
          onChange={(e) => {
            setList(e.target.value);
            setPicked(new Set());
            clear();
          }}
          aria-label="Classification"
          className="w-64 rounded-md border border-rule-2 bg-surface px-2.5 py-1.5 text-[13px] text-ink"
        >
          <option value="">Choose a classification…</option>
          {classifications
            // Switched-off classifications are not offered. They are still
            // in the section above, which is where they get switched back on.
            .filter((c) => c.isEnabled)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.total})
              </option>
            ))}
        </select>

        {list !== "" && (
          <Counted
            shown={shown.length}
            total={inList.length}
            active={active}
            onClear={clear}
          />
        )}
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
        allPicked={shown.length > 0 && shown.every((r) => picked.has(r.id))}
        onPickAll={(on) => setPicked(on ? new Set(shown.map((r) => r.id)) : new Set())}
        empty={
          list === ""
            ? "Choose a classification above to see its categories."
            : shown.length === 0
              ? active > 0
                ? "Nothing matches those filters."
                : "This classification has no categories yet."
              : null
        }
        head={
          <Head
            columns={CATEGORY_COLUMNS}
            rows={inList}
            sort={sort}
            onSort={toggle}
            filters={filters}
            onFilter={setFilter}
            allPicked={shown.length > 0 && shown.every((r) => picked.has(r.id))}
            onPickAll={(on) =>
              setPicked(on ? new Set(shown.map((r) => r.id)) : new Set())
            }
          />
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
                {row.usage > 0 && (
                  <span className="ml-auto flex-none font-mono text-[11.5px] text-faint">
                    {row.usage}
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
              reason={` , so all of its categories do.`}
              onChange={() => undefined}
            />
            <Cell muted>{row.belongsTo}</Cell>
            <Cell>{titleish(row.status)}</Cell>

            <RowActions
              label={row.name}
              enabled={row.isEnabled}
              pending={pending}
              blocked={
                row.usage > 0
                  ? `${row.usage} record${row.usage === 1 ? "" : "s"} use this — disable it instead`
                  : undefined
              }
              onModify={() => setEditing(row.id)}
              onToggle={() =>
                onRun(() =>
                  setCategoryStatus(
                    [row.id],
                    row.isEnabled ? "retired" : "active",
                  ),
                )
              }
              onDelete={() => onRun(() => deleteCategories([row.id]))}
            />
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

      {adding && list !== "" && (
        <AddDrawer
          title={`Add to ${classifications.find((c) => c.id === list)?.name}`}
          label="Name"
          hint="Stored as Init Caps however it is typed."
          pending={pending}
          onClose={() => setAdding(false)}
          onAdd={(name) =>
            onRun(() => addCategory(list, name, null), () => setAdding(false))
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
            {/* Disabled classifications are not offered — except the one already
                chosen, which stays so that saving does not quietly drop it. */}
            {others
              .filter((o) => o.isEnabled || o.id === row.dependsOnId)
              .map((o) => (
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

/**
 * How much of the table is showing, and a way back.
 *
 * It lives outside the table because when the filters empty it, the head goes
 * with the rows — leaving nowhere to clear them from if the control were in
 * the head.
 */
function Counted({
  shown,
  total,
  active,
  onClear,
}: {
  shown: number;
  total: number;
  active: number;
  onClear: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-3 text-[12.5px] text-muted">
      <span>
        {shown} of {total}
      </span>
      {active > 0 && (
        <button
          type="button"
          onClick={onClear}
          className="text-brick hover:underline"
        >
          Clear {active} filter{active === 1 ? "" : "s"}
        </button>
      )}
    </span>
  );
}

function Table({
  head,
  allPicked,
  onPickAll,
  empty,
  children,
}: {
  head: React.ReactNode;
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
        {head}
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

/** Disabled rows sink. One function, module level, so the memo holds. */
const sinkDisabled = (row: { isEnabled: boolean }): boolean => !row.isEnabled;

/**
 * Modify, disable and delete, out where they can be seen.
 *
 * They were behind a three-dot menu, which costs a click and a guess to reach
 * three actions that are always the same three. At this width the icons fit,
 * so they sit in the row — muted until the pointer is over it, so a long
 * table does not read as a wall of controls.
 */
function RowActions({
  label,
  enabled,
  pending,
  blocked,
  onModify,
  onToggle,
  onDelete,
}: {
  label: string;
  enabled: boolean;
  pending: boolean;
  /** Why delete is refused, or undefined when it is allowed. */
  blocked?: string;
  onModify: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  return (
    <td className="px-3">
      <div className="flex items-center justify-end gap-0.5">
        <IconButton
          title={`Modify ${label}`}
          disabled={pending}
          onClick={onModify}
        >
          <path d="M11.5 2.5 13.5 4.5 5.5 12.5 2.5 13.5 3.5 10.5z" />
        </IconButton>

        <IconButton
          title={`${enabled ? "Disable" : "Enable"} ${label}`}
          disabled={pending}
          onClick={onToggle}
        >
          <circle cx="8" cy="8" r="5.5" />
          {enabled ? (
            <path d="M4.1 11.9 11.9 4.1" />
          ) : (
            <path d="M5.5 8.2 7.2 10 10.5 6.2" />
          )}
        </IconButton>

        <IconButton
          title={blocked ?? `Delete ${label}`}
          danger
          disabled={pending || blocked !== undefined}
          onClick={onDelete}
        >
          <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5 5 13.5h6l.5-9" />
        </IconButton>
      </div>
    </td>
  );
}

function IconButton({
  title,
  onClick,
  disabled,
  danger,
  children,
}: {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={`rounded p-1 transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${
        danger === true
          ? "text-muted hover:bg-brick-soft hover:text-brick disabled:hover:bg-transparent disabled:hover:text-muted"
          : "text-muted hover:bg-surface-3 hover:text-ink disabled:hover:bg-transparent"
      }`}
    >
      <svg
        aria-hidden
        viewBox="0 0 16 16"
        width="15"
        height="15"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {children}
      </svg>
    </button>
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

/* -------------------------------------------------------- sort & filter */

/**
 * What a column is, for sorting and filtering.
 *
 * `value` is the one string the column stands for — it does the sorting, the
 * text matching and the choice list all at once. Deriving three behaviours
 * from one function is what stops a column sorting by one thing while
 * filtering by another.
 */
export interface Col<T> {
  key: string;
  label: string;
  width?: string;
  value: (row: T) => string;
  /** Free text matches on `value`; choice offers exactly what is present. */
  filter: "text" | "choice";
}

export interface Sort {
  key: string;
  dir: 1 | -1;
}

/**
 * Sorting and per-column filtering over a list of rows.
 *
 * Everything in the browser: the largest table here is 231 rows, already
 * loaded, and a filter that goes back to the server is the difference
 * between a list that responds as you type and one that blinks.
 */
export function useSortFilter<T>(
  rows: T[],
  columns: Col<T>[],
  /**
   * Rows to sink to the bottom whatever the sort — the disabled ones.
   *
   * Applied before the sort rather than instead of it, so the live rows stay
   * contiguous at the top and the switched-off ones collect at the end where
   * they can still be found and switched back on.
   */
  sink?: (row: T) => boolean,
) {
  const [sort, setSort] = useState<Sort | null>(null);
  const [filters, setFilters] = useState<Record<string, string>>({});

  const shown = useMemo(() => {
    let out = rows.filter((row) =>
      columns.every((c) => {
        const want = filters[c.key];
        if (want === undefined || want === "") return true;

        const has = c.value(row);
        return c.filter === "choice"
          ? has === want
          : has.toLowerCase().includes(want.toLowerCase());
      }),
    );

    const column =
      sort === null ? undefined : columns.find((c) => c.key === sort.key);

    // Always sorted, even with no column chosen: the comparator returns 0 and
    // Array#sort is stable, so unsorted means the order it arrived in — with
    // the disabled rows still sunk.
    return [...out].sort((a, b) => {
      if (sink !== undefined) {
        const x = sink(a) ? 1 : 0;
        const y = sink(b) ? 1 : 0;
        if (x !== y) return x - y;
      }

      if (column === undefined || sort === null) return 0;

      // Blanks last whichever way it is sorted. A column of dashes floating
      // to the top is never what anyone wanted.
      const x = column.value(a);
      const y = column.value(b);
      if (x === "" && y !== "") return 1;
      if (y === "" && x !== "") return -1;

      return x.localeCompare(y, undefined, { numeric: true }) * sort.dir;
    });
  }, [rows, columns, filters, sort, sink]);

  const toggle = (key: string) =>
    setSort((prev) =>
      prev?.key === key
        ? prev.dir === 1
          ? { key, dir: -1 }
          : // Third click clears it, so there is a way back to the order the
            // data came in rather than only two sorted states.
            null
        : { key, dir: 1 },
    );

  const setFilter = (key: string, value: string) =>
    setFilters((prev) => ({ ...prev, [key]: value }));

  const active = Object.values(filters).filter((v) => v !== "").length;

  return {
    shown,
    sort,
    toggle,
    filters,
    setFilter,
    clear: () => setFilters({}),
    active,
  };
}

/**
 * The head: a sort control per column, and a filter under it.
 *
 * The filters are a row of their own rather than hidden behind icons.
 * Product Records went the other way — one Filter button, because filtering
 * there is occasional and the grid is for reading. This screen exists to be
 * worked through, so the controls stay out where they can be reached.
 */
export function Head<T>({
  columns,
  rows,
  sort,
  onSort,
  filters,
  onFilter,
  allPicked,
  onPickAll,
}: {
  columns: Col<T>[];
  rows: T[];
  sort: Sort | null;
  onSort: (key: string) => void;
  filters: Record<string, string>;
  onFilter: (key: string, value: string) => void;
  allPicked: boolean;
  onPickAll: (on: boolean) => void;
}) {
  return (
    <thead>
      <tr className="bg-surface-2 text-left">
        <th scope="col" className="w-10 px-3 pt-2">
          <input
            type="checkbox"
            aria-label="Select all shown"
            checked={allPicked}
            onChange={(e) => onPickAll(e.target.checked)}
          />
        </th>

        {columns.map((c) => {
          const on = sort?.key === c.key;

          return (
            <th
              key={c.key}
              scope="col"
              className={`${c.width ?? ""} px-3 pt-2 text-[11.5px] font-medium whitespace-nowrap text-muted`}
            >
              <button
                type="button"
                onClick={() => onSort(c.key)}
                aria-label={`Sort by ${c.label}`}
                className="group flex w-full items-center gap-1 hover:text-ink"
              >
                {c.label}
                <span
                  aria-hidden
                  className={
                    on
                      ? "text-brick"
                      : "opacity-0 transition-opacity group-hover:opacity-40"
                  }
                >
                  {on ? (sort.dir > 0 ? "↑" : "↓") : "↕"}
                </span>
              </button>
            </th>
          );
        })}

        <th scope="col" className="w-24 px-3 pt-2">
          <span className="sr-only">Actions</span>
        </th>
      </tr>

      <tr className="border-b border-rule bg-surface-2">
        <th className="px-3 pb-2" />

        {columns.map((c) => (
          <th key={c.key} className="px-3 pb-2">
            {c.filter === "choice" ? (
              <select
                value={filters[c.key] ?? ""}
                onChange={(e) => onFilter(c.key, e.target.value)}
                aria-label={`Filter by ${c.label}`}
                className={`w-full rounded border bg-surface px-1.5 py-1 text-[11.5px] font-normal ${
                  (filters[c.key] ?? "") === ""
                    ? "border-rule-2 text-muted"
                    : "border-brick text-brick"
                }`}
              >
                <option value="">All</option>
                {/* Only values that are actually present, so a filter can
                    never produce an empty table. */}
                {[...new Set(rows.map((r) => c.value(r)).filter((v) => v !== ""))]
                  .sort()
                  .map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
              </select>
            ) : (
              <input
                type="search"
                value={filters[c.key] ?? ""}
                onChange={(e) => onFilter(c.key, e.target.value)}
                placeholder="Filter"
                aria-label={`Filter by ${c.label}`}
                className={`w-full rounded border bg-surface px-1.5 py-1 text-[11.5px] font-normal placeholder:text-faint ${
                  (filters[c.key] ?? "") === ""
                    ? "border-rule-2 text-ink"
                    : "border-brick text-ink"
                }`}
              />
            )}
          </th>
        ))}

        <th className="px-3 pb-2" />
      </tr>
    </thead>
  );
}

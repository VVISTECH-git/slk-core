"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { titleCase } from "@slk/domain/naming";
import { stockAt } from "@slk/domain/stock";

// Type-only, so the module that imports `db` is erased at build time rather
// than following this client component into the browser bundle.
import type { LocationRow } from "@/lib/locations";

import {
  Button,
  Drawer,
  Field,
  Header,
  RowMenu,
  ToastBar,
  inputClass,
  useToast,
} from "@/components/ui";
import {
  createLocation,
  deleteLocation,
  saveLocation,
  type ActionResult,
} from "./actions";

/**
 * Locations have a screen of their own rather than a place among the lookup
 * lists. Underneath they are their own table — the ledger points at them, on
 * hand is defined as internal minus external, and a location will want an
 * address one day — but that is the schema's business, not the reader's.
 */
export function Locations({ locations }: { locations: LocationRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [toast, showToast] = useToast();
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

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

  const internal = locations.filter((l) => l.isInternal);
  const external = locations.filter((l) => !l.isInternal);
  const held = internal.reduce((sum, l) => sum + stockAt(l), 0);

  /**
   * How much of that total sits against records Product Management hides.
   *
   * Said in the lede rather than left to be discovered. This number was the
   * whole of the difference between "119 units held" here and nineteen on
   * Product Management, and a total nobody can reconcile is a total nobody
   * trusts.
   */
  const archived = internal.reduce((sum, l) => sum + Math.max(0, l.archived), 0);

  const current = editing === null ? null : locations.find((l) => l.id === editing);

  return (
    <div className="flex min-h-screen flex-col">
      <Header
        title="Locations"
        lede={
          `Where stock sits, and where it goes when it leaves. ${held} unit${held === 1 ? "" : "s"} held across ${internal.length} internal location${internal.length === 1 ? "" : "s"}` +
          (archived > 0
            ? `, ${archived} of them against archived records — Product Management lists those only when asked.`
            : ".")
        }
        actions={
          <Button tone="primary" onClick={() => setAdding(true)}>
            Add location
          </Button>
        }
      />

      <div className="flex-1 px-8 py-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-7">
          <Group
            title="Ours"
            lede="Stock in these is stock we hold. The Stock tab offers them when a record's opening quantity is entered."
            rows={internal}
            pending={pending}
            onEdit={setEditing}
            onRun={run}
          />

          <Group
            title="Everywhere else"
            lede="Stock that has reached one of these has left us — sold, scrapped, or still being made. They are one half of the arithmetic: on hand is what is in Ours minus what has gone to these."
            rows={external}
            pending={pending}
            onEdit={setEditing}
            onRun={run}
          />
        </div>
      </div>

      {current !== undefined && current !== null && (
        <EditDrawer
          row={current}
          pending={pending}
          onClose={() => setEditing(null)}
          onRun={run}
        />
      )}

      {adding && (
        <AddDrawer
          pending={pending}
          onClose={() => setAdding(false)}
          onRun={run}
        />
      )}

      <ToastBar toast={toast} onDismiss={() => showToast(null)} />
    </div>
  );
}

function Group({
  title,
  lede,
  rows,
  pending,
  onEdit,
  onRun,
}: {
  title: string;
  lede: string;
  rows: LocationRow[];
  pending: boolean;
  onEdit: (id: string) => void;
  onRun: (action: () => Promise<ActionResult>) => void;
}) {
  return (
    <section>
      <h2 className="text-[14px] font-semibold text-ink">
        {title}
        <span className="ml-2 font-mono text-[12px] font-normal text-muted tabular-nums">
          {rows.length}
        </span>
      </h2>
      <p className="mt-0.5 mb-2.5 max-w-2xl text-[12px] leading-relaxed text-muted">
        {lede}
      </p>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-rule-2 px-4 py-6 text-center text-[13px] text-muted">
          None yet.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-rule bg-surface">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-rule bg-surface-2 text-left">
                <th scope="col" className="px-4 py-2 text-[11.5px] font-medium text-muted">
                  Location
                </th>
                <th scope="col" className="w-32 px-3 py-2 text-[11.5px] font-medium text-muted">
                  Code
                </th>
                <th scope="col" className="w-24 px-3 py-2 text-right text-[11.5px] font-medium text-muted">
                  {/*
                    Different question per kind. "On hand" for an external
                    location would be in-minus-out, which for Production is
                    −585: true, and no use to anyone. What is worth knowing
                    about somewhere stock leaves for is how much has gone.
                  */}
                  {rows[0]?.isInternal === false ? "Sent here" : "On hand"}
                </th>
                <th scope="col" className="w-28 px-3 py-2 text-right text-[11.5px] font-medium text-muted">
                  Movements
                </th>
                <th scope="col" className="w-12 px-3 py-2">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>

            <tbody>
              {rows.map((l) => (
                <tr
                  key={l.id}
                  className="h-11 border-b border-rule last:border-b-0 hover:bg-surface-2"
                >
                  <td className="max-w-0 px-4">
                    <button
                      type="button"
                      onClick={() => onEdit(l.id)}
                      className="flex w-full items-center gap-2 text-left"
                    >
                      <span
                        className={`truncate text-[13.5px] ${
                          l.isActive ? "text-ink" : "text-muted line-through"
                        }`}
                      >
                        {l.name}
                      </span>
                      {!l.isActive && (
                        <span
                          className="flex-none rounded px-1.5 py-0.5 text-[10.5px] font-medium"
                          style={{ background: "var(--off-soft)", color: "var(--off)" }}
                        >
                          Inactive
                        </span>
                      )}
                    </button>
                  </td>

                  <td className="px-3 font-mono text-[12px] text-muted">{l.code}</td>

                  <td className="px-3 text-right font-mono text-[12.5px] text-ink-2 tabular-nums">
                    {stockAt(l) === 0 ? "—" : stockAt(l)}
                  </td>

                  <td className="px-3 text-right font-mono text-[12px] text-muted tabular-nums">
                    {l.movements === 0 ? "—" : l.movements}
                  </td>

                  <td className="px-3">
                    <RowMenu
                      label={l.name}
                      items={[
                        { label: "Edit", onSelect: () => onEdit(l.id) },
                        {
                          label: l.isActive ? "Deactivate" : "Reactivate",
                          disabled: pending,
                          onSelect: () =>
                            onRun(() => saveLocation(l.id, { isActive: !l.isActive })),
                        },
                        {
                          label: "Delete",
                          danger: true,
                          disabled: pending || l.movements > 0,
                          hint:
                            l.movements > 0
                              ? `${l.movements} movement${l.movements === 1 ? "" : "s"} reference this — deactivate it instead`
                              : undefined,
                          onSelect: () => onRun(() => deleteLocation(l.id)),
                        },
                      ]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function EditDrawer({
  row,
  pending,
  onClose,
  onRun,
}: {
  row: LocationRow;
  pending: boolean;
  onClose: () => void;
  onRun: (action: () => Promise<ActionResult>, onOk?: () => void) => void;
}) {
  const [name, setName] = useState(row.name);
  const [isInternal, setIsInternal] = useState(row.isInternal);
  const [isActive, setIsActive] = useState(row.isActive);

  const locked = row.movements > 0;
  const dirty =
    titleCase(name.trim()) !== row.name ||
    isInternal !== row.isInternal ||
    isActive !== row.isActive;

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
            disabled={pending || !dirty}
            onClick={() =>
              onRun(() => saveLocation(row.id, { name, isInternal, isActive }), onClose)
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
            onBlur={(e) => setName(titleCase(e.target.value.trim()))}
          />
        </Field>

        <Field
          label="Kind"
          hint={
            locked
              ? `Fixed. ${row.movements} movement${row.movements === 1 ? "" : "s"} already reference this location, and changing it would rewrite what they meant — stock that was ours becoming stock that never was, with no movement recorded.`
              : "On hand is what sits in ours minus what has gone elsewhere. This is that distinction, so it can only be set while the location has no history."
          }
        >
          <div className="flex gap-1.5">
            {[
              { value: true, label: "Ours" },
              { value: false, label: "Elsewhere" },
            ].map((option) => (
              <button
                key={String(option.value)}
                type="button"
                disabled={locked}
                onClick={() => setIsInternal(option.value)}
                className={`rounded-md border px-2.5 py-1 text-[12.5px] transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                  isInternal === option.value
                    ? "border-brick bg-brick-soft font-medium text-brick"
                    : "border-rule-2 text-muted hover:bg-surface-2"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </Field>

        <label className="flex items-start gap-2.5">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
          />
          <span>
            <span className="block text-[12.5px] font-medium text-ink-2">Active</span>
            <span className="mt-0.5 block text-[11.5px] leading-relaxed text-muted">
              Only active locations are offered when stock is entered. Past
              movements keep pointing here either way.
            </span>
          </span>
        </label>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-rule pt-4 text-[12px]">
          <dt className="text-muted">Code</dt>
          <dd className="text-right font-mono text-ink-2">{row.code}</dd>

          <dt className="text-muted">{row.isInternal ? "On hand" : "Sent here"}</dt>
          <dd className="text-right font-mono text-ink-2 tabular-nums">{stockAt(row)}</dd>

          <dt className="text-muted">Movements</dt>
          <dd className="text-right font-mono text-ink-2 tabular-nums">{row.movements}</dd>
        </dl>
      </div>
    </Drawer>
  );
}

function AddDrawer({
  pending,
  onClose,
  onRun,
}: {
  pending: boolean;
  onClose: () => void;
  onRun: (action: () => Promise<ActionResult>, onOk?: () => void) => void;
}) {
  const [name, setName] = useState("");
  const [isInternal, setIsInternal] = useState(true);

  return (
    <Drawer
      open
      title="Add location"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            tone="primary"
            disabled={pending || name.trim() === ""}
            onClick={() => onRun(() => createLocation(name, isInternal), onClose)}
          >
            Add
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <Field
          label="Name"
          hint="The code is built from the name and then frozen, the way a design code is."
        >
          <input
            autoFocus
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Retail Unit 3"
          />
        </Field>

        <Field
          label="Kind"
          hint="Choose carefully — once a movement references the location this cannot change, because it would rewrite what that movement meant."
        >
          <div className="flex flex-col gap-1.5">
            <Choice
              selected={isInternal}
              onSelect={() => setIsInternal(true)}
              title="Ours"
              detail="A warehouse, a shop, a rack. Stock here counts as stock we hold."
            />
            <Choice
              selected={!isInternal}
              onSelect={() => setIsInternal(false)}
              title="Elsewhere"
              detail="Where stock goes when it stops being ours — a customer, scrap, or out to production."
            />
          </div>
        </Field>
      </div>
    </Drawer>
  );
}

function Choice({
  selected,
  onSelect,
  title,
  detail,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  detail: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`rounded-md border px-3 py-2 text-left transition-colors ${
        selected
          ? "border-brick bg-brick-soft"
          : "border-rule-2 hover:bg-surface-2"
      }`}
    >
      <span
        className={`block text-[13px] font-medium ${selected ? "text-brick" : "text-ink-2"}`}
      >
        {title}
      </span>
      <span className="mt-0.5 block text-[11.5px] leading-relaxed text-muted">
        {detail}
      </span>
    </button>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Pager } from "@/components/grid";
import { Button, Drawer, Field, Header, ToastBar, inputClass, useToast } from "@/components/ui";
import type { ClothItemRow } from "@/lib/bales";

import { CLOTH_TYPES } from "./constants";
import { createClothItem, updateClothItem, type ActionResult, type ClothItemDraft } from "./actions";

const PER_PAGE = 50;
const BORDERS = ["Zari", "Plain", "Contrast", "Tasseled"] as const;
const PALLUS = ["Same as body", "Contrast"] as const;

/**
 * The specific cloth names a bale's contents are picked from. Its own
 * screen, same reasoning as Suppliers: this belongs to Kora to Shelf, not
 * the catalogue's own vocabulary.
 */
export function ClothItems({ rows }: { rows: ClothItemRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [toast, showToast] = useToast();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<ClothItemRow | null>(null);
  const [page, setPage] = useState(1);

  const pages = Math.max(1, Math.ceil(rows.length / PER_PAGE));
  const currentPage = Math.min(page, pages);
  const pageFrom = (currentPage - 1) * PER_PAGE;
  const pageRows = rows.slice(pageFrom, pageFrom + PER_PAGE);

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

  return (
    <div className="flex min-h-screen flex-col">
      <Header
        title="Cloth Items"
        lede={`What a bale's contents are called. ${rows.length} item${rows.length === 1 ? "" : "s"} on file.`}
        actions={
          <Button tone="primary" onClick={() => setAdding(true)}>
            Add item
          </Button>
        }
      />

      <div className="flex-1 px-8 py-6">
        <div className="mx-auto max-w-3xl">
          {rows.length === 0 ? (
            <p className="rounded-lg border border-dashed border-rule-2 px-4 py-10 text-center text-[13px] text-muted">
              No items yet. Add the first one — Bale Intake needs at least
              one before a bale can be recorded.
            </p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-rule bg-surface">
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr className="border-b border-rule bg-surface-2 text-left">
                    <th scope="col" className="w-20 px-4 py-2 text-[11.5px] font-medium text-muted">
                      Code
                    </th>
                    <th scope="col" className="px-3 py-2 text-[11.5px] font-medium text-muted">
                      Item
                    </th>
                    <th scope="col" className="px-3 py-2 text-[11.5px] font-medium text-muted">
                      Cloth Type
                    </th>
                    <th scope="col" className="w-28 px-3 py-2 text-right text-[11.5px] font-medium text-muted">
                      Bales
                    </th>
                    <th scope="col" className="w-24 px-3 py-2 text-[11.5px] font-medium text-muted">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((r) => (
                    <tr
                      key={r.id}
                      onClick={() => setEditing(r)}
                      className={`h-11 cursor-pointer border-b border-rule last:border-b-0 hover:bg-surface-2 ${
                        r.status === "inactive" ? "opacity-60" : ""
                      }`}
                    >
                      <td className="px-4 font-mono text-[12.5px] text-ink-2">{r.code}</td>
                      <td className="px-3 text-ink">{r.name}</td>
                      <td className="px-3 text-ink-2">
                        {r.clothTypes.length === 0 ? "—" : r.clothTypes.join(", ")}
                      </td>
                      <td className="px-3 text-right font-mono text-[12.5px] text-ink-2 tabular-nums">
                        {r.baleCount}
                      </td>
                      <td className="px-3">
                        <span
                          className="rounded px-1.5 py-0.5 text-[11px] font-medium"
                          style={
                            r.status === "active"
                              ? { background: "var(--ok-soft)", color: "var(--ok)" }
                              : { background: "var(--surface-3)", color: "var(--muted)" }
                          }
                        >
                          {r.status === "active" ? "Active" : "Inactive"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <Pager total={rows.length} page={currentPage} perPage={PER_PAGE} onPage={setPage} />
            </div>
          )}
        </div>
      </div>

      {adding && (
        <AddDrawer pending={pending} onClose={() => setAdding(false)} onRun={run} />
      )}

      {editing !== null && (
        <EditDrawer item={editing} pending={pending} onClose={() => setEditing(null)} onRun={run} />
      )}

      <ToastBar toast={toast} onDismiss={() => showToast(null)} />
    </div>
  );
}

/**
 * Cloth Type, and — only when "Sarees" is one of them — the saree-specific
 * facts about the raw cloth itself: whether it comes with a blouse piece,
 * its border, its pallu. Shared between Add and Edit so the two forms can't
 * quietly drift apart.
 */
function ClothItemFields({
  draft,
  set,
}: {
  draft: ClothItemDraft;
  set: <K extends keyof ClothItemDraft>(key: K, value: ClothItemDraft[K]) => void;
}) {
  const isSaree = draft.clothTypes.includes("Sarees");

  function toggleType(type: string) {
    set(
      "clothTypes",
      draft.clothTypes.includes(type)
        ? draft.clothTypes.filter((t) => t !== type)
        : [...draft.clothTypes, type],
    );
  }

  return (
    <>
      <Field label="Name" hint="A specific cloth name, the way the old sheet named it — 'Cotton Fabric A40s', not just 'Fabric'.">
        <input
          className={inputClass}
          value={draft.name}
          onChange={(e) => set("name", e.target.value)}
          autoFocus
          placeholder="Cotton Fabric A40s"
        />
      </Field>

      <Field label="Cloth Type" hint="What this cloth is suited to. Not exclusive — plain fabric might become either Sarees or Chunnies.">
        <div className="flex flex-wrap gap-1.5">
          {CLOTH_TYPES.map((type) => {
            const selected = draft.clothTypes.includes(type);
            return (
              <button
                key={type}
                type="button"
                onClick={() => toggleType(type)}
                className={`rounded-md border px-2.5 py-1 text-[12.5px] transition-colors ${
                  selected
                    ? "border-brick bg-brick-soft font-medium text-brick"
                    : "border-rule-2 text-muted hover:bg-surface-2"
                }`}
              >
                {type}
              </button>
            );
          })}
        </div>
      </Field>

      {isSaree && (
        <div className="flex flex-col gap-4 rounded-lg border border-rule bg-surface-2 p-4">
          <p className="text-[12px] text-muted">
            About the saree cloth itself — fixed the day the bale arrives, not a design choice made later.
          </p>

          <label className="flex items-center gap-2 text-[13px] text-ink-2">
            <input
              type="checkbox"
              checked={draft.hasBlouse === true}
              onChange={(e) => set("hasBlouse", e.target.checked)}
            />
            Comes with a blouse piece
          </label>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Border">
              <select
                className={inputClass}
                value={draft.border ?? ""}
                onChange={(e) => set("border", e.target.value === "" ? null : e.target.value)}
              >
                <option value="">Not fixed</option>
                {BORDERS.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </Field>

            <Field label="Pallu">
              <select
                className={inputClass}
                value={draft.pallu ?? ""}
                onChange={(e) => set("pallu", e.target.value === "" ? null : e.target.value)}
              >
                <option value="">Not fixed</option>
                {PALLUS.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </Field>
          </div>
        </div>
      )}
    </>
  );
}

const EMPTY_DRAFT: ClothItemDraft = { name: "", clothTypes: [], hasBlouse: null, border: null, pallu: null };

function AddDrawer({
  pending,
  onClose,
  onRun,
}: {
  pending: boolean;
  onClose: () => void;
  onRun: (action: () => Promise<ActionResult>, onOk?: () => void) => void;
}) {
  const [draft, setDraft] = useState<ClothItemDraft>(EMPTY_DRAFT);
  const set = <K extends keyof ClothItemDraft>(key: K, value: ClothItemDraft[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  return (
    <Drawer
      open
      title="New item"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            tone="primary"
            disabled={pending || draft.name.trim() === ""}
            onClick={() => onRun(() => createClothItem(draft), onClose)}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <ClothItemFields draft={draft} set={set} />
      </div>
    </Drawer>
  );
}

function EditDrawer({
  item,
  pending,
  onClose,
  onRun,
}: {
  item: ClothItemRow;
  pending: boolean;
  onClose: () => void;
  onRun: (action: () => Promise<ActionResult>, onOk?: () => void) => void;
}) {
  const [draft, setDraft] = useState<ClothItemDraft>({
    name: item.name,
    clothTypes: item.clothTypes,
    hasBlouse: item.hasBlouse,
    border: item.border,
    pallu: item.pallu,
  });
  const set = <K extends keyof ClothItemDraft>(key: K, value: ClothItemDraft[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));
  const [active, setActive] = useState(item.status === "active");

  return (
    <Drawer
      open
      title={`Edit ${item.name}`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            tone="primary"
            disabled={pending || draft.name.trim() === ""}
            onClick={() => onRun(() => updateClothItem(item.id, draft, active ? "active" : "inactive"), onClose)}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <ClothItemFields draft={draft} set={set} />

        <label className="flex items-center gap-2 text-[13px] text-ink-2">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          Active — offered when recording a new bale
        </label>
      </div>
    </Drawer>
  );
}

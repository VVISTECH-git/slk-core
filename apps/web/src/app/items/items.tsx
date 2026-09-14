"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button, Drawer, Field, Header, RowMenu, ToastBar, inputClass, useToast } from "@/components/ui";
import type { ClothItemRow } from "@/lib/bales";

import { createClothItem, setClothItemStatus, updateClothItem, type ActionResult } from "./actions";

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
        <div className="mx-auto max-w-2xl">
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
                    <th scope="col" className="px-4 py-2 text-[11.5px] font-medium text-muted">
                      Item
                    </th>
                    <th scope="col" className="w-28 px-3 py-2 text-right text-[11.5px] font-medium text-muted">
                      Bales
                    </th>
                    <th scope="col" className="w-24 px-3 py-2 text-[11.5px] font-medium text-muted">
                      Status
                    </th>
                    <th scope="col" className="w-14 px-3 py-2 text-[11.5px] font-medium text-muted">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={r.id}
                      className={`h-11 border-b border-rule last:border-b-0 hover:bg-surface-2 ${
                        r.status === "inactive" ? "opacity-60" : ""
                      }`}
                    >
                      <td className="px-4 text-ink">{r.name}</td>
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
                      <td className="px-3">
                        <RowMenu
                          label={r.name}
                          items={[
                            { label: "Edit", onSelect: () => setEditing(r) },
                            {
                              label: r.status === "active" ? "Mark inactive" : "Mark active",
                              onSelect: () =>
                                run(() =>
                                  setClothItemStatus(r.id, r.status === "active" ? "inactive" : "active"),
                                ),
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
            disabled={pending || name.trim() === ""}
            onClick={() => onRun(() => createClothItem(name), onClose)}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <Field label="Name" hint="A specific cloth name, the way the old sheet named it — 'Cotton Fabric A40s', not just 'Fabric'.">
          <input
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            placeholder="Cotton Fabric A40s"
          />
        </Field>
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
  const [name, setName] = useState(item.name);

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
            disabled={pending || name.trim() === ""}
            onClick={() => onRun(() => updateClothItem(item.id, name), onClose)}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <Field label="Name">
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
      </div>
    </Drawer>
  );
}

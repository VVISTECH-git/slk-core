"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button, Drawer, Field, Header, ToastBar, inputClass, useToast } from "@/components/ui";
import type { VendorRow } from "@/lib/vendors";

import { STAGES } from "./constants";
import { createVendor, type ActionResult, type VendorDraft } from "./actions";

/**
 * Who does a stage of processing — cutting, salava, karakkaya, printing,
 * ironing. See `packages/db/src/schema/production.ts` for why this is a
 * flat list with no pipeline wired to it yet.
 */
export function Vendors({ rows }: { rows: VendorRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [toast, showToast] = useToast();
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

  return (
    <div className="flex min-h-screen flex-col">
      <Header
        title="Vendors"
        lede={`Who does a stage of processing. ${rows.length} vendor${rows.length === 1 ? "" : "s"} on file.`}
        actions={
          <Button tone="primary" onClick={() => setAdding(true)}>
            Add vendor
          </Button>
        }
      />

      <div className="flex-1 px-8 py-6">
        <div className="mx-auto max-w-4xl">
          {rows.length === 0 ? (
            <p className="rounded-lg border border-dashed border-rule-2 px-4 py-10 text-center text-[13px] text-muted">
              No vendors yet. Add the first one to get started.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-rule bg-surface">
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr className="border-b border-rule bg-surface-2 text-left">
                    <th scope="col" className="px-4 py-2 text-[11.5px] font-medium text-muted">
                      Vendor
                    </th>
                    <th scope="col" className="px-3 py-2 text-[11.5px] font-medium text-muted">
                      Phone
                    </th>
                    <th scope="col" className="px-3 py-2 text-[11.5px] font-medium text-muted">
                      Village
                    </th>
                    <th scope="col" className="px-3 py-2 text-[11.5px] font-medium text-muted">
                      Stages
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="h-11 border-b border-rule last:border-b-0 hover:bg-surface-2">
                      <td className="px-4 text-ink" title={r.notes ?? ""}>
                        {r.name}
                      </td>
                      <td className="px-3 font-mono text-[12.5px] text-ink-2">{r.phone ?? "—"}</td>
                      <td className="px-3 text-ink-2">{r.village ?? "—"}</td>
                      <td className="px-3 text-ink-2">
                        {r.stages.length === 0 ? "—" : r.stages.join(", ")}
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
  const [draft, setDraft] = useState<VendorDraft>({
    name: "",
    phone: "",
    village: "",
    stages: [],
    notes: "",
  });

  const set = <K extends keyof VendorDraft>(key: K, value: VendorDraft[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  function toggleStage(stage: string) {
    setDraft((prev) => ({
      ...prev,
      stages: prev.stages.includes(stage)
        ? prev.stages.filter((s) => s !== stage)
        : [...prev.stages, stage],
    }));
  }

  return (
    <Drawer
      open
      title="New vendor"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            tone="primary"
            disabled={pending || draft.name.trim() === ""}
            onClick={() => onRun(() => createVendor(draft), onClose)}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Name">
            <input
              className={inputClass}
              value={draft.name}
              onChange={(e) => set("name", e.target.value)}
              autoFocus
            />
          </Field>

          <Field label="Phone" hint="Who gets called to hand off or collect work.">
            <input
              className={inputClass}
              value={draft.phone}
              onChange={(e) => set("phone", e.target.value)}
            />
          </Field>
        </div>

        <Field label="Village" hint="Where this vendor works out of.">
          <input
            className={inputClass}
            value={draft.village}
            onChange={(e) => set("village", e.target.value)}
          />
        </Field>

        <Field label="Stages" hint="Which stage(s) this vendor normally does. Optional, and can change later.">
          <div className="flex flex-wrap gap-1.5">
            {STAGES.map((stage) => {
              const selected = draft.stages.includes(stage);
              return (
                <button
                  key={stage}
                  type="button"
                  onClick={() => toggleStage(stage)}
                  className={`rounded-md border px-2.5 py-1 text-[12.5px] transition-colors ${
                    selected
                      ? "border-brick bg-brick-soft font-medium text-brick"
                      : "border-rule-2 text-muted hover:bg-surface-2"
                  }`}
                >
                  {stage}
                </button>
              );
            })}
          </div>
        </Field>

        <Field label="Notes" hint="A standard rate, a special arrangement — anything else worth recording.">
          <textarea
            className={inputClass}
            rows={2}
            value={draft.notes}
            onChange={(e) => set("notes", e.target.value)}
          />
        </Field>
      </div>
    </Drawer>
  );
}

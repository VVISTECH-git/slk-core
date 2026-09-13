"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  Button,
  Drawer,
  Field,
  Header,
  ToastBar,
  inputClass,
  useToast,
} from "@/components/ui";
import type { BaleRow } from "@/lib/bales";

import { createBale, type ActionResult, type BaleDraft } from "./actions";

/**
 * Kora to Shelf, step one: receiving a bale.
 *
 * Deliberately its own screen, its own table, its own everything — not a
 * tab bolted onto Product Management. A bale has no design and no colour
 * yet; joining it to that screen would mean pretending it does.
 */
export function Bales({ rows }: { rows: BaleRow[] }) {
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

  const awaitingCutting = rows.filter((r) => r.status === "awaiting_cutting").length;

  return (
    <div className="flex min-h-screen flex-col">
      <Header
        title="Bale Intake"
        lede={`Kora cloth received from suppliers. ${rows.length} bale${rows.length === 1 ? "" : "s"} recorded${awaitingCutting > 0 ? `, ${awaitingCutting} awaiting cutting` : ""}.`}
        actions={
          <Button tone="primary" onClick={() => setAdding(true)}>
            Add bale
          </Button>
        }
      />

      <div className="flex-1 px-8 py-6">
        <div className="mx-auto max-w-4xl">
          {rows.length === 0 ? (
            <p className="rounded-lg border border-dashed border-rule-2 px-4 py-10 text-center text-[13px] text-muted">
              No bales recorded yet. Add the first one to get started.
            </p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-rule bg-surface">
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr className="border-b border-rule bg-surface-2 text-left">
                    <th scope="col" className="px-4 py-2 text-[11.5px] font-medium text-muted">
                      Bale
                    </th>
                    <th scope="col" className="px-3 py-2 text-[11.5px] font-medium text-muted">
                      Supplier
                    </th>
                    <th scope="col" className="px-3 py-2 text-[11.5px] font-medium text-muted">
                      Item
                    </th>
                    <th scope="col" className="px-3 py-2 text-right text-[11.5px] font-medium text-muted">
                      Metres
                    </th>
                    <th scope="col" className="px-3 py-2 text-right text-[11.5px] font-medium text-muted">
                      Bales
                    </th>
                    <th scope="col" className="px-3 py-2 text-[11.5px] font-medium text-muted">
                      Received
                    </th>
                    <th scope="col" className="px-3 py-2 text-[11.5px] font-medium text-muted">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="h-11 border-b border-rule last:border-b-0 hover:bg-surface-2">
                      <td className="px-4 font-mono text-[12.5px] text-ink">{r.code}</td>
                      <td className="px-3 text-ink-2">{r.supplierName}</td>
                      <td className="max-w-0 truncate px-3 text-ink-2" title={r.itemDescription ?? ""}>
                        {r.itemDescription ?? "—"}
                      </td>
                      <td className="px-3 text-right font-mono text-[12.5px] text-ink-2 tabular-nums">
                        {r.metresReceived.toLocaleString("en-IN")}
                      </td>
                      <td className="px-3 text-right font-mono text-[12.5px] text-ink-2 tabular-nums">
                        {r.baleCount}
                      </td>
                      <td className="px-3 text-ink-2">{r.receivedAt}</td>
                      <td className="px-3">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${
                            r.status === "cut"
                              ? "bg-ok-soft text-ok"
                              : "bg-warn-soft text-warn"
                          }`}
                        >
                          {r.status === "cut" ? "Cut" : "Awaiting cutting"}
                        </span>
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
  const [draft, setDraft] = useState<BaleDraft>({
    supplierName: "",
    transporter: "",
    invoiceNumber: "",
    invoiceDate: "",
    metresReceived: "",
    itemDescription: "",
    baleCount: "1",
  });

  const set = <K extends keyof BaleDraft>(key: K, value: BaleDraft[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  const valid = draft.supplierName.trim() !== "" && Number(draft.metresReceived) > 0;

  return (
    <Drawer
      open
      title="New bale"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            tone="primary"
            disabled={pending || !valid}
            onClick={() => onRun(() => createBale(draft), onClose)}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <Field label="Supplier">
          <input
            className={inputClass}
            value={draft.supplierName}
            onChange={(e) => set("supplierName", e.target.value)}
            autoFocus
          />
        </Field>

        <Field label="Transporter" hint="Optional — who delivered it.">
          <input
            className={inputClass}
            value={draft.transporter}
            onChange={(e) => set("transporter", e.target.value)}
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Invoice number" hint="Leave blank if it hasn't arrived yet.">
            <input
              className={inputClass}
              value={draft.invoiceNumber}
              onChange={(e) => set("invoiceNumber", e.target.value)}
            />
          </Field>
          <Field label="Invoice date">
            <input
              type="date"
              className={inputClass}
              value={draft.invoiceDate}
              onChange={(e) => set("invoiceDate", e.target.value)}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Metres received">
            <input
              type="number"
              min="0"
              step="0.01"
              className={inputClass}
              value={draft.metresReceived}
              onChange={(e) => set("metresReceived", e.target.value)}
            />
          </Field>
          <Field label="Number of bales">
            <input
              type="number"
              min="1"
              step="1"
              className={inputClass}
              value={draft.baleCount}
              onChange={(e) => set("baleCount", e.target.value)}
            />
          </Field>
        </div>

        <Field label="Item description" hint="A rough description of the cloth — not a design, just what it is.">
          <input
            className={inputClass}
            value={draft.itemDescription}
            onChange={(e) => set("itemDescription", e.target.value)}
          />
        </Field>
      </div>
    </Drawer>
  );
}

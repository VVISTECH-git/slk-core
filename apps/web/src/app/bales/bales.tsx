"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

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
import type { BaleRow, ClothItemRow, SupplierRow } from "@/lib/bales";

import { BALE_TYPES, UOMS } from "./constants";
import {
  createBale,
  cutBale,
  generateQrCodes,
  markBaleReturned,
  type ActionResult,
  type BaleDraft,
} from "./actions";

const STATUS_LABEL: Record<BaleRow["status"], string> = {
  awaiting_cutting: "Awaiting cutting",
  cut: "Cut",
  returned: "Returned",
};

const STATUS_STYLE: Record<BaleRow["status"], { background: string; color: string }> = {
  awaiting_cutting: { background: "var(--warn-soft)", color: "var(--warn)" },
  cut: { background: "var(--ok-soft)", color: "var(--ok)" },
  returned: { background: "var(--brick-soft)", color: "var(--brick)" },
};

/**
 * Kora to Shelf, step one: receiving a bale.
 *
 * Deliberately its own screen, its own table, its own everything — not a
 * tab bolted onto Product Management. A bale has no design and no colour
 * yet; joining it to that screen would mean pretending it does.
 */
export function Bales({
  rows,
  suppliers,
  clothItems,
}: {
  rows: BaleRow[];
  suppliers: SupplierRow[];
  clothItems: ClothItemRow[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [toast, showToast] = useToast();
  const [adding, setAdding] = useState(false);
  const [cutting, setCutting] = useState<BaleRow | null>(null);

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
  const canAdd = suppliers.length > 0 && clothItems.length > 0;

  return (
    <div className="flex min-h-screen flex-col">
      <Header
        title="Bale Intake"
        lede={`Kora cloth received from suppliers. ${rows.length} bale${rows.length === 1 ? "" : "s"} recorded${awaitingCutting > 0 ? `, ${awaitingCutting} awaiting cutting` : ""}.`}
        actions={
          canAdd ? (
            <Button tone="primary" onClick={() => setAdding(true)}>
              Add bale
            </Button>
          ) : undefined
        }
      />

      <div className="flex-1 px-8 py-6">
        <div className="mx-auto max-w-5xl">
          {!canAdd ? (
            <p className="rounded-lg border border-dashed border-rule-2 px-4 py-10 text-center text-[13px] text-muted">
              {suppliers.length === 0 && (
                <>
                  No suppliers on file yet.{" "}
                  <Link href="/suppliers" className="text-brick underline">
                    Add one
                  </Link>
                  .
                </>
              )}
              {suppliers.length === 0 && clothItems.length === 0 && <br />}
              {clothItems.length === 0 && (
                <>
                  No cloth items on file yet.{" "}
                  <Link href="/items" className="text-brick underline">
                    Add one
                  </Link>
                  .
                </>
              )}
            </p>
          ) : rows.length === 0 ? (
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
                      Type
                    </th>
                    <th scope="col" className="px-3 py-2 text-[11.5px] font-medium text-muted">
                      Item
                    </th>
                    <th scope="col" className="px-3 py-2 text-right text-[11.5px] font-medium text-muted">
                      Quantity
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
                    <th scope="col" className="px-3 py-2 text-[11.5px] font-medium text-muted">
                      Thaans
                    </th>
                    <th scope="col" className="w-12 px-3 py-2">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="h-11 border-b border-rule last:border-b-0 hover:bg-surface-2">
                      <td className="px-4 font-mono text-[12.5px] text-ink">{r.code}</td>
                      <td className="px-3 text-ink-2">{r.supplierName}</td>
                      <td className="px-3 text-ink-2">{r.type}</td>
                      <td
                        className="max-w-0 truncate px-3 text-ink-2"
                        title={[r.itemName, r.notes].filter(Boolean).join(" — ")}
                      >
                        {r.itemName}
                      </td>
                      <td className="px-3 text-right font-mono text-[12.5px] text-ink-2 tabular-nums">
                        {r.metresReceived.toLocaleString("en-IN")} {r.uom}
                      </td>
                      <td className="px-3 text-right font-mono text-[12.5px] text-ink-2 tabular-nums">
                        {r.baleCount}
                      </td>
                      <td className="px-3 text-ink-2">{r.receivedAt}</td>
                      <td className="px-3">
                        <span
                          className="rounded px-1.5 py-0.5 text-[11px] font-medium"
                          style={STATUS_STYLE[r.status]}
                        >
                          {STATUS_LABEL[r.status]}
                        </span>
                      </td>
                      <td className="px-3 text-ink-2">
                        {r.thaanCount === 0 ? (
                          "—"
                        ) : (
                          <>
                            {r.thaanCount}{" "}
                            <span
                              className="rounded px-1.5 py-0.5 text-[11px] font-medium"
                              style={
                                r.qrGeneratedCount >= r.thaanCount
                                  ? { background: "var(--ok-soft)", color: "var(--ok)" }
                                  : { background: "var(--warn-soft)", color: "var(--warn)" }
                              }
                            >
                              {r.qrGeneratedCount >= r.thaanCount ? "QR ready" : "QR pending"}
                            </span>
                          </>
                        )}
                      </td>
                      <td className="px-3">
                        <RowMenu
                          label={r.code}
                          items={[
                            {
                              label: "Record cutting",
                              disabled: pending || r.status !== "awaiting_cutting",
                              hint:
                                r.status !== "awaiting_cutting"
                                  ? "Already cut, returned, or otherwise no longer waiting."
                                  : undefined,
                              onSelect: () => setCutting(r),
                            },
                            {
                              label: "Generate QR codes",
                              disabled: pending || r.qrGeneratedCount >= r.thaanCount || r.thaanCount === 0,
                              hint:
                                r.thaanCount === 0
                                  ? "This bale hasn't been cut yet."
                                  : r.qrGeneratedCount >= r.thaanCount
                                    ? "Every Thaan from this bale already has a code."
                                    : undefined,
                              onSelect: () => run(() => generateQrCodes(r.id)),
                            },
                            {
                              label: "Print QR codes",
                              disabled: r.qrGeneratedCount === 0,
                              hint:
                                r.qrGeneratedCount === 0
                                  ? "No Thaans here have a QR code yet."
                                  : undefined,
                              onSelect: () => router.push(`/thaans/print/${r.id}`),
                            },
                            {
                              label: "Mark returned",
                              danger: true,
                              disabled: pending || r.status !== "awaiting_cutting",
                              hint:
                                r.status !== "awaiting_cutting"
                                  ? "Only a bale still awaiting cutting can be returned."
                                  : undefined,
                              onSelect: () => run(() => markBaleReturned(r.id)),
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
        <AddDrawer
          suppliers={suppliers}
          clothItems={clothItems}
          pending={pending}
          onClose={() => setAdding(false)}
          onRun={run}
        />
      )}

      {cutting !== null && (
        <CutDrawer
          bale={cutting}
          pending={pending}
          onClose={() => setCutting(null)}
          onRun={run}
        />
      )}

      <ToastBar toast={toast} onDismiss={() => showToast(null)} />
    </div>
  );
}

function CutDrawer({
  bale,
  pending,
  onClose,
  onRun,
}: {
  bale: BaleRow;
  pending: boolean;
  onClose: () => void;
  onRun: (action: () => Promise<ActionResult>, onOk?: () => void) => void;
}) {
  const [thaanCount, setThaanCount] = useState("");

  const valid = Number.isInteger(Number(thaanCount)) && Number(thaanCount) > 0;

  return (
    <Drawer
      open
      title={`Cut ${bale.code}`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            tone="primary"
            disabled={pending || !valid}
            onClick={() => onRun(() => cutBale(bale.id, thaanCount), onClose)}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <Field
          label="Number of Thaans"
          hint="How many pieces the whole bale was cut into. Entered once — cutting is done in one sitting."
        >
          <input
            type="number"
            min="1"
            step="1"
            autoFocus
            className={inputClass}
            value={thaanCount}
            onChange={(e) => setThaanCount(e.target.value)}
          />
        </Field>
      </div>
    </Drawer>
  );
}

function AddDrawer({
  suppliers,
  clothItems,
  pending,
  onClose,
  onRun,
}: {
  suppliers: SupplierRow[];
  clothItems: ClothItemRow[];
  pending: boolean;
  onClose: () => void;
  onRun: (action: () => Promise<ActionResult>, onOk?: () => void) => void;
}) {
  const [draft, setDraft] = useState<BaleDraft>({
    supplierId: "",
    transporter: "",
    invoiceNumber: "",
    invoiceDate: "",
    type: "",
    metresReceived: "",
    uom: "Mtrs",
    itemId: "",
    baleCount: "1",
    notes: "",
  });

  const set = <K extends keyof BaleDraft>(key: K, value: BaleDraft[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  const valid =
    draft.supplierId !== "" &&
    draft.itemId !== "" &&
    draft.type !== "" &&
    Number(draft.metresReceived) > 0;

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
        <div className="grid grid-cols-2 gap-4">
          <Field label="Supplier">
            <select
              className={inputClass}
              value={draft.supplierId}
              onChange={(e) => set("supplierId", e.target.value)}
              autoFocus
            >
              <option value="">Choose…</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Type">
            <select
              className={inputClass}
              value={draft.type}
              onChange={(e) => set("type", e.target.value)}
            >
              <option value="">Choose…</option>
              {BALE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
        </div>

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

        <div className="grid grid-cols-3 gap-4">
          <Field label="Quantity received">
            <input
              type="number"
              min="0"
              step="0.01"
              className={inputClass}
              value={draft.metresReceived}
              onChange={(e) => set("metresReceived", e.target.value)}
            />
          </Field>
          <Field label="Unit">
            <select
              className={inputClass}
              value={draft.uom}
              onChange={(e) => set("uom", e.target.value)}
            >
              {UOMS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
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

        <Field label="Item" hint="Not on the list? Add it from Cloth Items first.">
          <select
            className={inputClass}
            value={draft.itemId}
            onChange={(e) => set("itemId", e.target.value)}
          >
            <option value="">Choose…</option>
            {clothItems.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Notes" hint="Anything else worth recording about this entry.">
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

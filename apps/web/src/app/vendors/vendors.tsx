"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button, Drawer, Field, Header, RowMenu, ToastBar, inputClass, useToast } from "@/components/ui";
import type { VendorLedgerEntry } from "@/lib/vendors";
import { STAGES } from "@/lib/stages";
import type { VendorRow } from "@/lib/vendors";

import {
  createVendor,
  getVendorLedger,
  recordVendorPayment,
  setVendorRate,
  type ActionResult,
  type PaymentDraft,
  type VendorDraft,
} from "./actions";

/**
 * Who does a stage of processing — cutting, salava, karakkaya, printing,
 * ironing — what they charge for it, and what's still owed. See
 * `packages/db/src/schema/production.ts` for why rates, transactions and
 * payments are three separate tables rather than one running number.
 */
export function Vendors({ rows }: { rows: VendorRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [toast, showToast] = useToast();
  const [adding, setAdding] = useState(false);
  const [ratesFor, setRatesFor] = useState<VendorRow | null>(null);
  const [payingFor, setPayingFor] = useState<VendorRow | null>(null);
  const [ledgerFor, setLedgerFor] = useState<VendorRow | null>(null);

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
        lede={`Who does a stage of processing, and what's owed to them. ${rows.length} vendor${rows.length === 1 ? "" : "s"} on file.`}
        actions={
          <Button tone="primary" onClick={() => setAdding(true)}>
            Add vendor
          </Button>
        }
      />

      <div className="flex-1 px-8 py-6">
        <div className="mx-auto max-w-5xl">
          {rows.length === 0 ? (
            <p className="rounded-lg border border-dashed border-rule-2 px-4 py-10 text-center text-[13px] text-muted">
              No vendors yet. Add the first one to get started.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-rule bg-surface">
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr className="border-b border-rule bg-surface-2 text-left">
                    <th scope="col" className="px-4 py-2 text-[11.5px] font-medium text-muted">Vendor</th>
                    <th scope="col" className="px-3 py-2 text-[11.5px] font-medium text-muted">Phone</th>
                    <th scope="col" className="px-3 py-2 text-[11.5px] font-medium text-muted">Village</th>
                    <th scope="col" className="px-3 py-2 text-[11.5px] font-medium text-muted">Stages</th>
                    <th scope="col" className="px-3 py-2 text-right text-[11.5px] font-medium text-muted">Balance due</th>
                    <th scope="col" className="px-3 py-2 text-[11.5px] font-medium text-muted">Actions</th>
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
                      <td
                        className={`px-3 text-right font-medium ${r.balanceDue > 0 ? "text-brick" : "text-ink-2"}`}
                        title={`Earned ₹${r.totalEarned.toLocaleString("en-IN")} · Paid ₹${r.totalPaid.toLocaleString("en-IN")}`}
                      >
                        {r.balanceDue > 0 ? `₹${r.balanceDue.toLocaleString("en-IN")}` : "—"}
                      </td>
                      <td className="px-3">
                        <RowMenu
                          label={r.name}
                          items={[
                            { label: "Set rates", onSelect: () => setRatesFor(r) },
                            { label: "Record payment", onSelect: () => setPayingFor(r) },
                            { label: "View ledger", onSelect: () => setLedgerFor(r) },
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

      {adding && <AddDrawer pending={pending} onClose={() => setAdding(false)} onRun={run} />}

      {ratesFor !== null && (
        <RatesDrawer vendor={ratesFor} pending={pending} onClose={() => setRatesFor(null)} onRun={run} />
      )}

      {payingFor !== null && (
        <PaymentDrawer vendor={payingFor} pending={pending} onClose={() => setPayingFor(null)} onRun={run} />
      )}

      {ledgerFor !== null && <LedgerDrawer vendor={ledgerFor} onClose={() => setLedgerFor(null)} />}

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

        <Field label="Notes" hint="A special arrangement — anything else worth recording.">
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

function RatesDrawer({
  vendor,
  pending,
  onClose,
  onRun,
}: {
  vendor: VendorRow;
  pending: boolean;
  onClose: () => void;
  onRun: (action: () => Promise<ActionResult>, onOk?: () => void) => void;
}) {
  const initial = Object.fromEntries(vendor.rates.map((r) => [r.stage, String(r.unitPrice)]));
  const [values, setValues] = useState<Record<string, string>>(initial);

  function save() {
    onRun(async () => {
      const changed = STAGES.filter((stage) => (values[stage] ?? "") !== (initial[stage] ?? ""));

      if (changed.length === 0) {
        return { ok: true, message: "Nothing changed." };
      }

      for (const stage of changed) {
        const raw = (values[stage] ?? "").trim();
        const unitPrice = raw === "" ? null : Number(raw);
        if (unitPrice !== null && (!Number.isFinite(unitPrice) || unitPrice < 0)) {
          return { ok: false, message: `${stage}'s rate must be a number, zero or greater.` };
        }

        const result = await setVendorRate(vendor.id, stage, unitPrice);
        if (!result.ok) return result;
      }

      return { ok: true, message: `Updated ${vendor.name}'s rates.` };
    }, onClose);
  }

  return (
    <Drawer
      open
      title={`${vendor.name} — rates`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button tone="primary" disabled={pending} onClick={save}>
            Save
          </Button>
        </>
      }
    >
      <p className="mb-4 text-[12.5px] leading-relaxed text-muted">
        ₹ per piece for each stage this vendor might do. Leave a stage blank if they don&rsquo;t
        do it, or you haven&rsquo;t agreed a rate yet — Thaans can still move through it, just
        won&rsquo;t be billed until a rate is set.
      </p>
      <div className="flex flex-col gap-3">
        {STAGES.map((stage) => (
          <Field key={stage} label={stage}>
            <input
              className={inputClass}
              type="number"
              min="0"
              step="0.01"
              placeholder="No rate set"
              value={values[stage] ?? ""}
              onChange={(e) => setValues((prev) => ({ ...prev, [stage]: e.target.value }))}
            />
          </Field>
        ))}
      </div>
    </Drawer>
  );
}

function PaymentDrawer({
  vendor,
  pending,
  onClose,
  onRun,
}: {
  vendor: VendorRow;
  pending: boolean;
  onClose: () => void;
  onRun: (action: () => Promise<ActionResult>, onOk?: () => void) => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [draft, setDraft] = useState<PaymentDraft>({ amount: "", paidOn: today, method: "", notes: "" });

  const set = <K extends keyof PaymentDraft>(key: K, value: PaymentDraft[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  return (
    <Drawer
      open
      title={`Pay ${vendor.name}`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            tone="primary"
            disabled={pending || draft.amount.trim() === ""}
            onClick={() => onRun(() => recordVendorPayment(vendor.id, draft), onClose)}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {vendor.balanceDue > 0 && (
          <p className="text-[12.5px] text-ink-2">
            Balance due: <span className="font-medium text-brick">₹{vendor.balanceDue.toLocaleString("en-IN")}</span>
          </p>
        )}

        <div className="grid grid-cols-2 gap-4">
          <Field label="Amount (₹)">
            <input
              className={inputClass}
              type="number"
              min="0"
              step="0.01"
              value={draft.amount}
              onChange={(e) => set("amount", e.target.value)}
              autoFocus
            />
          </Field>
          <Field label="Date">
            <input
              className={inputClass}
              type="date"
              value={draft.paidOn}
              onChange={(e) => set("paidOn", e.target.value)}
            />
          </Field>
        </div>

        <Field label="Method" hint="Cash, bank transfer — whatever's relevant. Optional.">
          <input className={inputClass} value={draft.method} onChange={(e) => set("method", e.target.value)} />
        </Field>

        <Field label="Notes">
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

function LedgerDrawer({ vendor, onClose }: { vendor: VendorRow; onClose: () => void }) {
  const [entries, setEntries] = useState<VendorLedgerEntry[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getVendorLedger(vendor.id).then((rows) => {
      if (!cancelled) setEntries(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [vendor.id]);

  return (
    <Drawer open title={`${vendor.name} — ledger`} onClose={onClose}>
      <div className="mb-4 flex justify-between rounded-md border border-rule bg-surface-2 px-3 py-2 text-[12.5px]">
        <span>Earned <span className="font-medium text-ink">₹{vendor.totalEarned.toLocaleString("en-IN")}</span></span>
        <span>Paid <span className="font-medium text-ink">₹{vendor.totalPaid.toLocaleString("en-IN")}</span></span>
        <span>
          Due{" "}
          <span className={`font-medium ${vendor.balanceDue > 0 ? "text-brick" : "text-ink"}`}>
            ₹{vendor.balanceDue.toLocaleString("en-IN")}
          </span>
        </span>
      </div>

      {entries === null ? (
        <p className="text-[13px] text-muted">Loading…</p>
      ) : entries.length === 0 ? (
        <p className="text-[13px] text-muted">Nothing recorded yet.</p>
      ) : (
        <ul className="divide-y divide-rule">
          {entries.map((e) => (
            <li key={`${e.kind}-${e.id}`} className="flex items-center justify-between py-2 text-[13px]">
              <span>
                <span className="text-ink-2">{e.date}</span>{" "}
                {e.kind === "transaction" ? (
                  <span className="text-ink">{e.stage} · {e.pieceCount} pcs</span>
                ) : (
                  <span className="text-ink">Payment{e.notes ? ` — ${e.notes}` : ""}</span>
                )}
              </span>
              <span className={e.kind === "transaction" ? "text-brick" : "text-ok"}>
                {e.kind === "transaction" ? "+" : "−"}₹{e.amount.toLocaleString("en-IN")}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Drawer>
  );
}

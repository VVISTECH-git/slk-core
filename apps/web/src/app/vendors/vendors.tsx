"use client";

import { usePreferences } from "@/components/preferences-provider";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Pager } from "@/components/grid";
import { Button, Drawer, Field, Header, ToastBar, inputClass, useToast } from "@/components/ui";
import { damagedThaanStatus, type DamagedThaanStatus } from "@/lib/damaged-status";
import { STAGES } from "@/lib/stages";
import type { DamagedThaanRow } from "@/lib/thaan-damage";
import type { VendorLedgerEntry, VendorRow } from "@/lib/vendors";
import { vendorTransactionStatus, type VendorTransactionStatus } from "@/lib/vendor-status";

import {
  addressDamagedThaan,
  createVendor,
  getDamagedThaans,
  getVendorLedger,
  recordVendorPayment,
  setVendorRate,
  updateVendor,
  writeOffDamagedThaan,
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
  const [editing, setEditing] = useState<VendorRow | null>(null);
  const [page, setPage] = useState(1);
  const [stageFilter, setStageFilter] = useState("");

  const filtered = stageFilter === "" ? rows : rows.filter((r) => r.stages.includes(stageFilter));

  const { preferences } = usePreferences();
  const PER_PAGE = preferences.pageSize;

  const pages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const currentPage = Math.min(page, pages);
  const pageFrom = (currentPage - 1) * PER_PAGE;
  const pageRows = filtered.slice(pageFrom, pageFrom + PER_PAGE);

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
          {rows.length > 0 && (
            <div className="mb-4 flex items-center gap-3">
              <label className="flex items-center gap-2 text-[13px] text-ink-2">
                Stage
                <select
                  className={inputClass}
                  value={stageFilter}
                  onChange={(e) => {
                    setStageFilter(e.target.value);
                    setPage(1);
                  }}
                >
                  <option value="">All stages</option>
                  {STAGES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </label>
              {stageFilter !== "" && (
                <span className="text-[12.5px] text-muted">
                  {filtered.length} vendor{filtered.length === 1 ? "" : "s"} do{filtered.length === 1 ? "es" : ""} {stageFilter}
                </span>
              )}
            </div>
          )}

          {rows.length === 0 ? (
            <p className="rounded-lg border border-dashed border-rule-2 px-4 py-10 text-center text-[13px] text-muted">
              No vendors yet. Add the first one to get started.
            </p>
          ) : filtered.length === 0 ? (
            <p className="rounded-lg border border-dashed border-rule-2 px-4 py-10 text-center text-[13px] text-muted">
              No vendor does {stageFilter}.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-rule bg-surface">
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr className="border-b border-rule bg-surface-2 text-left">
                    <th scope="col" className="w-20 px-4 py-2 text-[11.5px] font-medium text-muted">Code</th>
                    <th scope="col" className="px-3 py-2 text-[11.5px] font-medium text-muted">Vendor</th>
                    <th scope="col" className="px-3 py-2 text-[11.5px] font-medium text-muted">Primary Phone</th>
                    <th scope="col" className="px-3 py-2 text-[11.5px] font-medium text-muted">Secondary Phone</th>
                    <th scope="col" className="px-3 py-2 text-[11.5px] font-medium text-muted">Village</th>
                    <th scope="col" className="px-3 py-2 text-[11.5px] font-medium text-muted">Stages</th>
                    <th scope="col" className="px-3 py-2 text-right text-[11.5px] font-medium text-muted">Holding now</th>
                    <th scope="col" className="px-3 py-2 text-right text-[11.5px] font-medium text-muted">Balance due</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((r) => (
                    <tr
                      key={r.id}
                      onClick={() => setEditing(r)}
                      className="h-11 cursor-pointer border-b border-rule last:border-b-0 hover:bg-surface-2"
                    >
                      <td className="px-4 font-mono text-[12.5px] text-ink-2">{r.code}</td>
                      <td className="px-3 text-ink" title={r.notes ?? ""}>
                        {r.name}
                      </td>
                      <td className="px-3 font-mono text-[12.5px] text-ink-2">{r.primaryPhone ?? "—"}</td>
                      <td className="px-3 font-mono text-[12.5px] text-ink-2">{r.secondaryPhone ?? "—"}</td>
                      <td className="px-3 text-ink-2">{r.village ?? "—"}</td>
                      <td className="px-3 text-ink-2">
                        {r.stages.length === 0 ? "—" : r.stages.join(", ")}
                      </td>
                      <td
                        className={`px-3 text-right font-mono text-[12.5px] tabular-nums ${r.currentlyHolding > 0 ? "text-ink" : "text-faint"}`}
                        title={
                          r.holdingByStage.length === 0
                            ? "Nothing out with them right now"
                            : r.holdingByStage.map((s) => `${s.count} at ${s.stage}`).join(", ")
                        }
                      >
                        {r.currentlyHolding > 0 ? r.currentlyHolding : "—"}
                      </td>
                      <td
                        className={`px-3 text-right font-medium ${r.balanceDue > 0 ? "text-brick" : "text-ink-2"}`}
                        title={`Earned ₹${r.totalEarned.toLocaleString("en-IN")} · Paid ₹${r.totalPaid.toLocaleString("en-IN")}`}
                      >
                        {r.balanceDue > 0 ? `₹${r.balanceDue.toLocaleString("en-IN")}` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <Pager total={filtered.length} page={currentPage} perPage={PER_PAGE} onPage={setPage} />
            </div>
          )}
        </div>
      </div>

      {adding && <AddDrawer pending={pending} onClose={() => setAdding(false)} onRun={run} />}

      {editing !== null && (
        <EditDrawer vendor={editing} pending={pending} onClose={() => setEditing(null)} onRun={run} />
      )}

      <ToastBar toast={toast} onDismiss={() => showToast(null)} />
    </div>
  );
}

function VendorFields({
  draft,
  set,
}: {
  draft: VendorDraft;
  set: <K extends keyof VendorDraft>(key: K, value: VendorDraft[K]) => void;
}) {
  function toggleStage(stage: string) {
    set(
      "stages",
      draft.stages.includes(stage)
        ? draft.stages.filter((s) => s !== stage)
        : [...draft.stages, stage],
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Name">
          <input
            className={inputClass}
            value={draft.name}
            onChange={(e) => set("name", e.target.value)}
            autoFocus
          />
        </Field>

        <Field label="Primary Phone" hint="Who gets called to hand off or collect work.">
          <input
            className={inputClass}
            value={draft.primaryPhone}
            onChange={(e) => set("primaryPhone", e.target.value)}
          />
        </Field>
      </div>

      <Field label="Secondary Phone" hint="A backup number, for when the primary one doesn't answer.">
        <input
          className={inputClass}
          value={draft.secondaryPhone}
          onChange={(e) => set("secondaryPhone", e.target.value)}
        />
      </Field>

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
    </>
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
    primaryPhone: "",
    secondaryPhone: "",
    village: "",
    stages: [],
    notes: "",
  });

  const set = <K extends keyof VendorDraft>(key: K, value: VendorDraft[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

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
        <VendorFields draft={draft} set={set} />
      </div>
    </Drawer>
  );
}

/**
 * Everything about one vendor, one click away — fields, rates, recording a
 * payment and the ledger used to live behind three separate row-menu
 * items; now a row click opens all of it at once. Fields and rates share
 * the main Save (one edit, one save); recording a payment gets its own
 * button since it is an immediate transaction, not a field to hold onto
 * until an unrelated edit is also ready.
 */
function EditDrawer({
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
  const [draft, setDraft] = useState<VendorDraft>({
    name: vendor.name,
    primaryPhone: vendor.primaryPhone ?? "",
    secondaryPhone: vendor.secondaryPhone ?? "",
    village: vendor.village ?? "",
    stages: vendor.stages,
    notes: vendor.notes ?? "",
  });
  const set = <K extends keyof VendorDraft>(key: K, value: VendorDraft[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  const initialRates = Object.fromEntries(vendor.rates.map((r) => [r.stage, String(r.unitPrice)]));
  const [rates, setRates] = useState<Record<string, string>>(initialRates);

  function save() {
    onRun(async () => {
      const fieldsResult = await updateVendor(vendor.id, draft);
      if (!fieldsResult.ok) return fieldsResult;

      const changedStages = STAGES.filter((stage) => (rates[stage] ?? "") !== (initialRates[stage] ?? ""));
      for (const stage of changedStages) {
        const raw = (rates[stage] ?? "").trim();
        const unitPrice = raw === "" ? null : Number(raw);
        if (unitPrice !== null && (!Number.isFinite(unitPrice) || unitPrice < 0)) {
          return { ok: false, message: `${stage}'s rate must be a number, zero or greater.` };
        }
        const rateResult = await setVendorRate(vendor.id, stage, unitPrice);
        if (!rateResult.ok) return rateResult;
      }

      return { ok: true, message: `${vendor.name} updated.` };
    }, onClose);
  }

  const today = new Date().toISOString().slice(0, 10);
  const [payment, setPayment] = useState<PaymentDraft>({ amount: "", paidOn: today, method: "", notes: "" });
  const setPay = <K extends keyof PaymentDraft>(key: K, value: PaymentDraft[K]) =>
    setPayment((prev) => ({ ...prev, [key]: value }));

  const [entries, setEntries] = useState<VendorLedgerEntry[] | null>(null);
  const [ledgerVersion, setLedgerVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void getVendorLedger(vendor.id).then((rows) => {
      if (!cancelled) setEntries(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [vendor.id, ledgerVersion]);

  const [damaged, setDamaged] = useState<DamagedThaanRow[] | null>(null);
  const [damagedVersion, setDamagedVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void getDamagedThaans(vendor.id).then((rows) => {
      if (!cancelled) setDamaged(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [vendor.id, damagedVersion]);

  function addressOne(damageId: string) {
    onRun(async () => {
      const result = await addressDamagedThaan(damageId);
      if (result.ok) setDamagedVersion((v) => v + 1);
      return result;
    });
  }

  function writeOffOne(damageId: string) {
    onRun(async () => {
      const result = await writeOffDamagedThaan(damageId);
      if (result.ok) setDamagedVersion((v) => v + 1);
      return result;
    });
  }

  function recordPayment() {
    // Left open on purpose — recording a payment shouldn't close the drawer
    // the way saving fields does, since the ledger below is the proof it
    // worked and the reader is usually about to check it.
    onRun(async () => {
      const result = await recordVendorPayment(vendor.id, payment);
      if (result.ok) {
        setPayment({ amount: "", paidOn: today, method: "", notes: "" });
        setLedgerVersion((v) => v + 1);
      }
      return result;
    });
  }

  return (
    <Drawer
      open
      title={`Edit ${vendor.name}`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button tone="primary" disabled={pending || draft.name.trim() === ""} onClick={save}>
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-6">
        <VendorFields draft={draft} set={set} />

        <section>
          <h3 className="mb-1 text-[13px] font-semibold text-ink">Rates</h3>
          <p className="mb-3 text-[12px] leading-relaxed text-muted">
            ₹ per piece for each stage this vendor does. Leave blank if not agreed yet — Thaans
            can still move through it, just won&rsquo;t be billed until a rate is set.
          </p>
          {draft.stages.length === 0 ? (
            <p className="text-[12.5px] text-muted">Choose at least one stage above to set a rate for it.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {STAGES.filter((stage) => draft.stages.includes(stage)).map((stage) => (
                <Field key={stage} label={stage}>
                  <input
                    className={inputClass}
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="No rate set"
                    value={rates[stage] ?? ""}
                    onChange={(e) => setRates((prev) => ({ ...prev, [stage]: e.target.value }))}
                  />
                </Field>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-lg border border-rule bg-surface-2 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-[13px] font-semibold text-ink">Record payment</h3>
            {vendor.balanceDue > 0 && (
              <span className="text-[12px] text-brick">
                Balance due ₹{vendor.balanceDue.toLocaleString("en-IN")}
              </span>
            )}
          </div>
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Amount (₹)">
                <input
                  className={inputClass}
                  type="number"
                  min="0"
                  step="0.01"
                  value={payment.amount}
                  onChange={(e) => setPay("amount", e.target.value)}
                />
              </Field>
              <Field label="Date">
                <input
                  className={inputClass}
                  type="date"
                  value={payment.paidOn}
                  onChange={(e) => setPay("paidOn", e.target.value)}
                />
              </Field>
            </div>
            <Field label="Method" hint="Cash, bank transfer — optional.">
              <input
                className={inputClass}
                value={payment.method}
                onChange={(e) => setPay("method", e.target.value)}
              />
            </Field>
            <Button
              tone="primary"
              className="self-end"
              disabled={pending || payment.amount.trim() === ""}
              onClick={recordPayment}
            >
              Add payment
            </Button>
          </div>
        </section>

        <section>
          <h3 className="mb-2 text-[13px] font-semibold text-ink">
            Ledger{entries !== null && entries.length > 0 ? ` (${entries.length})` : ""}
          </h3>
          {entries === null ? (
            <p className="text-[13px] text-muted">Loading…</p>
          ) : entries.length === 0 ? (
            <p className="text-[13px] text-muted">Nothing recorded yet.</p>
          ) : (
            // Newest first, capped and scrollable rather than paginated — this
            // is one section of an already-scrolling drawer, not its own
            // page, and a vendor paid weekly for a year would otherwise push
            // Rates and the payment form off screen entirely.
            <ul className="max-h-64 divide-y divide-rule overflow-y-auto rounded-lg border border-rule">
              {entries.map((e) => (
                <li key={`${e.kind}-${e.id}`} className="flex items-center justify-between gap-2 px-3 py-2 text-[13px]">
                  <span className="min-w-0">
                    <span className="text-ink-2">{e.date}</span>{" "}
                    {e.kind === "transaction" ? (
                      <span className="text-ink">
                        {e.stage} · {e.pieceCount} pcs
                        {e.baleCodes !== null && e.baleCodes.length > 0 && (
                          <span className="ml-1 font-mono text-[11.5px] text-muted">
                            (Bale {e.baleCodes.join(", ")})
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="text-ink">Payment{e.notes ? ` — ${e.notes}` : ""}</span>
                    )}
                  </span>
                  <span className="flex flex-none items-center gap-2">
                    {e.kind === "transaction" && <LedgerStatusDot status={vendorTransactionStatus(e)} />}
                    <span className={e.amount === null ? "text-muted italic" : e.kind === "transaction" ? "text-brick" : "text-ok"}>
                      {e.amount === null
                        ? "Not priced"
                        : `${e.kind === "transaction" ? "+" : "−"}₹${e.amount.toLocaleString("en-IN")}`}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h3 className="mb-1 text-[13px] font-semibold text-ink">
            Damaged Thaans{damaged !== null && damaged.length > 0 ? ` (${damaged.length})` : ""}
          </h3>
          <p className="mb-3 text-[12px] leading-relaxed text-muted">
            Flagged from a scan on mobile. Address one once you&rsquo;ve settled it with this
            vendor, then write it off — a Thaan can only be written off after it&rsquo;s been
            addressed.
          </p>
          {damaged === null ? (
            <p className="text-[13px] text-muted">Loading…</p>
          ) : damaged.length === 0 ? (
            <p className="text-[13px] text-muted">Nothing flagged damaged for this vendor.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {damaged.map((d) => {
                const status = damagedThaanStatus(d);
                return (
                  <li key={d.id} className="rounded-lg border border-rule px-3 py-2 text-[13px]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0">
                        <span className="font-mono font-medium text-ink">{d.thaanCode ?? "no code yet"}</span>{" "}
                        <span className="text-muted">
                          Bale {d.baleCode}
                          {d.stage !== null && ` · ${d.stage}`}
                        </span>
                      </span>
                      <DamagedStatusBadge status={status} />
                    </div>
                    <p className="mt-0.5 text-[11.5px] text-muted">
                      Flagged {d.flaggedAt}
                      {d.flaggedByName !== null && ` by ${d.flaggedByName}`}
                    </p>
                    {d.notes !== null && d.notes !== "" && (
                      <p className="mt-1 text-[12.5px] text-ink-2">{d.notes}</p>
                    )}
                    {status !== "written_off" && (
                      <div className="mt-2 flex gap-2">
                        {status === "flagged" && (
                          <Button onClick={() => addressOne(d.id)} disabled={pending}>
                            Mark addressed
                          </Button>
                        )}
                        {status === "addressed" && (
                          <Button onClick={() => writeOffOne(d.id)} disabled={pending}>
                            Write off
                          </Button>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </Drawer>
  );
}

function DamagedStatusBadge({ status }: { status: DamagedThaanStatus }) {
  const styles: Record<DamagedThaanStatus, { bg: string; fg: string; label: string }> = {
    flagged: { bg: "var(--brick-soft)", fg: "var(--brick)", label: "Flagged" },
    addressed: { bg: "var(--warn-soft)", fg: "var(--warn)", label: "Addressed" },
    written_off: { bg: "var(--surface-2)", fg: "var(--muted)", label: "Written off" },
  };
  const s = styles[status];
  return (
    <span
      className="inline-block flex-none rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap"
      style={{ backgroundColor: s.bg, color: s.fg }}
    >
      {s.label}
    </span>
  );
}

/** A quiet dot rather than a full badge — this list is already dense, and the colour alone answers "does this still need finance's attention". The Vendor Ledger page has the full status and the approve/pay actions. */
function LedgerStatusDot({ status }: { status: VendorTransactionStatus }) {
  const color =
    status === "paid"
      ? "var(--ok)"
      : status === "approved"
        ? "var(--warn)"
        : status === "needs_pricing"
          ? "var(--brick)"
          : "var(--muted)";
  const title =
    status === "paid"
      ? "Paid"
      : status === "approved"
        ? "Approved · unpaid"
        : status === "needs_pricing"
          ? "Needs pricing"
          : "Not yet approved";
  return (
    <span
      title={title}
      aria-label={title}
      className="inline-block h-2 w-2 flex-none rounded-full"
      style={{ backgroundColor: color }}
    />
  );
}

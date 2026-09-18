"use client";

import { usePreferences } from "@/components/preferences-provider";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";

import {
  approveVendorTransactions,
  getVendorTransactionThaans,
  payVendorTransactions,
  priceVendorTransactions,
  type PayTransactionsDraft,
} from "@/app/vendors/actions";
import { Pager } from "@/components/grid";
import { Drawer, Field, Header, inputClass, Button } from "@/components/ui";
import type { LedgerEntryRow } from "@/lib/vendors";
import { vendorTransactionStatus, type VendorTransactionStatus } from "@/lib/vendor-status";

/**
 * Every vendor's billing together, newest first — the same rows each
 * vendor's own Ledger section shows, just not scattered one drawer at a
 * time. Now the place finance actually works from: which bale a piece
 * count came from, whether a transaction has been approved, and — once it
 * has — selecting the unpaid ones for a vendor and settling them in one
 * payment, rather than typing a lump sum against the running balance.
 */
export function VendorLedger({ rows }: { rows: LedgerEntryRow[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | VendorTransactionStatus>("all");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [drillDown, setDrillDown] = useState<LedgerEntryRow | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [priceOpen, setPriceOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);

  const totalBilled = rows.filter((r) => r.kind === "transaction").reduce((sum, r) => sum + (r.amount ?? 0), 0);
  const totalPaid = rows.filter((r) => r.kind === "payment").reduce((sum, r) => sum + (r.amount ?? 0), 0);
  const balanceDue = totalBilled - totalPaid;
  const needsPricingCount = rows.filter((r) => r.kind === "transaction" && vendorTransactionStatus(r) === "needs_pricing").length;

  const q = query.trim().toLowerCase();
  const filtered = rows.filter((r) => {
    if (statusFilter !== "all") {
      if (r.kind !== "transaction") return false;
      if (vendorTransactionStatus(r) !== statusFilter) return false;
    }
    if (q === "") return true;
    return (
      r.vendorName.toLowerCase().includes(q) ||
      (r.stage ?? "").toLowerCase().includes(q) ||
      (r.notes ?? "").toLowerCase().includes(q) ||
      (r.baleCodes ?? []).some((code) => code.toLowerCase().includes(q))
    );
  });

  const { preferences } = usePreferences();
  const PER_PAGE = preferences.pageSize;

  const pages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const currentPage = Math.min(page, pages);
  const pageFrom = (currentPage - 1) * PER_PAGE;
  const pageRows = filtered.slice(pageFrom, pageFrom + PER_PAGE);

  const selectedRows = useMemo(
    () => rows.filter((r) => r.kind === "transaction" && selected.has(r.id)),
    [rows, selected],
  );
  const canApprove = selectedRows.length > 0 && selectedRows.every((r) => vendorTransactionStatus(r) === "unapproved");
  const canPay =
    selectedRows.length > 0 &&
    selectedRows.every((r) => vendorTransactionStatus(r) === "approved") &&
    selectedRows.every((r) => r.vendorId === selectedRows[0]!.vendorId);
  const canPrice =
    selectedRows.length > 0 &&
    selectedRows.every((r) => vendorTransactionStatus(r) === "needs_pricing") &&
    selectedRows.every((r) => r.vendorId === selectedRows[0]!.vendorId && r.stage === selectedRows[0]!.stage);
  const payTotal = selectedRows.reduce((sum, r) => sum + (r.amount ?? 0), 0);

  function toggleRow(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function clearSelection() {
    setSelected(new Set());
    setActionError(null);
  }

  function approveSelected() {
    setActionError(null);
    startTransition(async () => {
      const result = await approveVendorTransactions([...selected]);
      if (result.ok) {
        clearSelection();
        router.refresh();
      } else {
        setActionError(result.message);
      }
    });
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <Header
        title="Vendor Ledger"
        lede="Every stage billed and every payment made, across every vendor. Price a transaction that came back before a rate existed, approve it, then select the approved, unpaid ones for a vendor to settle them in one payment."
      />

      <div className="flex min-h-0 flex-1 flex-col px-8 py-6">
        <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col gap-4">
          <div className="grid flex-none grid-cols-4 gap-3">
            <Stat label="Total billed" value={totalBilled} tone="brick" />
            <Stat label="Total paid" value={totalPaid} tone="ok" />
            <Stat label="Balance due" value={balanceDue} tone={balanceDue > 0 ? "brick" : "ok"} />
            <CountStat label="Needs pricing" value={needsPricingCount} tone={needsPricingCount > 0 ? "brick" : "ok"} />
          </div>

          {rows.length > 0 && (
            <div className="flex flex-none flex-wrap items-center gap-3">
              <input
                type="search"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
                placeholder="Search by vendor, stage, bale, or notes…"
                aria-label="Search the ledger"
                className="w-80 rounded-lg border border-rule-2 bg-surface px-3 py-2 text-[13.5px] text-ink placeholder:text-faint"
              />
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value as typeof statusFilter);
                  setPage(1);
                }}
                aria-label="Filter by status"
                className="rounded-lg border border-rule-2 bg-surface px-3 py-2 text-[13.5px] text-ink"
              >
                <option value="all">All rows</option>
                <option value="needs_pricing">Needs pricing</option>
                <option value="unapproved">Unapproved</option>
                <option value="approved">Approved · unpaid</option>
                <option value="paid">Paid</option>
              </select>
              {(q !== "" || statusFilter !== "all") && (
                <span className="text-[12.5px] text-muted">
                  {filtered.length} match{filtered.length === 1 ? "" : "es"}
                </span>
              )}
            </div>
          )}

          {selected.size > 0 && (
            <div className="flex flex-none flex-wrap items-center gap-3 rounded-lg border border-rule-2 bg-surface-2 px-4 py-2.5">
              <span className="text-[12.5px] font-medium text-ink">
                {selected.size} selected · ₹{payTotal.toLocaleString("en-IN")}
              </span>
              <Button
                onClick={() => setPriceOpen(true)}
                disabled={!canPrice || pending}
                title={canPrice ? undefined : "Select unpriced rows for a single vendor and stage to price them"}
              >
                Price selected
              </Button>
              <Button onClick={approveSelected} disabled={!canApprove || pending} title={canApprove ? undefined : "Only unapproved rows can be approved together"}>
                Approve
              </Button>
              <Button
                tone="primary"
                onClick={() => setPayOpen(true)}
                disabled={!canPay || pending}
                title={canPay ? undefined : "Select approved, unpaid rows for a single vendor to pay them"}
              >
                Pay selected
              </Button>
              <button type="button" onClick={clearSelection} className="text-[12.5px] text-muted underline">
                Clear
              </button>
              {actionError !== null && <span className="text-[12.5px] text-brick">{actionError}</span>}
            </div>
          )}

          {rows.length === 0 ? (
            <p className="rounded-lg border border-dashed border-rule-2 px-4 py-10 text-center text-[13px] text-muted">
              Nothing billed or paid yet. It appears here once a vendor&rsquo;s work comes back through
              Handovers, or a payment is recorded on Vendors.
            </p>
          ) : filtered.length === 0 ? (
            <p className="rounded-lg border border-dashed border-rule-2 px-4 py-10 text-center text-[13px] text-muted">
              Nothing matches.
            </p>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-rule bg-surface">
              <div className="flex-1 overflow-auto">
                <table className="w-full border-collapse text-[13px]">
                  <thead className="sticky top-0 bg-surface-2">
                    <tr className="border-b border-rule text-left">
                      <th scope="col" className="w-9 px-3 py-2"></th>
                      <th scope="col" className="px-3 py-2 text-[11.5px] font-medium text-muted">Date</th>
                      <th scope="col" className="px-3 py-2 text-[11.5px] font-medium text-muted">Vendor</th>
                      <th scope="col" className="px-3 py-2 text-[11.5px] font-medium text-muted">Stage</th>
                      <th scope="col" className="px-3 py-2 text-[11.5px] font-medium text-muted">Bale</th>
                      <th scope="col" className="px-3 py-2 text-right text-[11.5px] font-medium text-muted">Pieces</th>
                      <th scope="col" className="px-3 py-2 text-[11.5px] font-medium text-muted">Notes</th>
                      <th scope="col" className="px-3 py-2 text-right text-[11.5px] font-medium text-muted">Amount</th>
                      <th scope="col" className="px-3 py-2 text-[11.5px] font-medium text-muted">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((r) => {
                      const status = r.kind === "transaction" ? vendorTransactionStatus(r) : null;
                      return (
                        <tr key={`${r.kind}-${r.id}`} className="h-11 border-b border-rule last:border-b-0 hover:bg-surface-2">
                          <td className="px-3">
                            {r.kind === "transaction" && (
                              <input
                                type="checkbox"
                                checked={selected.has(r.id)}
                                onChange={(e) => toggleRow(r.id, e.target.checked)}
                                aria-label={`Select ${r.vendorName} ${r.stage} ${r.date}`}
                              />
                            )}
                          </td>
                          <td className="px-3 text-ink-2">{r.date}</td>
                          <td className="px-3">
                            <Link href="/vendors" className="text-brick underline">
                              {r.vendorName}
                            </Link>
                          </td>
                          <td className="px-3 text-ink-2">
                            {r.kind === "transaction" ? r.stage : <span className="text-muted">Payment</span>}
                          </td>
                          <td className="px-3 font-mono text-[12px] text-ink-2">
                            {r.baleCodes !== null && r.baleCodes.length > 0 ? r.baleCodes.join(", ") : "—"}
                          </td>
                          <td className="px-3 text-right">
                            {r.kind === "transaction" && r.pieceCount !== null ? (
                              <button
                                type="button"
                                onClick={() => setDrillDown(r)}
                                className="font-mono text-[12.5px] text-brick underline tabular-nums"
                              >
                                {r.pieceCount}
                              </button>
                            ) : (
                              <span className="font-mono text-[12.5px] text-ink-2 tabular-nums">—</span>
                            )}
                          </td>
                          <td className="px-3 text-ink-2">{r.notes ?? "—"}</td>
                          <td
                            className={`px-3 text-right font-mono text-[12.5px] tabular-nums ${
                              r.amount === null ? "text-muted italic" : r.kind === "transaction" ? "text-brick" : "text-ok"
                            }`}
                          >
                            {r.amount === null
                              ? "Not priced"
                              : `${r.kind === "transaction" ? "+" : "−"}₹${r.amount.toLocaleString("en-IN")}`}
                          </td>
                          <td className="px-3">{status !== null && <StatusBadge status={status} />}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <Pager total={filtered.length} page={currentPage} perPage={PER_PAGE} onPage={setPage} />
            </div>
          )}
        </div>
      </div>

      {drillDown !== null && <ThaanDrawer entry={drillDown} onClose={() => setDrillDown(null)} />}

      {priceOpen && (
        <PriceDrawer
          entries={selectedRows}
          onClose={() => setPriceOpen(false)}
          onPriced={() => {
            setPriceOpen(false);
            clearSelection();
            router.refresh();
          }}
        />
      )}

      {payOpen && (
        <PayDrawer
          entries={selectedRows}
          total={payTotal}
          onClose={() => setPayOpen(false)}
          onPaid={() => {
            setPayOpen(false);
            clearSelection();
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: "brick" | "ok" }) {
  return (
    <div className="rounded-lg border border-rule bg-surface p-4">
      <p className="text-[11.5px] font-medium text-muted">{label}</p>
      <p
        className="mt-1 text-[22px] leading-none font-semibold tracking-tight tabular-nums"
        style={{ color: tone === "brick" ? "var(--brick)" : "var(--ok)" }}
      >
        ₹{value.toLocaleString("en-IN")}
      </p>
    </div>
  );
}

/** Same tile as Stat, but a plain count rather than a currency figure — there's no amount yet for what's unpriced. */
function CountStat({ label, value, tone }: { label: string; value: number; tone: "brick" | "ok" }) {
  return (
    <div className="rounded-lg border border-rule bg-surface p-4">
      <p className="text-[11.5px] font-medium text-muted">{label}</p>
      <p
        className="mt-1 text-[22px] leading-none font-semibold tracking-tight tabular-nums"
        style={{ color: tone === "brick" ? "var(--brick)" : "var(--ok)" }}
      >
        {value}
      </p>
    </div>
  );
}

function StatusBadge({ status }: { status: VendorTransactionStatus }) {
  const styles: Record<VendorTransactionStatus, { bg: string; fg: string; label: string }> = {
    needs_pricing: { bg: "var(--brick-soft)", fg: "var(--brick)", label: "Needs pricing" },
    unapproved: { bg: "var(--surface-2)", fg: "var(--muted)", label: "Unapproved" },
    approved: { bg: "var(--warn-soft)", fg: "var(--warn)", label: "Approved · unpaid" },
    paid: { bg: "var(--ok-soft)", fg: "var(--ok)", label: "Paid" },
  };
  const s = styles[status];
  return (
    <span
      className="inline-block rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap"
      style={{ backgroundColor: s.bg, color: s.fg }}
    >
      {s.label}
    </span>
  );
}

/** The Thaans behind one transaction's piece count — fetched on open, not baked into every row. */
function ThaanDrawer({ entry, onClose }: { entry: LedgerEntryRow; onClose: () => void }) {
  const [thaans, setThaans] = useState<{ baleCode: string; thaanCode: string | null }[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getVendorTransactionThaans(entry.id).then((rows) => {
      if (!cancelled) setThaans(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [entry.id]);

  const byBale = useMemo(() => {
    if (thaans === null) return null;
    const groups = new Map<string, string[]>();
    for (const t of thaans) {
      const list = groups.get(t.baleCode) ?? [];
      list.push(t.thaanCode ?? "no code yet");
      groups.set(t.baleCode, list);
    }
    return [...groups.entries()];
  }, [thaans]);

  return (
    <Drawer open title={`${entry.vendorName} — ${entry.stage} — ${entry.date}`} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <p className="text-[12.5px] text-muted">
          {entry.pieceCount} piece{entry.pieceCount === 1 ? "" : "s"}
          {entry.amount === null ? ", not priced yet" : `, ₹${entry.amount.toLocaleString("en-IN")}`}
          {entry.baleCodes !== null && entry.baleCodes.length > 1 && " — from more than one bale, grouped below."}
        </p>
        {byBale === null ? (
          <p className="text-[13px] text-muted">Loading…</p>
        ) : byBale.length === 0 ? (
          <p className="text-[13px] text-muted">No Thaan detail found for this transaction.</p>
        ) : (
          byBale.map(([baleCode, codes]) => (
            <section key={baleCode}>
              <h3 className="mb-1.5 text-[12.5px] font-semibold text-ink">
                Bale <Link href="/bales" className="text-brick underline">{baleCode}</Link>
                <span className="ml-1.5 font-normal text-muted">
                  ({codes.length} Thaan{codes.length === 1 ? "" : "s"})
                </span>
              </h3>
              <ul className="flex flex-wrap gap-1.5">
                {codes.map((code, i) => (
                  <li
                    key={`${code}-${i}`}
                    className="rounded border border-rule-2 bg-surface-2 px-2 py-0.5 font-mono text-[11.5px] text-ink-2"
                  >
                    {code}
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
    </Drawer>
  );
}

/**
 * Filling in a rate for transactions that came back before their vendor had
 * one set for that stage — one rate applied to every selected transaction,
 * which is why selection requires the same vendor and stage (enforced again
 * server-side in `priceVendorTransactions`).
 */
function PriceDrawer({
  entries,
  onClose,
  onPriced,
}: {
  entries: LedgerEntryRow[];
  onClose: () => void;
  onPriced: () => void;
}) {
  const [rate, setRate] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const vendorName = entries[0]?.vendorName ?? "";
  const stage = entries[0]?.stage ?? "";
  const totalPieces = entries.reduce((sum, e) => sum + (e.pieceCount ?? 0), 0);
  const rateValue = Number(rate);
  const rateValid = rate.trim() !== "" && Number.isFinite(rateValue) && rateValue >= 0;
  const previewTotal = rateValid ? Math.round(rateValue * totalPieces * 100) / 100 : null;

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await priceVendorTransactions(
        entries.map((e) => e.id),
        rateValue,
      );
      if (result.ok) onPriced();
      else setError(result.message);
    });
  }

  return (
    <Drawer
      open
      title={`Price ${vendorName} — ${stage}`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button tone="primary" disabled={pending || !rateValid} onClick={submit}>
            {pending ? "Saving…" : previewTotal !== null ? `Price ₹${previewTotal.toLocaleString("en-IN")}` : "Price"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div>
          <p className="mb-2 text-[12.5px] text-muted">
            {entries.length} transaction{entries.length === 1 ? "" : "s"}, {totalPieces} piece
            {totalPieces === 1 ? "" : "s"} total.
          </p>
          <ul className="max-h-40 divide-y divide-rule overflow-y-auto rounded-lg border border-rule text-[12.5px]">
            {entries.map((e) => (
              <li key={e.id} className="flex items-center justify-between px-3 py-1.5">
                <span className="text-ink-2">
                  {e.date} · {e.pieceCount} pcs
                </span>
              </li>
            ))}
          </ul>
        </div>

        <Field label="Rate per piece" hint="Applied to every transaction selected above.">
          <input
            className={inputClass}
            type="number"
            min="0"
            step="0.01"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
          />
        </Field>

        {error !== null && <p className="text-[12.5px] text-brick">{error}</p>}
      </div>
    </Drawer>
  );
}

/** Settling the selected transactions in one payment — the amount is their total, not a typed figure. */
function PayDrawer({
  entries,
  total,
  onClose,
  onPaid,
}: {
  entries: LedgerEntryRow[];
  total: number;
  onClose: () => void;
  onPaid: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [draft, setDraft] = useState<PayTransactionsDraft>({ paidOn: today, method: "", notes: "" });
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const vendorName = entries[0]?.vendorName ?? "";

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await payVendorTransactions(
        entries[0]!.vendorId,
        entries.map((e) => e.id),
        draft,
      );
      if (result.ok) onPaid();
      else setError(result.message);
    });
  }

  return (
    <Drawer
      open
      title={`Pay ${vendorName}`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button tone="primary" disabled={pending || draft.paidOn.trim() === ""} onClick={submit}>
            {pending ? "Paying…" : `Pay ₹${total.toLocaleString("en-IN")}`}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div>
          <p className="mb-2 text-[12.5px] text-muted">
            {entries.length} transaction{entries.length === 1 ? "" : "s"}, ₹{total.toLocaleString("en-IN")} total.
          </p>
          <ul className="max-h-40 divide-y divide-rule overflow-y-auto rounded-lg border border-rule text-[12.5px]">
            {entries.map((e) => (
              <li key={e.id} className="flex items-center justify-between px-3 py-1.5">
                <span className="text-ink-2">
                  {e.date} · {e.stage} · {e.pieceCount} pcs
                </span>
                <span className="font-mono tabular-nums text-ink-2">₹{(e.amount ?? 0).toLocaleString("en-IN")}</span>
              </li>
            ))}
          </ul>
        </div>

        <Field label="Date">
          <input
            className={inputClass}
            type="date"
            value={draft.paidOn}
            onChange={(e) => setDraft((prev) => ({ ...prev, paidOn: e.target.value }))}
          />
        </Field>
        <Field label="Method" hint="Cash, bank transfer — optional.">
          <input
            className={inputClass}
            value={draft.method}
            onChange={(e) => setDraft((prev) => ({ ...prev, method: e.target.value }))}
          />
        </Field>
        <Field label="Notes">
          <input
            className={inputClass}
            value={draft.notes}
            onChange={(e) => setDraft((prev) => ({ ...prev, notes: e.target.value }))}
          />
        </Field>

        {error !== null && <p className="text-[12.5px] text-brick">{error}</p>}
      </div>
    </Drawer>
  );
}

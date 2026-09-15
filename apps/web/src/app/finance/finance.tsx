"use client";

import Link from "next/link";

import { Header } from "@/components/ui";
import type { FinancialOverview } from "@/lib/vendors";

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function monthLabel(iso: string): string {
  const [year, month] = iso.split("-");
  return `${MONTH_LABELS[Number(month) - 1]} ${year}`;
}

function inr(value: number): string {
  return `₹${value.toLocaleString("en-IN")}`;
}

/**
 * Vendor billing and payments, rolled up by month, by stage, and by vendor —
 * the same rows Vendor Ledger lists one at a time, viewed as trends instead
 * of an audit trail. Hand-rolled bars rather than a charting dependency:
 * three shapes (paired columns, ranked rows, a ranked table) cover
 * everything here, and none of them need more than a `width`/`height` style.
 */
export function FinancialDashboard({ data }: { data: FinancialOverview }) {
  const totalBilled = data.byVendor.reduce((sum, v) => sum + v.billed, 0);
  const totalPaid = data.byVendor.reduce((sum, v) => sum + v.paid, 0);
  const balanceDue = totalBilled - totalPaid;

  const hasAnything = data.byVendor.length > 0 || data.byMonth.some((m) => m.billed > 0 || m.paid > 0);

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <Header
        title="Financial Dashboard"
        lede="Vendor billing and payments, by month, by stage, and by vendor — Vendor Ledger's own rows, rolled up into trends."
      />

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-8 py-6">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Total billed" value={totalBilled} tone="brick" />
            <Stat label="Total paid" value={totalPaid} tone="ok" />
            <Stat label="Balance due" value={balanceDue} tone={balanceDue > 0 ? "brick" : "ok"} />
          </div>

          {!hasAnything ? (
            <p className="rounded-lg border border-dashed border-rule-2 px-4 py-10 text-center text-[13px] text-muted">
              Nothing billed or paid yet. This fills in as vendor work is billed on Vendors and
              payments are recorded against it.
            </p>
          ) : (
            <>
              <Panel title="Billed vs. paid, by month">
                <MonthChart rows={data.byMonth} />
              </Panel>

              <div className="grid grid-cols-2 gap-6">
                <Panel title="Billed, by stage">
                  {data.byStage.length === 0 ? (
                    <EmptyNote text="No stage has been billed yet." />
                  ) : (
                    <StageBars rows={data.byStage} />
                  )}
                </Panel>

                <Panel title="By vendor, ranked by balance due">
                  {data.byVendor.length === 0 ? (
                    <EmptyNote text="No vendor has been billed yet." />
                  ) : (
                    <VendorTable rows={data.byVendor} />
                  )}
                </Panel>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-rule bg-surface p-5">
      <h2 className="mb-4 text-[13px] font-medium text-ink-2">{title}</h2>
      {children}
    </div>
  );
}

function EmptyNote({ text }: { text: string }) {
  return <p className="py-6 text-center text-[13px] text-muted">{text}</p>;
}

function Stat({ label, value, tone }: { label: string; value: number; tone: "brick" | "ok" }) {
  return (
    <div className="rounded-lg border border-rule bg-surface p-4">
      <p className="text-[11.5px] font-medium text-muted">{label}</p>
      <p
        className="mt-1 text-[22px] leading-none font-semibold tracking-tight tabular-nums"
        style={{ color: tone === "brick" ? "var(--brick)" : "var(--ok)" }}
      >
        {inr(value)}
      </p>
    </div>
  );
}

/** Two columns per month — billed and paid — scaled to whichever bar, in either row, is tallest. */
function MonthChart({ rows }: { rows: FinancialOverview["byMonth"] }) {
  const max = Math.max(1, ...rows.map((r) => Math.max(r.billed, r.paid)));

  return (
    <div>
      <div className="flex items-center gap-4 pb-3 text-[11.5px] text-muted">
        <Legend swatch="var(--brick)" label="Billed" />
        <Legend swatch="var(--ok)" label="Paid" />
      </div>

      <div className="flex h-48 items-end gap-4 overflow-x-auto border-b border-rule pb-1">
        {rows.map((r) => (
          <div key={r.month} className="flex flex-none flex-col items-center gap-1" style={{ width: 56 }}>
            <div className="flex h-40 items-end gap-1">
              <Bar height={r.billed / max} color="var(--brick)" value={r.billed} />
              <Bar height={r.paid / max} color="var(--ok)" value={r.paid} />
            </div>
            <span className="text-[10.5px] whitespace-nowrap text-muted">{monthLabel(r.month)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Bar({ height, color, value }: { height: number; color: string; value: number }) {
  return (
    <div
      title={inr(value)}
      className="w-4 rounded-t-sm"
      style={{ height: `${Math.max(2, height * 100)}%`, background: color, minHeight: value > 0 ? 3 : 0 }}
    />
  );
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span aria-hidden className="h-2.5 w-2.5 rounded-sm" style={{ background: swatch }} />
      {label}
    </span>
  );
}

/** One horizontal bar per stage, widest-billed on top. */
function StageBars({ rows }: { rows: FinancialOverview["byStage"] }) {
  const max = Math.max(1, ...rows.map((r) => r.billed));

  return (
    <div className="flex flex-col gap-3">
      {rows.map((r) => (
        <div key={r.stage}>
          <div className="mb-1 flex items-baseline justify-between text-[12.5px]">
            <span className="text-ink-2">{r.stage}</span>
            <span className="font-mono text-[12px] tabular-nums text-muted">
              {inr(r.billed)} · {r.transactions} txn{r.transactions === 1 ? "" : "s"}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-3">
            <div
              className="h-full rounded-full"
              style={{ width: `${Math.max(2, (r.billed / max) * 100)}%`, background: "var(--brick)" }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function VendorTable({ rows }: { rows: FinancialOverview["byVendor"] }) {
  return (
    <table className="w-full border-collapse text-[13px]">
      <thead>
        <tr className="border-b border-rule text-left">
          <th scope="col" className="pb-2 text-[11.5px] font-medium text-muted">Vendor</th>
          <th scope="col" className="pb-2 text-right text-[11.5px] font-medium text-muted">Billed</th>
          <th scope="col" className="pb-2 text-right text-[11.5px] font-medium text-muted">Paid</th>
          <th scope="col" className="pb-2 text-right text-[11.5px] font-medium text-muted">Balance due</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((v) => (
          <tr key={v.vendorId} className="border-b border-rule last:border-b-0">
            <td className="py-2">
              <Link href="/vendors" className="text-brick underline">
                {v.vendorName}
              </Link>
            </td>
            <td className="py-2 text-right font-mono text-[12.5px] tabular-nums text-ink-2">{inr(v.billed)}</td>
            <td className="py-2 text-right font-mono text-[12.5px] tabular-nums text-ink-2">{inr(v.paid)}</td>
            <td
              className="py-2 text-right font-mono text-[12.5px] tabular-nums"
              style={{ color: v.balanceDue > 0 ? "var(--brick)" : "var(--ok)" }}
            >
              {inr(v.balanceDue)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";

import { Pager } from "@/components/grid";
import { Header } from "@/components/ui";
import type { LedgerEntryRow } from "@/lib/vendors";

const PER_PAGE = 50;

/**
 * Every vendor's billing together, newest first — the same rows each
 * vendor's own Ledger section shows, just not scattered one drawer at a
 * time. Read-only: recording a payment or setting a rate still happens
 * from Vendors, on the vendor it's actually about.
 */
export function VendorLedger({ rows }: { rows: LedgerEntryRow[] }) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  const totalBilled = rows.filter((r) => r.kind === "transaction").reduce((sum, r) => sum + r.amount, 0);
  const totalPaid = rows.filter((r) => r.kind === "payment").reduce((sum, r) => sum + r.amount, 0);
  const balanceDue = totalBilled - totalPaid;

  const q = query.trim().toLowerCase();
  const filtered =
    q === ""
      ? rows
      : rows.filter(
          (r) =>
            r.vendorName.toLowerCase().includes(q) ||
            (r.stage ?? "").toLowerCase().includes(q) ||
            (r.notes ?? "").toLowerCase().includes(q),
        );

  const pages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const currentPage = Math.min(page, pages);
  const pageFrom = (currentPage - 1) * PER_PAGE;
  const pageRows = filtered.slice(pageFrom, pageFrom + PER_PAGE);

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <Header
        title="Vendor Ledger"
        lede="Every stage billed and every payment made, across every vendor — what each vendor's own Ledger shows, all in one place."
      />

      <div className="flex min-h-0 flex-1 flex-col px-8 py-6">
        <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col gap-4">
          <div className="grid flex-none grid-cols-3 gap-3">
            <Stat label="Total billed" value={totalBilled} tone="brick" />
            <Stat label="Total paid" value={totalPaid} tone="ok" />
            <Stat label="Balance due" value={balanceDue} tone={balanceDue > 0 ? "brick" : "ok"} />
          </div>

          {rows.length > 0 && (
            <div className="flex flex-none items-center gap-3">
              <input
                type="search"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
                placeholder="Search by vendor, stage, or notes…"
                aria-label="Search the ledger"
                className="w-80 rounded-lg border border-rule-2 bg-surface px-3 py-2 text-[13.5px] text-ink placeholder:text-faint"
              />
              {q !== "" && (
                <span className="text-[12.5px] text-muted">
                  {filtered.length} match{filtered.length === 1 ? "" : "es"}
                </span>
              )}
            </div>
          )}

          {rows.length === 0 ? (
            <p className="rounded-lg border border-dashed border-rule-2 px-4 py-10 text-center text-[13px] text-muted">
              Nothing billed or paid yet. It appears here once a vendor's work comes back through
              Handovers, or a payment is recorded on Vendors.
            </p>
          ) : filtered.length === 0 ? (
            <p className="rounded-lg border border-dashed border-rule-2 px-4 py-10 text-center text-[13px] text-muted">
              Nothing matches &ldquo;{query.trim()}&rdquo;.
            </p>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-rule bg-surface">
              <div className="flex-1 overflow-auto">
                <table className="w-full border-collapse text-[13px]">
                  <thead className="sticky top-0 bg-surface-2">
                    <tr className="border-b border-rule text-left">
                      <th scope="col" className="px-4 py-2 text-[11.5px] font-medium text-muted">Date</th>
                      <th scope="col" className="px-3 py-2 text-[11.5px] font-medium text-muted">Vendor</th>
                      <th scope="col" className="px-3 py-2 text-[11.5px] font-medium text-muted">Stage</th>
                      <th scope="col" className="px-3 py-2 text-right text-[11.5px] font-medium text-muted">Pieces</th>
                      <th scope="col" className="px-3 py-2 text-[11.5px] font-medium text-muted">Notes</th>
                      <th scope="col" className="px-3 py-2 text-right text-[11.5px] font-medium text-muted">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((r) => (
                      <tr key={`${r.kind}-${r.id}`} className="h-11 border-b border-rule last:border-b-0 hover:bg-surface-2">
                        <td className="px-4 text-ink-2">{r.date}</td>
                        <td className="px-3">
                          <Link href="/vendors" className="text-brick underline">
                            {r.vendorName}
                          </Link>
                        </td>
                        <td className="px-3 text-ink-2">
                          {r.kind === "transaction" ? r.stage : <span className="text-muted">Payment</span>}
                        </td>
                        <td className="px-3 text-right font-mono text-[12.5px] text-ink-2 tabular-nums">
                          {r.pieceCount ?? "—"}
                        </td>
                        <td className="px-3 text-ink-2">{r.notes ?? "—"}</td>
                        <td
                          className={`px-3 text-right font-mono text-[12.5px] tabular-nums ${
                            r.kind === "transaction" ? "text-brick" : "text-ok"
                          }`}
                        >
                          {r.kind === "transaction" ? "+" : "−"}₹{r.amount.toLocaleString("en-IN")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <Pager total={filtered.length} page={currentPage} perPage={PER_PAGE} onPage={setPage} />
            </div>
          )}
        </div>
      </div>
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

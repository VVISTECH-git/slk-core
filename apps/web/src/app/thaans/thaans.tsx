"use client";

import { usePreferences } from "@/components/preferences-provider";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { ConfirmDialog, Header, ToastBar, useToast } from "@/components/ui";
import { Pager } from "@/components/grid";
import type { ThaanRow } from "@/lib/thaans";

import { restoreThaan, voidThaan, type ActionResult } from "./actions";

/** Matched by prefix, not exact value — "Out for X"/"Ready for X" name a different X per row. */
function pipelineStatusStyle(status: string): { background: string; color: string } {
  if (status === "Finished") return { background: "var(--ok-soft)", color: "var(--ok)" };
  if (status.startsWith("Out for ")) return { background: "var(--off-soft)", color: "var(--off)" };
  if (status === "QR Generated") return { background: "var(--off-soft)", color: "var(--off)" };
  // "QR Pending" and "Ready for X" both mean the same thing: waiting on someone to act.
  return { background: "var(--warn-soft)", color: "var(--warn)" };
}

/**
 * What a bale becomes once it's cut — cascaded with the bale and item
 * context that produced it, so this reads as the full picture rather than
 * a bare code list. Cutting and QR generation still happen from Bale
 * Intake's own row menu, since they're bale-level acts; what's here is
 * Thaan-level and direct — a checkbox to void a damaged or miscounted
 * piece, a link to reprint its own QR code — rather than another menu to
 * open first.
 */
export function Thaans({ rows }: { rows: ThaanRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [toast, showToast] = useToast();
  const [page, setPage] = useState(1);
  const [voiding, setVoiding] = useState<ThaanRow | null>(null);
  const [query, setQuery] = useState("");

  const withQr = rows.filter((r) => r.code !== null).length;
  const voided = rows.filter((r) => r.voidedAt !== null).length;

  // Comma- or space-separated, same as a scan batch — "1003,1004" or
  // "T00002007 T00002008" searches for either, not one string that has
  // to appear as typed.
  const terms = query
    .split(/[,\s]+/)
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t !== "");
  const filtered =
    terms.length === 0
      ? rows
      : rows.filter((r) =>
          terms.some(
            (term) =>
              // Bale and Thaan codes match from the start only — codes share
              // one number line ("1004" the bale, "T1004" a Thaan from a
              // different bale entirely, since QR codes draw from one global
              // sequence), so a substring match on "1004" would surface both.
              r.baleCode.toLowerCase().startsWith(term) ||
              (r.code ?? "").toLowerCase().startsWith(term) ||
              r.supplierName.toLowerCase().includes(term) ||
              r.itemName.toLowerCase().includes(term),
          ),
        );

  const { preferences } = usePreferences();
  const PER_PAGE = preferences.pageSize;

  const pages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const current = Math.min(page, pages);
  const from = (current - 1) * PER_PAGE;
  const pageRows = filtered.slice(from, from + PER_PAGE);

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
    <div className="flex h-screen flex-col overflow-hidden">
      <Header
        title="Thaans"
        lede={`What a bale becomes once it's cut. ${rows.length} recorded, ${withQr} with a QR code${voided > 0 ? `, ${voided} voided` : ""}.`}
      />

      <div className="flex min-h-0 flex-1 flex-col px-8 py-6">
        <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col">
          {rows.length > 0 && (
            <div className="mb-4 flex flex-none items-center gap-3">
              <input
                type="search"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
                placeholder="Search by bale code, Thaan code, supplier, or item — comma- or space-separate several"
                aria-label="Search Thaans"
                className="w-80 rounded-lg border border-rule-2 bg-surface px-3 py-2 text-[13.5px] text-ink placeholder:text-faint"
              />
              {terms.length > 0 && (
                <span className="text-[12.5px] text-muted">
                  {filtered.length} match{filtered.length === 1 ? "" : "es"}
                </span>
              )}
            </div>
          )}

          {rows.length === 0 ? (
            <p className="rounded-lg border border-dashed border-rule-2 px-4 py-10 text-center text-[13px] text-muted">
              No Thaans yet. They appear here once a bale is cut, from Bale
              Intake.
            </p>
          ) : filtered.length === 0 ? (
            <p className="rounded-lg border border-dashed border-rule-2 px-4 py-10 text-center text-[13px] text-muted">
              No Thaans match &ldquo;{query.trim()}&rdquo;.
            </p>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-rule bg-surface">
              <div className="flex-1 overflow-auto">
                <table className="w-full border-collapse text-[13px]">
                  <thead className="sticky top-0 bg-surface-2">
                    <tr className="border-b border-rule text-left">
                      <th scope="col" className="px-4 py-2 text-[11.5px] font-medium text-muted">Code</th>
                      <th scope="col" className="px-3 py-2 text-[11.5px] font-medium text-muted">Status</th>
                      <th scope="col" className="px-3 py-2 text-[11.5px] font-medium text-muted">Bale</th>
                      <th scope="col" className="px-3 py-2 text-[11.5px] font-medium text-muted">Supplier</th>
                      <th scope="col" className="px-3 py-2 text-[11.5px] font-medium text-muted">Item</th>
                      <th scope="col" className="px-3 py-2 text-[11.5px] font-medium text-muted">Type</th>
                      <th scope="col" className="px-3 py-2 text-[11.5px] font-medium text-muted">Bill entry date</th>
                      <th scope="col" className="px-3 py-2 text-right text-[11.5px] font-medium text-muted">Per Thaan Mtr</th>
                      <th scope="col" className="px-3 py-2 text-[11.5px] font-medium text-muted">QR generated</th>
                      <th scope="col" className="w-16 px-3 py-2 text-[11.5px] font-medium text-muted">Void</th>
                      <th scope="col" className="w-16 px-3 py-2 text-[11.5px] font-medium text-muted">Print</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((r) => (
                      <tr
                        key={r.id}
                        className={`h-11 border-b border-rule last:border-b-0 hover:bg-surface-2 ${
                          r.voidedAt !== null ? "opacity-60" : ""
                        }`}
                      >
                        <td className="px-4 font-mono text-[12.5px] text-ink">{r.code ?? "—"}</td>
                        <td className="px-3">
                          <span
                            className="rounded px-1.5 py-0.5 text-[11px] font-medium"
                            style={pipelineStatusStyle(r.pipelineStatus)}
                          >
                            {r.pipelineStatus}
                          </span>
                        </td>
                        <td className="px-3">
                          <Link href={`/thaans/print/${r.baleId}`} className="font-mono text-[12.5px] text-brick underline">
                            {r.baleCode}
                          </Link>
                        </td>
                        <td className="px-3 text-ink-2">{r.supplierName}</td>
                        <td className="px-3 text-ink-2">{r.itemName}</td>
                        <td className="px-3 text-ink-2">{r.baleType}</td>
                        <td className="px-3 text-ink-2">{r.billEntryDate}</td>
                        <td className="px-3 text-right font-mono text-[12.5px] text-ink-2 tabular-nums">
                          {r.perThaanMetres ?? "—"}
                        </td>
                        <td
                          className="px-3 text-ink-2"
                          title={r.qrGeneratedByName !== null ? `Generated by ${r.qrGeneratedByName}` : ""}
                        >
                          {r.qrGeneratedAt ?? "—"}
                        </td>
                        <td
                          className="px-3"
                          title={
                            r.voidedAt !== null
                              ? r.voidedByName !== null
                                ? `Voided by ${r.voidedByName}, ${r.voidedAt}`
                                : r.voidedAt
                              : "Mark this Thaan damaged, miscounted, or otherwise unusable"
                          }
                        >
                          <input
                            type="checkbox"
                            checked={r.voidedAt !== null}
                            disabled={pending}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setVoiding(r);
                              } else {
                                run(() => restoreThaan(r.id));
                              }
                            }}
                          />
                        </td>
                        <td className="px-3">
                          {r.code !== null && (
                            <button
                              type="button"
                              onClick={() => router.push(`/thaans/print/${r.baleId}?thaan=${r.id}`)}
                              className="text-[12.5px] text-brick underline"
                            >
                              Print
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <Pager total={filtered.length} page={current} perPage={PER_PAGE} onPage={setPage} />
            </div>
          )}
        </div>
      </div>

      {voiding !== null && (
        <ConfirmDialog
          title={`Void ${voiding.code ?? "this Thaan"}?`}
          description="Marks it damaged, miscounted, or otherwise unusable — it won't be sendable through Handovers until restored. This doesn't delete anything and can be undone."
          confirmLabel="Void"
          danger
          pending={pending}
          onConfirm={() => run(() => voidThaan(voiding.id), () => setVoiding(null))}
          onCancel={() => setVoiding(null)}
        />
      )}

      <ToastBar toast={toast} onDismiss={() => showToast(null)} />
    </div>
  );
}

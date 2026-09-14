"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { ConfirmDialog, Header, RowMenu, ToastBar, useToast } from "@/components/ui";
import { Pager } from "@/components/grid";
import type { ThaanRow } from "@/lib/thaans";

import { restoreThaan, voidThaan, type ActionResult } from "./actions";

const PER_PAGE = 50;

/**
 * What a bale becomes once it's cut — cascaded with the bale and item
 * context that produced it, so this reads as the full picture rather than
 * a bare code list. Cutting and QR generation still happen from Bale
 * Intake's row menu, since they're bale-level acts; what's here is
 * Thaan-level: reprinting one QR code, and voiding a damaged or
 * miscounted piece.
 */
export function Thaans({ rows }: { rows: ThaanRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [toast, showToast] = useToast();
  const [page, setPage] = useState(1);
  const [voiding, setVoiding] = useState<ThaanRow | null>(null);

  const withQr = rows.filter((r) => r.code !== null).length;
  const voided = rows.filter((r) => r.voidedAt !== null).length;

  const pages = Math.max(1, Math.ceil(rows.length / PER_PAGE));
  const current = Math.min(page, pages);
  const from = (current - 1) * PER_PAGE;
  const pageRows = rows.slice(from, from + PER_PAGE);

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
          {rows.length === 0 ? (
            <p className="rounded-lg border border-dashed border-rule-2 px-4 py-10 text-center text-[13px] text-muted">
              No Thaans yet. They appear here once a bale is cut, from Bale
              Intake.
            </p>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-rule bg-surface">
              <div className="flex-1 overflow-auto">
                <table className="w-full border-collapse text-[13px]">
                  <thead className="sticky top-0 bg-surface-2">
                    <tr className="border-b border-rule text-left">
                      <th scope="col" className="px-4 py-2 text-[11.5px] font-medium text-muted">Code</th>
                      <th scope="col" className="px-3 py-2 text-[11.5px] font-medium text-muted">Bale</th>
                      <th scope="col" className="px-3 py-2 text-[11.5px] font-medium text-muted">Supplier</th>
                      <th scope="col" className="px-3 py-2 text-[11.5px] font-medium text-muted">Item</th>
                      <th scope="col" className="px-3 py-2 text-[11.5px] font-medium text-muted">Type</th>
                      <th scope="col" className="px-3 py-2 text-[11.5px] font-medium text-muted">Bill entry date</th>
                      <th scope="col" className="px-3 py-2 text-right text-[11.5px] font-medium text-muted">Per Thaan Mtr</th>
                      <th scope="col" className="px-3 py-2 text-[11.5px] font-medium text-muted">QR generated</th>
                      <th scope="col" className="px-3 py-2 text-[11.5px] font-medium text-muted">Status</th>
                      <th scope="col" className="w-14 px-3 py-2 text-[11.5px] font-medium text-muted">Actions</th>
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
                        <td className="px-3">
                          {r.voidedAt !== null ? (
                            <span
                              className="rounded px-1.5 py-0.5 text-[11px] font-medium"
                              style={{ background: "var(--brick-soft)", color: "var(--brick)" }}
                              title={r.voidedByName !== null ? `Voided by ${r.voidedByName}, ${r.voidedAt}` : r.voidedAt}
                            >
                              Void
                            </span>
                          ) : (
                            <span className="text-ink-2">—</span>
                          )}
                        </td>
                        <td className="px-3">
                          <RowMenu
                            label={r.code ?? "this Thaan"}
                            items={[
                              {
                                label: "Print QR code",
                                disabled: r.code === null,
                                hint: r.code === null ? "No QR code generated yet." : undefined,
                                onSelect: () => {
                                  if (r.code !== null) {
                                    router.push(`/thaans/print/${r.baleId}?thaan=${r.id}`);
                                  }
                                },
                              },
                              r.voidedAt === null
                                ? { label: "Void", danger: true, onSelect: () => setVoiding(r) }
                                : {
                                    label: "Restore",
                                    onSelect: () => run(() => restoreThaan(r.id)),
                                  },
                            ]}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <Pager total={rows.length} page={current} perPage={PER_PAGE} onPage={setPage} />
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

import Link from "next/link";

import { Header } from "@/components/ui";
import type { ThaanRow } from "@/lib/thaans";

/**
 * What a bale becomes once it's cut. Read-only: cutting and QR generation
 * both happen from Bale Intake's row menu, against the bale they came from
 * — this is the browsable result, not another place to act on them.
 */
export function Thaans({ rows }: { rows: ThaanRow[] }) {
  const withQr = rows.filter((r) => r.code !== null).length;

  return (
    <div className="flex min-h-screen flex-col">
      <Header
        title="Thaans"
        lede={`What a bale becomes once it's cut. ${rows.length} recorded, ${withQr} with a QR code.`}
      />

      <div className="flex-1 px-8 py-6">
        <div className="mx-auto max-w-4xl">
          {rows.length === 0 ? (
            <p className="rounded-lg border border-dashed border-rule-2 px-4 py-10 text-center text-[13px] text-muted">
              No Thaans yet. They appear here once a bale is cut, from Bale
              Intake.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-rule bg-surface">
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr className="border-b border-rule bg-surface-2 text-left">
                    <th scope="col" className="px-4 py-2 text-[11.5px] font-medium text-muted">
                      Code
                    </th>
                    <th scope="col" className="px-3 py-2 text-[11.5px] font-medium text-muted">
                      Bale
                    </th>
                    <th scope="col" className="px-3 py-2 text-[11.5px] font-medium text-muted">
                      Supplier
                    </th>
                    <th scope="col" className="px-3 py-2 text-[11.5px] font-medium text-muted">
                      Item
                    </th>
                    <th scope="col" className="px-3 py-2 text-[11.5px] font-medium text-muted">
                      QR generated
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="h-11 border-b border-rule last:border-b-0 hover:bg-surface-2">
                      <td className="px-4 font-mono text-[12.5px] text-ink">{r.code ?? "—"}</td>
                      <td className="px-3">
                        <Link href={`/thaans/print/${r.baleId}`} className="font-mono text-[12.5px] text-brick underline">
                          {r.baleCode}
                        </Link>
                      </td>
                      <td className="px-3 text-ink-2">{r.supplierName}</td>
                      <td className="px-3 text-ink-2">{r.itemName}</td>
                      <td className="px-3 text-ink-2">{r.qrGeneratedAt ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

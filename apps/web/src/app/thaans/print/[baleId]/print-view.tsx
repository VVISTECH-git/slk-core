"use client";

import { useRouter } from "next/navigation";

import { Button } from "@/components/ui";
import type { ThaanPrintBatch } from "@/lib/thaans";

/**
 * One Thaan's QR code, laid out for a thermal receipt roll — the kind a
 * shop's bill printer uses — rather than a grid of labels on an A4 sheet.
 * The `@page` rule below is what makes that real: without it, a browser
 * prints this at A4 with margins, and the roll printer either wastes most
 * of its paper or refuses the job.
 */
export function PrintView({ batch }: { batch: ThaanPrintBatch }) {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-surface-2">
      <style>{`
        @media print {
          @page { size: 80mm auto; margin: 0; }
          body { margin: 0; }
          .no-print { display: none !important; }
          .roll { width: 100% !important; box-shadow: none !important; }
          /* The app's sidebar, from the shared layout this page still renders inside. */
          nav[aria-label="Main"] { display: none !important; }
        }
      `}</style>

      <div className="no-print flex items-center justify-between border-b border-rule bg-surface px-8 py-4">
        <div>
          <h1 className="text-[15px] font-semibold text-ink">Print QR codes — {batch.baleCode}</h1>
          <p className="mt-0.5 text-[12.5px] text-muted">
            {batch.rows.length} Thaan{batch.rows.length === 1 ? "" : "s"}. Laid out for an 80mm
            receipt roll — check the first printout against your printer before running the rest.
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => router.push("/bales")}>Back to Bale Intake</Button>
          <Button tone="primary" onClick={() => window.print()}>
            Print
          </Button>
        </div>
      </div>

      <div className="flex justify-center py-8">
        <div className="roll w-[80mm] bg-white shadow-[var(--shadow)]">
          {batch.rows.map((row, i) => (
            <div
              key={row.id}
              className={`flex flex-col items-center gap-1 px-3 py-4 text-center ${
                i > 0 ? "border-t border-dashed border-black/30" : ""
              }`}
            >
              <div className="text-[10px] font-medium tracking-wide text-black/60">
                {batch.baleCode}
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element -- a generated SVG data URI, not an app asset */}
              <img src={row.qr} alt={`QR code ${row.code}`} width={160} height={160} />
              <div className="font-mono text-[13px] font-semibold text-black">{row.code}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

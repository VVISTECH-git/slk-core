"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Button, Field, inputClass } from "@/components/ui";
import type { ThaanPrintBatch } from "@/lib/thaans";

/**
 * One Thaan's QR code, laid out for a thermal receipt roll — the kind a
 * shop's bill printer uses — rather than a grid of labels on an A4 sheet.
 * The `@page` rule below is what makes that real: without it, a browser
 * prints this at A4 with margins, and the roll printer either wastes most
 * of its paper or refuses the job.
 */
export function PrintView({
  batch,
  back,
}: {
  batch: ThaanPrintBatch;
  back: { href: string; label: string };
}) {
  const router = useRouter();

  // Ink or paper running out partway through a long roll is a printer
  // failure, not a data problem — there's no signal from the printer to
  // tell us where it actually stopped. So the person reads the last label
  // that actually came out physically and picks up right after it, instead
  // of either reprinting labels that already exist or hunting one-by-one
  // through the Thaans screen's single-reprint action. `printedThrough` is
  // how many labels (from the top) to skip — 0 means print everything.
  const [printedThrough, setPrintedThrough] = useState(0);
  const rows = useMemo(() => batch.rows.slice(printedThrough), [batch.rows, printedThrough]);

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

      <div className="no-print flex items-center justify-between gap-4 border-b border-rule bg-surface px-8 py-4">
        <div>
          <h1 className="text-[15px] font-semibold text-ink">Print QR codes — {batch.baleCode}</h1>
          <p className="mt-0.5 text-[12.5px] text-muted">
            {printedThrough === 0
              ? `${batch.rows.length} Thaan${batch.rows.length === 1 ? "" : "s"}.`
              : `Printing ${rows.length} of ${batch.rows.length} — resuming after ${printedThrough} already done.`}{" "}
            Laid out for an 80mm receipt roll — check the first printout against your printer before
            running the rest.
          </p>
        </div>
        <div className="flex items-end gap-3">
          {batch.rows.length > 1 && (
            <div className="w-56">
              <Field label="Resume from" hint="Printer ran out partway? Pick the last label that actually printed.">
                <select
                  className={inputClass}
                  value={printedThrough}
                  onChange={(e) => setPrintedThrough(Number(e.target.value))}
                >
                  <option value={0}>Start — print all {batch.rows.length}</option>
                  {batch.rows.slice(0, -1).map((row, i) => (
                    <option key={row.id} value={i + 1}>
                      After #{i + 1} · {row.code}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          )}
          <div className="flex gap-2">
            <Button onClick={() => router.push(back.href)}>{back.label}</Button>
            <Button tone="primary" onClick={() => window.print()}>
              Print
            </Button>
          </div>
        </div>
      </div>

      <div className="flex justify-center py-8">
        <div className="roll w-[80mm] bg-white shadow-[var(--shadow)]">
          {rows.map((row, i) => (
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

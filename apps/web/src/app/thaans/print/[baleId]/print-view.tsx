"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Button, Field, inputClass } from "@/components/ui";
import type { ThaanPrintBatch } from "@/lib/thaans";

/**
 * The Thaan QR codes for a 2-inch (50mm) roll, each code followed by a dashed
 * "tear here" line — the person tears the strip apart by hand. Each code is one
 * fixed 50 × 60 mm page: the `@page` rule carries that size to the browser, and
 * the driver then feeds exactly that much stock per code. Without it a browser
 * prints at the driver's default sheet (often 4 × 6 in), which fits two or three
 * codes on a page and wastes the roll.
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
  // tell us where it actually stopped. So the person reads the *code* off
  // the last label that actually came out physically and types that in —
  // nobody standing at a printer knows a label was "#50", they know it was
  // "T00002120". Not a dropdown listing every one of a few hundred codes,
  // either.
  const [from, setFrom] = useState(batch.rows[0]?.code ?? "");
  const [to, setTo] = useState(batch.rows[batch.rows.length - 1]?.code ?? "");
  const fromIndex = batch.rows.findIndex((r) => r.code === from.trim().toUpperCase());
  const toIndex = batch.rows.findIndex((r) => r.code === to.trim().toUpperCase());
  const rangeValid = fromIndex !== -1 && toIndex !== -1 && fromIndex <= toIndex;
  const rows = useMemo(
    () => (rangeValid ? batch.rows.slice(fromIndex, toIndex + 1) : []),
    [batch.rows, rangeValid, fromIndex, toIndex],
  );

  return (
    <div className="print-root min-h-screen bg-surface-2">
      <style>{`
        @media print {
          @page { size: 50mm 60mm; margin: 0; }
          body { margin: 0; }
          .no-print { display: none !important; }
          .roll { width: 100% !important; box-shadow: none !important; }
          /* One code + its tear line per fixed-length page, so the driver feeds exactly that much. */
          .code { break-after: page; height: 59.5mm !important; }
          .code:last-child { break-after: auto; }
          /* The screen preview's padding would push the first code down the roll. */
          .print-root { min-height: 0 !important; background: white !important; }
          .print-wrap { padding: 0 !important; display: block !important; }
          /* The app's sidebar, from the shared layout this page still renders inside. */
          nav[aria-label="Main"] { display: none !important; }
        }
      `}</style>

      <div className="no-print flex items-center justify-between gap-4 border-b border-rule bg-surface px-8 py-4">
        <div>
          <h1 className="text-[15px] font-semibold text-ink">Print QR codes — {batch.baleCode}</h1>
          <p className="mt-0.5 text-[12.5px] text-muted">
            {!rangeValid
              ? "That code isn't on this bale, or From comes after To."
              : rows.length === batch.rows.length
                ? `${batch.rows.length} Thaan${batch.rows.length === 1 ? "" : "s"}.`
                : `Printing ${rows.length} of ${batch.rows.length}.`}{" "}
            Continuous roll — check the first printout before running the rest.
          </p>
        </div>
        <div className="flex items-end gap-3">
          {batch.rows.length > 1 && (
            <div className="flex gap-2">
              <div className="w-36">
                <Field label="From code">
                  <input
                    className={inputClass}
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                  />
                </Field>
              </div>
              <div className="w-36">
                <Field label="To code">
                  <input
                    className={inputClass}
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                  />
                </Field>
              </div>
            </div>
          )}
          <div className="flex gap-2">
            <Button onClick={() => router.push(back.href)}>{back.label}</Button>
            <Button tone="primary" onClick={() => window.print()} disabled={!rangeValid}>
              Print
            </Button>
          </div>
        </div>
      </div>

      <div className="print-wrap flex justify-center py-8">
        <div className="roll bg-white shadow-[var(--shadow)]" style={{ width: "50mm" }}>
          {rows.map((row) => (
            <div key={row.id} className="code flex flex-col overflow-hidden" style={{ height: "60mm" }}>
              <div className="flex flex-1 flex-col items-center justify-center gap-1 px-2 text-center">
                <div className="text-[10px] font-medium tracking-wide text-black/60">
                  {batch.baleCode}
                </div>
                {/* eslint-disable-next-line @next/next/no-img-element -- a generated SVG data URI, not an app asset */}
                <img src={row.qr} alt={`QR code ${row.code}`} width={140} height={140} />
                <div className="font-mono text-[13px] font-semibold text-black">{row.code}</div>
              </div>
              <div className="border-t border-dashed border-black/50 py-1 text-center text-[8px] tracking-widest text-black/50">
                ✂ TEAR HERE
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

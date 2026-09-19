"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Button, Field, inputClass } from "@/components/ui";
import type { ThaanPrintBatch } from "@/lib/thaans";

const SIZE_KEY = "slk.labelSize";
const DEFAULT_SIZE = { w: 50, h: 50 };

/** A saved label size, or the default — storage can be blocked or hold junk. */
function readSize(): { w: number; h: number } {
  try {
    const raw = JSON.parse(window.localStorage.getItem(SIZE_KEY) ?? "null") as { w?: unknown; h?: unknown } | null;
    if (raw !== null && typeof raw.w === "number" && typeof raw.h === "number" && raw.w > 0 && raw.h > 0) {
      return { w: raw.w, h: raw.h };
    }
  } catch {
    // fall through to the default
  }
  return DEFAULT_SIZE;
}

/**
 * One Thaan's QR code per label, for a thermal label printer (a TSC TTP-244
 * Pro and the like): each Thaan is its own page, exactly the size of the
 * label stock, so the printer feeds one die-cut label per code. The `@page`
 * rule below carries that size to the browser — without it a browser prints
 * this at A4 with margins and the label printer either wastes the roll or
 * refuses the job. The size is typed in here (labels come in many sizes) and
 * remembered on this computer.
 */
export function PrintView({
  batch,
  back,
}: {
  batch: ThaanPrintBatch;
  back: { href: string; label: string };
}) {
  const router = useRouter();

  const [size, setSize] = useState(DEFAULT_SIZE);
  // Read after mount: the server render has no localStorage, so starting from it would mismatch.
  // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time load of a saved preference
  useEffect(() => setSize(readSize()), []);
  function changeSize(next: { w: number; h: number }) {
    setSize(next);
    try {
      window.localStorage.setItem(SIZE_KEY, JSON.stringify(next));
    } catch {
      // still prints at this size; just not remembered
    }
  }
  const sizeValid = size.w >= 10 && size.h >= 10;
  // QR fills the label less a margin, leaving a strip for the two lines of text.
  const qrMm = Math.max(5, Math.min(size.w - 6, size.h - 14));

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
    <div className="min-h-screen bg-surface-2">
      <style>{`
        @media print {
          @page { size: ${size.w}mm ${size.h}mm; margin: 0; }
          body { margin: 0; }
          .no-print { display: none !important; }
          .roll { width: auto !important; box-shadow: none !important; gap: 0 !important; }
          .label { break-after: page; border: 0 !important; box-shadow: none !important; }
          .label:last-child { break-after: auto; }
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
            One label per page — check the first printout before running the rest.
          </p>
        </div>
        <div className="flex items-end gap-3">
          <div className="flex gap-2">
            <div className="w-20">
              <Field label="Label W (mm)">
                <input
                  className={inputClass}
                  type="number"
                  min={10}
                  value={size.w}
                  onChange={(e) => changeSize({ ...size, w: Number(e.target.value) })}
                />
              </Field>
            </div>
            <div className="w-20">
              <Field label="Label H (mm)">
                <input
                  className={inputClass}
                  type="number"
                  min={10}
                  value={size.h}
                  onChange={(e) => changeSize({ ...size, h: Number(e.target.value) })}
                />
              </Field>
            </div>
          </div>
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
            <Button tone="primary" onClick={() => window.print()} disabled={!rangeValid || !sizeValid}>
              Print
            </Button>
          </div>
        </div>
      </div>

      <div className="flex justify-center py-8">
        <div className="roll flex flex-col gap-3">
          {rows.map((row) => (
            <div
              key={row.id}
              className="label flex flex-col items-center justify-center overflow-hidden bg-white text-center shadow-[var(--shadow)]"
              style={{ width: `${size.w}mm`, height: `${size.h}mm` }}
            >
              <div className="text-[7pt] font-medium leading-none tracking-wide text-black/70">{batch.baleCode}</div>
              {/* eslint-disable-next-line @next/next/no-img-element -- a generated SVG data URI, not an app asset */}
              <img
                src={row.qr}
                alt={`QR code ${row.code}`}
                style={{ width: `${qrMm}mm`, height: `${qrMm}mm`, margin: "1mm 0" }}
              />
              <div className="font-mono text-[9pt] font-semibold leading-none text-black">{row.code}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

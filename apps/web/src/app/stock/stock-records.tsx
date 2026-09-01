"use client";

import { useMemo, useState } from "react";

import type { PieceRow } from "@/lib/pieces";

function money(minor: number | null): string {
  return minor === null
    ? "—"
    : `₹${(minor / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

/**
 * Stock, one physical piece at a time.
 *
 * Product Management answers "what do we sell and how much is there". This
 * answers "which saree is this", which is the question asked with a label in
 * one hand — so the codes are the first thing on the row and the QR is
 * beside them rather than hidden behind a click.
 */
export function StockRecords({ pieces }: { pieces: PieceRow[] }) {
  const [query, setQuery] = useState("");
  const [showQr, setShowQr] = useState(true);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q === "") return pieces;

    return pieces.filter((p) =>
      [p.itemCode, p.productCode, p.designCode, p.name, p.colour, p.motif]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(q)),
    );
  }, [pieces, query]);

  return (
    <div className="flex h-screen flex-col overflow-hidden px-8 py-8">
      <header className="mb-5 flex flex-none flex-wrap items-end gap-3">
        <h1 className="mr-auto text-[24px] font-semibold tracking-tight text-ink">
          Stock Records
        </h1>

        <button
          type="button"
          onClick={() => setShowQr((v) => !v)}
          className="rounded-lg border border-rule-2 bg-surface px-3 py-2 text-[13.5px] text-ink-2 hover:border-ink-2"
        >
          {showQr ? "Hide QR" : "Show QR"}
        </button>

        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Scan or type a code…"
          aria-label="Search pieces"
          // Autofocused because a barcode scanner is a keyboard that types
          // very fast and then presses Enter. If the field is not focused the
          // scan goes nowhere, which is a confusing way to discover it.
          autoFocus
          className="w-72 rounded-lg border border-rule-2 bg-surface px-3 py-2 text-[13.5px] text-ink placeholder:text-faint"
        />
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-rule bg-surface">
        <div className="flex flex-none items-center gap-3 border-b border-rule px-4 py-2.5">
          <span className="text-[12.5px] text-muted">
            {shown.length.toLocaleString("en-IN")} piece
            {shown.length === 1 ? "" : "s"}
            {query.trim() !== "" && ` matching “${query.trim()}”`}
          </span>
        </div>

        {shown.length === 0 ? (
          <div className="flex flex-1 items-center justify-center px-6 py-14 text-center">
            <div>
              <p className="text-[14px] text-ink-2">
                {pieces.length === 0 ? "No pieces yet." : "Nothing matches."}
              </p>
              <p className="mx-auto mt-1.5 max-w-md text-[12.5px] leading-relaxed text-muted">
                {pieces.length === 0
                  ? "A piece is minted when stock is received against a serialised design — sarees are tagged one by one, so each gets its own item code and QR."
                  : "Item codes, product codes, design codes, names, colours and motifs are all searchable."}
              </p>
            </div>
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-full border-collapse text-[13.5px]">
              <thead>
                <tr>
                  {[
                    "Item Code",
                    "Product Code",
                    "Product",
                    "Colour",
                    "Motif",
                    "Location",
                    "Received",
                    "Price",
                  ].map((h) => (
                    <th
                      key={h}
                      className="sticky top-0 z-10 border-b border-rule bg-surface px-3 py-2.5 text-left text-[12px] font-medium whitespace-nowrap text-muted"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {shown.map((p) => (
                  <tr
                    key={p.id}
                    className="border-b border-rule last:border-b-0 hover:bg-surface-2"
                  >
                    <td className="px-3 py-2">
                      <span className="flex items-center gap-2">
                        {showQr && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={p.itemQr}
                            alt={`QR code for item ${p.itemCode}`}
                            width={40}
                            height={40}
                            className="flex-none rounded-sm bg-white p-0.5"
                          />
                        )}
                        <span className="font-mono text-[13px] font-medium text-ink">
                          {p.itemCode}
                        </span>
                      </span>
                    </td>

                    <td className="px-3 py-2">
                      <span className="flex items-center gap-2">
                        {showQr && p.productQr !== null && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={p.productQr}
                            alt={`QR code for product ${p.productCode}`}
                            width={40}
                            height={40}
                            className="flex-none rounded-sm bg-white p-0.5"
                          />
                        )}
                        <span className="font-mono text-[13px] text-ink-2">
                          {p.productCode ?? "—"}
                        </span>
                      </span>
                    </td>

                    <td className="max-w-0 px-3 py-2">
                      <span className="block truncate text-ink" title={p.name}>
                        {p.name}
                      </span>
                      <span className="block truncate font-mono text-[11.5px] text-faint">
                        {p.designCode} · {p.productType ?? "—"}
                      </span>
                    </td>

                    <td className="px-3 py-2 text-ink-2">{p.colour ?? "—"}</td>

                    <td className="px-3 py-2 text-ink-2">
                      {p.motif ?? "—"}
                      {p.motifCategory !== null && (
                        <span className="block text-[11.5px] text-faint">
                          {p.motifCategory}
                        </span>
                      )}
                    </td>

                    <td className="px-3 py-2 text-ink-2">{p.location ?? "—"}</td>

                    <td className="px-3 py-2 whitespace-nowrap text-muted">
                      {p.receivedAt ?? "—"}
                      {p.reference !== null && (
                        <span className="block text-[11.5px] text-faint">
                          {p.reference}
                        </span>
                      )}
                    </td>

                    <td className="px-3 py-2 text-right tabular-nums text-ink-2">
                      {money(p.priceMinor)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

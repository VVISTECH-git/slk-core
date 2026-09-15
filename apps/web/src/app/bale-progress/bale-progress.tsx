"use client";

import { useState } from "react";

import { Header } from "@/components/ui";
import { Pager } from "@/components/grid";
import { STAGES } from "@/lib/stages";
import type { BaleHeatmapRow } from "@/lib/bales";

const PER_PAGE = 50;

const COLUMNS = ["Not started", ...STAGES, "Finished"];

/**
 * One row per bale: cut or not, how many Thaans it holds, and — of those —
 * how many currently sit at each stage. A bale-level view rather than
 * Thaans' own one-row-per-Thaan table, for the question "what's where"
 * instead of "where is this one Thaan".
 */
export function BaleProgress({ rows }: { rows: BaleHeatmapRow[] }) {
  const [page, setPage] = useState(1);

  const withThaans = rows.filter((r) => r.thaanCount > 0);
  const pages = Math.max(1, Math.ceil(rows.length / PER_PAGE));
  const current = Math.min(page, pages);
  const from = (current - 1) * PER_PAGE;
  const pageRows = rows.slice(from, from + PER_PAGE);

  // One scale for every cell on the page, not per row or per column — the
  // same reading as the heatmap this was built from: darker always means
  // more Thaans, full stop, wherever it appears.
  const maxCount = Math.max(1, ...pageRows.flatMap((r) => COLUMNS.map((c) => r.buckets[c] ?? 0)));

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <Header
        title="Bale Progress"
        lede={`Total Thaans per bale, whether cutting is complete, and which stage each group currently sits at. ${withThaans.length} of ${rows.length} bale${rows.length === 1 ? "" : "s"} have Thaans cut.`}
      />

      <div className="flex min-h-0 flex-1 flex-col px-8 py-6">
        <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col">
          <div className="mb-4 flex flex-none items-center gap-2 text-[11.5px] text-muted">
            <span>Fewer Thaans</span>
            <span
              aria-hidden
              className="h-2.5 w-24 rounded-full"
              style={{ background: "linear-gradient(to right, hsl(210,65%,92%), hsl(210,65%,28%))" }}
            />
            <span>More Thaans</span>
          </div>

          {rows.length === 0 ? (
            <p className="rounded-lg border border-dashed border-rule-2 px-4 py-10 text-center text-[13px] text-muted">
              No bales yet. They appear here once recorded on Bale Intake.
            </p>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-rule bg-surface">
              <div className="flex-1 overflow-auto">
                <table className="w-full border-collapse text-[12.5px]">
                  <thead className="sticky top-0 bg-surface-2">
                    <tr className="border-b border-rule text-left">
                      <th scope="col" className="px-4 py-2 text-[11px] font-medium text-muted">Bale</th>
                      <th scope="col" className="px-3 py-2 text-[11px] font-medium text-muted">Cutting</th>
                      {COLUMNS.map((c) => (
                        <th key={c} scope="col" className="px-2 py-2 text-center text-[10.5px] font-medium whitespace-nowrap text-muted">
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((r) => (
                      <tr key={r.baleId} className="border-b border-rule last:border-b-0 hover:bg-surface-2">
                        <td className="px-4 py-2">
                          <div className="font-medium text-ink">{r.baleCode}</div>
                          <div className="text-[11px] text-muted">
                            {r.thaanCount} Thaan{r.thaanCount === 1 ? "" : "s"}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                            style={{
                              background: r.cuttingComplete ? "var(--ok-soft)" : "var(--warn-soft)",
                              color: r.cuttingComplete ? "var(--ok)" : "var(--warn)",
                            }}
                          >
                            {r.cuttingComplete ? "Cutting complete" : "Not yet cut"}
                          </span>
                        </td>
                        {COLUMNS.map((c) => (
                          <Cell key={c} count={r.buckets[c] ?? 0} max={maxCount} />
                        ))}
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
    </div>
  );
}

/**
 * One blue, light-to-dark: darker always means more Thaans, whichever
 * column it's in — "Not started" and "Finished" read on the same scale as
 * every stage between them, rather than each getting its own colour.
 */
function Cell({ count, max }: { count: number; max: number }) {
  if (count === 0) {
    return <td className="px-1 py-2 text-center"><span className="block h-7 w-9 rounded-md border border-rule" /></td>;
  }

  const lightness = 92 - (count / max) * 64;
  const textLight = count / max > 0.55;

  return (
    <td className="px-1 py-2 text-center">
      <span
        className="inline-flex h-7 w-9 items-center justify-center rounded-md text-[11px] font-medium tabular-nums"
        style={{
          background: `hsl(210,65%,${lightness}%)`,
          color: textLight ? "#eef4fb" : "#0b0b0b",
        }}
      >
        {count}
      </span>
    </td>
  );
}

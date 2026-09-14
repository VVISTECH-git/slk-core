"use client";

import { useState } from "react";

import { Pager } from "@/components/grid";
import { Header } from "@/components/ui";
import type { OutstandingGroup } from "@/lib/handovers";

const PER_PAGE = 50;

/**
 * Everything out for a stage right now, grouped by stage and vendor — the
 * table Handovers used to carry alongside Send/Receive. Read-only: sending
 * and receiving still happen on Handovers itself.
 */
export function Outstanding({ rows }: { rows: OutstandingGroup[] }) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  const totalOut = rows.reduce((n, r) => n + r.count, 0);

  const q = query.trim().toLowerCase();
  const filtered =
    q === ""
      ? rows
      : rows.filter((r) => r.stage.toLowerCase().includes(q) || r.vendorName.toLowerCase().includes(q));

  const pages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const currentPage = Math.min(page, pages);
  const pageFrom = (currentPage - 1) * PER_PAGE;
  const pageRows = filtered.slice(pageFrom, pageFrom + PER_PAGE);

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <Header
        title="Currently Out"
        lede={
          rows.length === 0
            ? "Nothing is out for a stage right now."
            : `${totalOut} Thaan${totalOut === 1 ? "" : "s"} out across ${rows.length} stage/vendor group${rows.length === 1 ? "" : "s"}.`
        }
      />

      <div className="flex min-h-0 flex-1 flex-col px-8 py-6">
        <div className="mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col gap-4">
          {rows.length > 0 && (
            <div className="flex flex-none items-center gap-3">
              <input
                type="search"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
                placeholder="Search by stage or vendor…"
                aria-label="Search currently out"
                className="w-72 rounded-lg border border-rule-2 bg-surface px-3 py-2 text-[13.5px] text-ink placeholder:text-faint"
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
              Nothing is out for a stage right now.
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
                      <th scope="col" className="px-4 py-2 text-[11.5px] font-medium text-muted">Stage</th>
                      <th scope="col" className="px-3 py-2 text-[11.5px] font-medium text-muted">Vendor</th>
                      <th scope="col" className="px-3 py-2 text-right text-[11.5px] font-medium text-muted">Count</th>
                      <th scope="col" className="px-3 py-2 text-[11.5px] font-medium text-muted">Out since</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((r) => (
                      <tr
                        key={`${r.stage}::${r.vendorId ?? "in-house"}`}
                        className="h-11 border-b border-rule last:border-b-0 hover:bg-surface-2"
                      >
                        <td className="px-4 text-ink">{r.stage}</td>
                        <td className="px-3 text-ink-2">{r.vendorName}</td>
                        <td className="px-3 text-right font-mono text-[12.5px] text-ink-2 tabular-nums">{r.count}</td>
                        <td className="px-3 text-ink-2">{r.earliestSentAt}</td>
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

"use client";

import { usePreferences } from "@/components/preferences-provider";
import { useState } from "react";
import { useRouter } from "next/navigation";

import { Pager } from "@/components/grid";
import { Header } from "@/components/ui";
import type { PileRow } from "@/lib/piles";

const STATUSES = [
  { value: "", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "ready", label: "Ready" },
  { value: "live", label: "Live" },
] as const;

/** draft: still being filled in · ready: complete, waiting on Ironing · live: on the shelf. */
export function pileStatusStyle(status: PileRow["status"]): { background: string; color: string } {
  if (status === "live") return { background: "var(--ok-soft)", color: "var(--ok)" };
  if (status === "ready") return { background: "var(--off-soft)", color: "var(--off)" };
  return { background: "var(--warn-soft)", color: "var(--warn)" };
}

export function pileStatusLabel(status: PileRow["status"]): string {
  return status === "live" ? "Live" : status === "ready" ? "Ready" : "Draft";
}

/**
 * The pile's photo — one Thaan from it, taken at the door — or a neutral
 * square where there isn't one yet. A plain img, not next/image: the
 * bucket host is configured at runtime and the optimiser would need it at
 * build time (same reasoning as the catalogue's own photographs).
 */
export function PilePhoto({ url, alt, size }: { url: string | null; alt: string; size: "thumb" | "large" }) {
  const box = size === "thumb" ? "size-10 rounded" : "size-56 rounded-lg";
  if (url === null) {
    return <span aria-hidden className={`${box} block flex-none border border-dashed border-rule-2 bg-surface-3`} />;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={alt} className={`${box} flex-none border border-rule-2 object-cover`} />
  );
}

/**
 * Every pile, newest first. Nothing is made from here — piles come into
 * being on the phone, as a Print delivery is received — so the screen is a
 * list and a way into one pile's own page, where a wrong sort is put right.
 */
export function Piles({ rows }: { rows: PileRow[] }) {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<string>("");
  const [query, setQuery] = useState("");

  // Comma- or space-separated, same as the Thaans screen — "P1001 P1002"
  // finds either. Codes match from the start only, for the same reason as
  // there: "1004" is a bale and a prefix of several Thaans.
  const terms = query
    .split(/[,\s]+/)
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t !== "");
  const filtered = rows.filter(
    (r) =>
      (status === "" || r.status === status) &&
      (terms.length === 0 ||
        terms.some(
          (term) =>
            r.code.toLowerCase().startsWith(term) ||
            r.name.toLowerCase().includes(term) ||
            r.baleCodes.some((b) => b.toLowerCase().startsWith(term)),
        )),
  );

  const { preferences } = usePreferences();
  const PER_PAGE = preferences.pageSize;

  const pages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const current = Math.min(page, pages);
  const from = (current - 1) * PER_PAGE;
  const pageRows = filtered.slice(from, from + PER_PAGE);

  const thaans = rows.reduce((n, r) => n + r.thaanCount, 0);

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <Header
        title="Piles"
        lede={`What came back from Print, grouped by what's printed on it. ${rows.length} pile${rows.length === 1 ? "" : "s"}, ${thaans} Thaan${thaans === 1 ? "" : "s"} sorted.`}
      />

      <div className="flex min-h-0 flex-1 flex-col px-8 py-6">
        <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col">
          {rows.length > 0 && (
            <div className="mb-4 flex flex-none flex-wrap items-center gap-3">
              <div className="flex gap-1.5" role="group" aria-label="Filter by status">
                {STATUSES.map((s) => {
                  const selected = status === s.value;
                  return (
                    <button
                      key={s.value}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => {
                        setStatus(s.value);
                        setPage(1);
                      }}
                      className={`rounded-md border px-2.5 py-1 text-[12.5px] transition-colors ${
                        selected
                          ? "border-brick bg-brick-soft font-medium text-brick"
                          : "border-rule-2 text-muted hover:bg-surface-2"
                      }`}
                    >
                      {s.label}
                    </button>
                  );
                })}
              </div>
              <input
                type="search"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
                placeholder="Search by name, pile code or bale code"
                aria-label="Search piles"
                className="w-80 rounded-lg border border-rule-2 bg-surface px-3 py-2 text-[13.5px] text-ink placeholder:text-faint"
              />
              {(terms.length > 0 || status !== "") && (
                <span className="text-[12.5px] text-muted">
                  {filtered.length} match{filtered.length === 1 ? "" : "es"}
                </span>
              )}
            </div>
          )}

          {rows.length === 0 ? (
            <p className="rounded-lg border border-dashed border-rule-2 px-4 py-10 text-center text-[13px] text-muted">
              No piles yet. Piles are made on the phone when a Print delivery
              is received.
            </p>
          ) : filtered.length === 0 ? (
            <p className="rounded-lg border border-dashed border-rule-2 px-4 py-10 text-center text-[13px] text-muted">
              No piles match{terms.length > 0 ? ` “${query.trim()}”` : ""}
              {status !== "" ? ` in ${pileStatusLabel(status as PileRow["status"])}` : ""}.
            </p>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-rule bg-surface">
              <div className="flex-1 overflow-auto">
                <table className="w-full border-collapse whitespace-nowrap text-[13px]">
                  <thead className="sticky top-0 bg-surface-2">
                    <tr className="border-b border-rule text-left">
                      <th scope="col" className="w-14 px-4 py-2 text-[11.5px] font-medium text-muted">
                        <span className="sr-only">Photo</span>
                      </th>
                      <th scope="col" className="px-3 py-2 text-[11.5px] font-medium text-muted">Code</th>
                      <th scope="col" className="px-3 py-2 text-[11.5px] font-medium text-muted">Name</th>
                      <th scope="col" className="px-3 py-2 text-[11.5px] font-medium text-muted">Main colour</th>
                      <th scope="col" className="px-3 py-2 text-[11.5px] font-medium text-muted">Made at</th>
                      <th scope="col" className="px-3 py-2 text-[11.5px] font-medium text-muted">Status</th>
                      <th scope="col" className="px-3 py-2 text-right text-[11.5px] font-medium text-muted">Thaans</th>
                      <th scope="col" className="px-3 py-2 text-[11.5px] font-medium text-muted">Bales</th>
                      <th scope="col" className="px-3 py-2 text-[11.5px] font-medium text-muted">Made by</th>
                      <th scope="col" className="px-3 py-2 text-[11.5px] font-medium text-muted">Made on</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((r) => (
                      <tr
                        key={r.id}
                        onClick={() => router.push(`/piles/${r.id}`)}
                        className="h-14 cursor-pointer border-b border-rule last:border-b-0 hover:bg-surface-2"
                      >
                        <td className="px-4 py-2">
                          <PilePhoto url={r.photoUrl} alt={`${r.code} ${r.name}`} size="thumb" />
                        </td>
                        <td className="px-3 font-mono text-[12.5px] text-ink-2">{r.code}</td>
                        <td className="px-3 text-ink">{r.name}</td>
                        <td className="px-3 text-ink-2">{r.mainColour ?? "—"}</td>
                        <td className="px-3 text-ink-2">{r.createdStage}</td>
                        <td className="px-3">
                          <span
                            className="rounded px-1.5 py-0.5 text-[11px] font-medium"
                            style={pileStatusStyle(r.status)}
                          >
                            {pileStatusLabel(r.status)}
                          </span>
                        </td>
                        <td className="px-3 text-right font-mono text-[12.5px] text-ink-2 tabular-nums">
                          {r.thaanCount}
                        </td>
                        <td className="px-3 font-mono text-[12.5px] text-ink-2">
                          {r.baleCodes.length === 0 ? "—" : r.baleCodes.join(", ")}
                        </td>
                        <td className="px-3 text-ink-2">{r.createdByName ?? "—"}</td>
                        <td className="px-3 text-ink-2">{r.createdAt}</td>
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
    </div>
  );
}

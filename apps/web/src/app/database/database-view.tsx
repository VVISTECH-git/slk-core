"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Pager } from "@/components/grid";
import { Header } from "@/components/ui";
import type { DbUsage } from "@/lib/db-usage";

const PER_PAGE = 50;

/**
 * How much of the database is actually spoken for — Storage's own question
 * (`storage-view.tsx`), asked of Postgres instead of the R2 bucket.
 */
export function DbUsageView({ usage }: { usage: DbUsage }) {
  const router = useRouter();
  const [pending, startRefresh] = useTransition();
  const [page, setPage] = useState(1);

  const largest = usage.tables[0];

  const pages = Math.max(1, Math.ceil(usage.tables.length / PER_PAGE));
  const currentPage = Math.min(page, pages);
  const pageFrom = (currentPage - 1) * PER_PAGE;
  const pageTables = usage.tables.slice(pageFrom, pageFrom + PER_PAGE);

  return (
    <div className="flex min-h-screen flex-col">
      <Header
        title="Database"
        lede={`${formatBytes(usage.totalBytes)} across ${usage.tableCount.toLocaleString("en-IN")} table${usage.tableCount === 1 ? "" : "s"} in "${usage.databaseName}".`}
        actions={
          <button
            type="button"
            disabled={pending}
            onClick={() => startRefresh(() => router.refresh())}
            className="rounded-lg border border-rule-2 bg-surface px-4 py-2 text-[13.5px] font-medium text-ink-2 hover:bg-surface-2 disabled:opacity-50"
          >
            {pending ? "Refreshing…" : "Refresh"}
          </button>
        }
      />

      <div className="flex-1 px-8 py-6">
        <div className="mx-auto flex max-w-4xl flex-col gap-7">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Total size" value={formatBytes(usage.totalBytes)} />
            <Stat label="Tables" value={usage.tableCount.toLocaleString("en-IN")} />
            <Stat
              label="Rows"
              value={`~${usage.totalRowEstimate.toLocaleString("en-IN")}`}
              hint="A planner estimate, not an exact count — fast at any size, not exact at any size."
            />
            <Stat
              label="Largest table"
              value={largest?.name ?? "—"}
              hint={largest !== undefined ? formatBytes(largest.totalBytes) : undefined}
            />
          </div>

          <Section title="Heaviest tables" lede="Every table in the database, by total size — data plus its own indexes.">
            {usage.tables.length === 0 ? (
              <Empty>Nothing here yet.</Empty>
            ) : (
              <Table
                head={["Table", "Rows (approx)", "Data", "Indexes", "Total"]}
                rows={pageTables.map((t) => [
                  t.name,
                  `~${t.rowEstimate.toLocaleString("en-IN")}`,
                  formatBytes(t.tableBytes),
                  formatBytes(t.indexBytes),
                  formatBytes(t.totalBytes),
                ])}
                footer={<Pager total={usage.tables.length} page={currentPage} perPage={PER_PAGE} onPage={setPage} />}
              />
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-rule bg-surface p-4">
      <p className="text-[11.5px] font-medium text-muted">{label}</p>
      <p className="mt-1 truncate text-[22px] leading-none font-semibold tracking-tight text-ink" title={value}>
        {value}
      </p>
      {hint !== undefined && (
        <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted">{hint}</p>
      )}
    </div>
  );
}

function Section({
  title,
  lede,
  children,
}: {
  title: string;
  lede: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-[15px] font-semibold tracking-tight text-ink">{title}</h2>
      <p className="mt-0.5 text-[12.5px] text-muted">{lede}</p>
      <div className="mt-3 overflow-hidden rounded-lg border border-rule bg-surface">
        {children}
      </div>
    </section>
  );
}

function Table({ head, rows, footer }: { head: string[]; rows: string[][]; footer?: React.ReactNode }) {
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-rule bg-surface-2">
              {head.map((h, i) => (
                <th
                  key={h}
                  className={`px-4 py-2 text-left text-[11.5px] font-medium text-muted ${
                    i > 0 ? "text-right" : ""
                  }`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-b border-rule last:border-b-0">
                {row.map((cell, j) => (
                  <td
                    key={j}
                    className={`truncate px-4 py-2 font-mono text-[12px] ${
                      j === 0 ? "max-w-xs text-ink" : "text-right text-ink-2"
                    }`}
                    title={cell}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {footer}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-4 py-8 text-center text-[13px] text-muted">{children}</p>
  );
}

/** 1536 reads as "1.5 KB", not "1536 B" — the unit a person would actually say. */
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";

  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** i;

  return `${value.toFixed(i === 0 ? 0 : value < 10 ? 2 : 1)} ${units[i]}`;
}

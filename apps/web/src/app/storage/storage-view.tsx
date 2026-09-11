"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import { Header } from "@/components/ui";
import type { StorageUsage } from "@/lib/storage-usage";

/**
 * How much of the photograph bucket is actually spoken for.
 *
 * R2 has no "how big is this bucket" call of its own — the server walks
 * every object on each visit and this just renders what came back. Worth
 * having on its own screen rather than folded into Locations or Master
 * Lists: it answers a cost question ("what are we paying R2 for"), not a
 * stock or vocabulary one.
 */
export function StorageUsageView({ usage }: { usage: StorageUsage }) {
  const router = useRouter();
  const [pending, startRefresh] = useTransition();

  if (!usage.configured) {
    return (
      <div className="flex min-h-screen flex-col">
        <Header
          title="Storage"
          lede="How much of the photograph bucket is used, and what is in it."
        />
        <div className="flex-1 px-8 py-6">
          <div className="mx-auto max-w-2xl rounded-lg border border-rule bg-surface p-6">
            <p className="text-[14px] font-medium text-ink">
              R2 is not configured on this deployment.
            </p>
            <p className="mt-2 text-[13px] leading-relaxed text-muted">
              Missing:{" "}
              <span className="font-mono text-ink-2">
                {usage.missing.join(", ")}
              </span>
              . Without these the app cannot read the bucket, and photograph
              upload does not work either.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header
        title="Storage"
        lede={`${formatBytes(usage.totalBytes)} across ${usage.objectCount.toLocaleString("en-IN")} photograph${usage.objectCount === 1 ? "" : "s"} in the bucket.`}
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
            <Stat label="Total used" value={formatBytes(usage.totalBytes)} />
            <Stat
              label="Photographs"
              value={usage.objectCount.toLocaleString("en-IN")}
            />
            <Stat
              label="Orphaned"
              value={usage.orphanCount.toLocaleString("en-IN")}
              hint={
                usage.orphanCount > 0
                  ? `${formatBytes(usage.orphanBytes)} — files in the bucket no record points at`
                  : "Every file is on a record"
              }
              warn={usage.orphanCount > 0}
            />
            <Stat
              label="Missing"
              value={usage.missingCount.toLocaleString("en-IN")}
              hint={
                usage.missingCount > 0
                  ? "Records that name a file the bucket does not have"
                  : "Every record's file is present"
              }
              warn={usage.missingCount > 0}
            />
          </div>

          {usage.orphanCount > 0 && (
            <p className="text-[12.5px] leading-relaxed text-muted">
              Orphaned files are the usual reason the bucket runs ahead of the
              catalogue — a photograph replaced rather than deleted, or a
              record removed before its images were. They cost the same R2
              storage as any other file and nothing on screen still points
              at them, so they are safe to remove; this screen does not do
              that on its own.
            </p>
          )}

          <Section title="Heaviest products" lede="The twenty consignments holding the most photographs, by size.">
            {usage.byColourway.length === 0 ? (
              <Empty>Nothing uploaded yet.</Empty>
            ) : (
              <Table
                head={["Product", "Code", "Files", "Size"]}
                rows={usage.byColourway.map((c) => [
                  c.name ?? "—",
                  c.productCode ?? c.colourwayId.slice(0, 8),
                  c.count.toLocaleString("en-IN"),
                  formatBytes(c.bytes),
                ])}
              />
            )}
          </Section>

          <Section title="By file type" lede="What the bucket is actually holding.">
            {usage.byExtension.length === 0 ? (
              <Empty>Nothing uploaded yet.</Empty>
            ) : (
              <Table
                head={["Type", "Files", "Size"]}
                rows={usage.byExtension.map((e) => [
                  `.${e.ext}`,
                  e.count.toLocaleString("en-IN"),
                  formatBytes(e.bytes),
                ])}
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
  warn,
}: {
  label: string;
  value: string;
  hint?: string;
  warn?: boolean;
}) {
  return (
    <div className="rounded-lg border border-rule bg-surface p-4">
      <p className="text-[11.5px] font-medium text-muted">{label}</p>
      <p
        className={`mt-1 text-[22px] leading-none font-semibold tracking-tight ${
          warn ? "text-warn" : "text-ink"
        }`}
      >
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

function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-rule bg-surface-2">
            {head.map((h, i) => (
              <th
                key={h}
                className={`px-4 py-2 text-left text-[11.5px] font-medium text-muted ${
                  i > 1 ? "text-right" : ""
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
                  className={`truncate px-4 py-2 ${
                    j === 0 ? "max-w-xs text-ink" : "text-ink-2"
                  } ${j > 1 ? "text-right font-mono text-[12px]" : ""}`}
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

"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart,
  Legend as ChartLegend,
  LinearScale,
  Tooltip,
} from "chart.js";

import { Header } from "@/components/ui";
import { Pager } from "@/components/grid";
import { STAGES } from "@/lib/stages";
import type { BaleHeatmapRow } from "@/lib/bales";

Chart.register(BarElement, ArcElement, CategoryScale, LinearScale, ChartLegend, Tooltip);

const PER_PAGE = 50;
const COLUMNS = ["Not started", ...STAGES, "Finished"];

/** Read once at mount — canvas can't resolve CSS vars, and this is however the theme actually ended up (manual toggle or system). */
function themeColors() {
  const s = getComputedStyle(document.documentElement);
  const get = (name: string) => s.getPropertyValue(name).trim();
  return {
    ink: get("--ink"),
    brick: get("--brick"),
    ok: get("--ok"),
    warn: get("--warn"),
    off: get("--off"),
    surface: get("--surface"),
    rule: get("--rule"),
    muted: get("--muted"),
  };
}

/**
 * The dashboard: headline numbers, then how every Thaan in the pipeline
 * breaks down — by current stage, and by not-started/in-process/finished —
 * before the per-bale heatmap underneath for the "which bale, exactly"
 * follow-up question.
 */
export function Dashboard({ rows }: { rows: BaleHeatmapRow[] }) {
  const [page, setPage] = useState(1);
  const barRef = useRef<HTMLCanvasElement>(null);
  const donutRef = useRef<HTMLCanvasElement>(null);

  const withThaans = rows.filter((r) => r.thaanCount > 0);
  const cuttingComplete = rows.filter((r) => r.cuttingComplete).length;
  const totalThaans = rows.reduce((sum, r) => sum + r.thaanCount, 0);
  const notStarted = rows.reduce((sum, r) => sum + (r.buckets["Not started"] ?? 0), 0);
  const finished = rows.reduce((sum, r) => sum + (r.buckets["Finished"] ?? 0), 0);
  const inProcess = totalThaans - notStarted - finished;
  const pct = (n: number) => (totalThaans > 0 ? Math.round((n / totalThaans) * 100) : 0);

  const stageTotals = COLUMNS.map((c) => rows.reduce((sum, r) => sum + (r.buckets[c] ?? 0), 0));

  const pages = Math.max(1, Math.ceil(rows.length / PER_PAGE));
  const current = Math.min(page, pages);
  const from = (current - 1) * PER_PAGE;
  const pageRows = rows.slice(from, from + PER_PAGE);
  const maxCount = Math.max(1, ...pageRows.flatMap((r) => COLUMNS.map((c) => r.buckets[c] ?? 0)));

  useEffect(() => {
    if (barRef.current === null || donutRef.current === null) return;
    const c = themeColors();

    const bar = new Chart(barRef.current, {
      type: "bar",
      data: {
        labels: COLUMNS,
        datasets: [
          {
            label: "Thaans",
            data: stageTotals,
            backgroundColor: c.brick,
            borderRadius: 4,
            maxBarThickness: 36,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: c.muted, autoSkip: false, maxRotation: 35, minRotation: 20 }, grid: { display: false } },
          y: { ticks: { color: c.muted, precision: 0 }, grid: { color: c.rule } },
        },
      },
    });

    const donut = new Chart(donutRef.current, {
      type: "doughnut",
      data: {
        labels: ["Not started", "In process", "Finished"],
        datasets: [
          {
            data: [notStarted, inProcess, finished],
            backgroundColor: [c.off, c.warn, c.ok],
            borderColor: c.surface,
            borderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "62%",
        plugins: { legend: { display: false } },
      },
    });

    return () => {
      bar.destroy();
      donut.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <Header
        title="Dashboard"
        lede={`Every bale's Thaans, where they currently sit, and whether cutting is done. ${withThaans.length} of ${rows.length} bale${rows.length === 1 ? "" : "s"} have Thaans cut.`}
      />

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-8 py-6">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Tile tone="brick" label="Bales" value={String(rows.length)} sub={`${cuttingComplete} cutting complete`} />
            <Tile tone="ink" label="Total Thaans" value={String(totalThaans)} sub="across every bale" />
            <Tile tone="off" label="Not started" value={String(notStarted)} sub={`${pct(notStarted)}% of Thaans`} />
            <Tile tone="warn" label="In process" value={String(inProcess)} sub={`${pct(inProcess)}% of Thaans`} />
            <Tile tone="ok" label="Finished" value={String(finished)} sub={`${pct(finished)}% of Thaans`} />
          </div>

          {totalThaans > 0 && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.6fr_1fr]">
              <div className="rounded-lg border border-rule bg-surface p-5">
                <h2 className="mb-3 text-[13px] font-medium text-ink-2">Thaans by current stage</h2>
                <div className="relative h-64">
                  <canvas ref={barRef} role="img" aria-label="Bar chart of Thaan counts by current pipeline stage" />
                </div>
              </div>
              <div className="rounded-lg border border-rule bg-surface p-5">
                <h2 className="mb-3 text-[13px] font-medium text-ink-2">Thaans by status</h2>
                <div className="relative h-64">
                  <canvas ref={donutRef} role="img" aria-label="Donut chart of Thaans not started, in process, and finished" />
                </div>
                <div className="mt-3 flex flex-wrap justify-center gap-4 text-[11.5px] text-muted">
                  <LegendDot tone="off" label={`Not started (${notStarted})`} />
                  <LegendDot tone="warn" label={`In process (${inProcess})`} />
                  <LegendDot tone="ok" label={`Finished (${finished})`} />
                </div>
              </div>
            </div>
          )}

          <div>
            <h2 className="mb-1 text-[13px] font-medium text-ink-2">Bale progress heatmap</h2>
            <div className="mb-3 flex items-center gap-2 text-[11.5px] text-muted">
              <span>Which stage each bale&rsquo;s Thaans currently sit at</span>
              <span>·</span>
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
              <div className="overflow-hidden rounded-lg border border-rule bg-surface">
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-[12.5px]">
                    <thead className="bg-surface-2">
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
    </div>
  );
}

const TILE_TONE: Record<string, { background: string; color: string }> = {
  brick: { background: "var(--brick)", color: "var(--on-brick)" },
  ink: { background: "var(--ink)", color: "var(--surface)" },
  off: { background: "var(--off)", color: "var(--surface)" },
  warn: { background: "var(--warn)", color: "var(--surface)" },
  ok: { background: "var(--ok)", color: "var(--surface)" },
};

function Tile({ tone, label, value, sub }: { tone: keyof typeof TILE_TONE; label: string; value: string; sub: string }) {
  return (
    <div className="rounded-lg p-4" style={TILE_TONE[tone]}>
      <p className="text-[11px] font-medium tracking-wide uppercase opacity-80">{label}</p>
      <p className="mt-1 text-[26px] leading-none font-semibold tracking-tight tabular-nums">{value}</p>
      <p className="mt-1 text-[11.5px] opacity-80">{sub}</p>
    </div>
  );
}

function LegendDot({ tone, label }: { tone: keyof typeof TILE_TONE; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span aria-hidden className="h-2.5 w-2.5 rounded-sm" style={{ background: TILE_TONE[tone].background }} />
      {label}
    </span>
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

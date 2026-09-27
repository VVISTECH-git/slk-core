"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import type { BaleHeatmapRow } from "@/lib/bales";
import { STAGES } from "@/lib/stages";

/*
  A wall screen is one visual world, not a themed page: dark, so the numbers
  carry across a lit room and the screen does not glow; the same whatever the
  browser's theme. Colours mean one thing each, everywhere on the board:
    amber  — OUT for a stage: with the vendor, or in-house, right now
    rose   — READY for a stage: back in hand, waiting to be sent
    green  — finished every stage
    grey   — cut, not sent anywhere yet
*/
const C = {
  ground: "#12100d",
  panel: "#1c1915",
  panelLit: "#241f1a",
  rule: "#2e2822",
  ink: "#f4efe8",
  muted: "#9d948a",
  dim: "#4b443d",
  out: "#e8a93b",
  ready: "#ec6f53",
  done: "#7fc08c",
  idle: "#b7aea4",
} as const;

const REFRESH_MS = 60_000;
/** After this long without fresh numbers the "updated" line turns amber — the screen may be showing an old picture. */
const STALE_MS = 3 * 60_000;
/** Bales listed under the stages; more than this and the board says how many are left out rather than scrolling. */
const MAX_BALES = 6;

type Totals = { out: number; ready: number };

function totalsFor(rows: BaleHeatmapRow[], stage: string): Totals {
  return rows.reduce(
    (t, r) => ({ out: t.out + (r.split[stage]?.out ?? 0), ready: t.ready + (r.split[stage]?.ready ?? 0) }),
    { out: 0, ready: 0 },
  );
}

const time = (d: Date) => d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
const n = (v: number) => v.toLocaleString("en-IN");

export function FloorBoard({ rows, loadedAt }: { rows: BaleHeatmapRow[]; loadedAt: string }) {
  const router = useRouter();
  const [now, setNow] = useState(() => new Date());

  // New numbers every minute; the clock ticks on its own so the screen
  // visibly lives even when nothing has moved.
  useEffect(() => {
    const refresh = setInterval(() => router.refresh(), REFRESH_MS);
    const tick = setInterval(() => setNow(new Date()), 15_000);
    return () => {
      clearInterval(refresh);
      clearInterval(tick);
    };
  }, [router]);

  const loaded = new Date(loadedAt);
  const stale = now.getTime() - loaded.getTime() > STALE_MS;

  const total = rows.reduce((s, r) => s + r.thaanCount, 0);
  const notStarted = rows.reduce((s, r) => s + (r.buckets["Not started"] ?? 0), 0);
  const finished = rows.reduce((s, r) => s + (r.buckets["Finished"] ?? 0), 0);
  const stages = STAGES.map((stage) => ({ stage, ...totalsFor(rows, stage) }));
  const allOut = stages.reduce((s, x) => s + x.out, 0);
  const allReady = stages.reduce((s, x) => s + x.ready, 0);

  // Bales still moving: some Thaans cut and not all of them finished.
  const moving = rows.filter((r) => r.thaanCount > 0 && (r.buckets["Finished"] ?? 0) < r.thaanCount);
  const bales = moving.slice(0, MAX_BALES);

  const cols = `minmax(0,0.8fr) repeat(${STAGES.length}, minmax(0,1fr)) minmax(0,0.8fr)`;

  return (
    <div
      className="flex h-screen flex-col gap-[1.2vh] overflow-hidden px-[1.6vw] py-[1.8vh]"
      style={{ background: C.ground, color: C.ink }}
    >
      {/* Title, the four numbers that matter, and when the board last heard from the server. */}
      <header className="flex items-end gap-[2.4vw]">
        <div className="mr-auto">
          <p style={{ color: C.muted, fontSize: "clamp(12px,0.95vw,20px)" }} className="tracking-[0.14em] uppercase">
            Sree Lakshmi Kalamkari
          </p>
          <h1 style={{ fontSize: "clamp(22px,2.2vw,46px)" }} className="leading-none font-semibold tracking-tight">
            Kora to Shelf
          </h1>
        </div>
        <Headline label="Thaans" value={total} color={C.ink} />
        <Headline label="Out at stages" value={allOut} color={C.out} />
        <Headline label="Ready to send" value={allReady} color={C.ready} />
        <Headline label="Finished" value={finished} color={C.done} />
        <div className="text-right">
          <p style={{ fontSize: "clamp(22px,2.2vw,46px)" }} className="leading-none font-semibold tabular-nums">
            {time(now)}
          </p>
          <p style={{ color: stale ? C.out : C.muted, fontSize: "clamp(11px,0.8vw,17px)" }} className="mt-1">
            {stale ? `Not updated since ${time(loaded)} — check the connection` : `Updated ${time(loaded)} · every minute`}
          </p>
        </div>
      </header>

      {/* The pipeline, left to right: one column per stage, every number printed. */}
      <section className="grid min-h-0 flex-[1.35] gap-[0.5vw]" style={{ gridTemplateColumns: cols }}>
        <EndColumn title="Cut, not sent" value={notStarted} color={C.idle} note="waiting for Label Stitching" />
        {stages.map((s, i) => (
          <StageColumn key={s.stage} step={i + 1} stage={s.stage} out={s.out} ready={s.ready} />
        ))}
        <EndColumn title="Finished" value={finished} color={C.done} note="through Ironing" />
      </section>

      {/* The same columns, bale by bale. */}
      <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg" style={{ background: C.panel }}>
        <div
          className="grid items-center gap-[0.5vw] px-[0.6vw] py-[0.8vh]"
          style={{ gridTemplateColumns: `minmax(0,1.2fr) ${cols}`, color: C.muted, fontSize: "clamp(11px,0.75vw,16px)", borderBottom: `1px solid ${C.rule}` }}
        >
          <span className="tracking-[0.1em] uppercase">Bale</span>
          <span className="text-center">Not sent</span>
          {STAGES.map((s) => (
            <span key={s} className="truncate text-center">
              {s}
            </span>
          ))}
          <span className="text-center">Finished</span>
        </div>
        {bales.length === 0 ? (
          <p className="m-auto" style={{ color: C.muted, fontSize: "clamp(14px,1.2vw,26px)" }}>
            No bale is moving through the stages right now.
          </p>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            {bales.map((r) => (
              <div
                key={r.baleId}
                className="grid flex-1 items-center gap-[0.5vw] px-[0.6vw]"
                style={{ gridTemplateColumns: `minmax(0,1.2fr) ${cols}`, borderBottom: `1px solid ${C.rule}`, maxHeight: "9vh" }}
              >
                <span className="truncate" style={{ fontSize: "clamp(14px,1.25vw,28px)" }}>
                  <span className="font-semibold tabular-nums">{r.baleCode}</span>
                  <span style={{ color: C.muted }}> · {r.baleType}</span>
                </span>
                <Single value={r.buckets["Not started"] ?? 0} color={C.idle} />
                {STAGES.map((s) => (
                  <Pair key={s} out={r.split[s]?.out ?? 0} ready={r.split[s]?.ready ?? 0} />
                ))}
                <Single value={r.buckets["Finished"] ?? 0} color={C.done} />
              </div>
            ))}
            {moving.length > bales.length && (
              <p className="px-[0.6vw] py-[0.6vh]" style={{ color: C.muted, fontSize: "clamp(11px,0.8vw,17px)" }}>
                + {moving.length - bales.length} more bale{moving.length - bales.length === 1 ? "" : "s"} moving — totals above include them.
              </p>
            )}
          </div>
        )}
      </section>

      {/* The key, always on screen, so nobody has to ask what a colour means. */}
      <footer className="flex flex-wrap items-center gap-x-[2vw] gap-y-1" style={{ color: C.muted, fontSize: "clamp(11px,0.85vw,18px)" }}>
        <Key color={C.out} label="OUT — at the stage now, with the vendor or in-house" />
        <Key color={C.ready} label="READY — back in hand, waiting to be sent for the stage" />
        <Key color={C.idle} label="Cut, not sent anywhere yet" />
        <Key color={C.done} label="Finished every stage" />
      </footer>
    </div>
  );
}

function Headline({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="text-right">
      <p style={{ color: C.muted, fontSize: "clamp(11px,0.8vw,17px)" }} className="tracking-[0.12em] uppercase">
        {label}
      </p>
      <p style={{ color, fontSize: "clamp(26px,2.9vw,62px)" }} className="leading-none font-semibold tabular-nums">
        {n(value)}
      </p>
    </div>
  );
}

/** One stage: its name, then OUT and READY as two big numbers — dimmed to grey when zero, so the live stages stand out. */
function StageColumn({ step, stage, out, ready }: { step: number; stage: string; out: number; ready: number }) {
  const live = out + ready > 0;
  return (
    <div
      className="flex min-h-0 flex-col rounded-lg px-[0.6vw] py-[1vh]"
      style={{ background: live ? C.panelLit : C.panel, borderTop: `4px solid ${live ? C.ink : C.rule}` }}
    >
      <p style={{ color: C.muted, fontSize: "clamp(10px,0.7vw,15px)" }} className="tabular-nums">
        Stage {step}
      </p>
      <p
        style={{ color: live ? C.ink : C.muted, fontSize: "clamp(13px,1.1vw,24px)" }}
        className="leading-tight font-semibold text-balance"
      >
        {stage}
      </p>
      <div className="mt-auto flex flex-col gap-[1.2vh] pt-[1vh]">
        <Figure label="Out" value={out} color={C.out} />
        <Figure label="Ready" value={ready} color={C.ready} />
      </div>
    </div>
  );
}

function Figure({ label, value, color }: { label: string; value: number; color: string }) {
  const on = value > 0;
  return (
    <div>
      <p style={{ color: on ? color : C.dim, fontSize: "clamp(10px,0.75vw,16px)" }} className="font-semibold tracking-[0.14em] uppercase">
        {label}
      </p>
      <p style={{ color: on ? color : C.dim, fontSize: "clamp(26px,3.3vw,72px)" }} className="leading-none font-semibold tabular-nums">
        {n(value)}
      </p>
    </div>
  );
}

function EndColumn({ title, value, color, note }: { title: string; value: number; color: string; note: string }) {
  const on = value > 0;
  return (
    <div className="flex min-h-0 flex-col rounded-lg px-[0.6vw] py-[1vh]" style={{ background: C.panel, borderTop: `4px solid ${on ? color : C.rule}` }}>
      <p style={{ color: on ? C.ink : C.muted, fontSize: "clamp(13px,1.1vw,24px)" }} className="leading-tight font-semibold">
        {title}
      </p>
      <p style={{ color: C.muted, fontSize: "clamp(10px,0.7vw,15px)" }}>{note}</p>
      <p style={{ color: on ? color : C.dim, fontSize: "clamp(30px,3.8vw,84px)" }} className="mt-auto leading-none font-semibold tabular-nums">
        {n(value)}
      </p>
    </div>
  );
}

/** A bale's cell at one stage: OUT and READY side by side, each only when it has something. */
function Pair({ out, ready }: { out: number; ready: number }) {
  const size = "clamp(14px,1.35vw,30px)";
  if (out + ready === 0) {
    return (
      <span className="text-center" style={{ color: C.dim, fontSize: size }}>
        ·
      </span>
    );
  }
  return (
    <span className="flex items-baseline justify-center gap-[0.5vw] font-semibold tabular-nums" style={{ fontSize: size }}>
      {out > 0 && <span style={{ color: C.out }}>{n(out)}</span>}
      {ready > 0 && <span style={{ color: C.ready }}>{n(ready)}</span>}
    </span>
  );
}

function Single({ value, color }: { value: number; color: string }) {
  return (
    <span
      className="text-center font-semibold tabular-nums"
      style={{ color: value > 0 ? color : C.dim, fontSize: "clamp(14px,1.35vw,30px)" }}
    >
      {value > 0 ? n(value) : "·"}
    </span>
  );
}

function Key({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-2">
      <span aria-hidden className="inline-block h-[0.9em] w-[0.9em] rounded-sm" style={{ background: color }} />
      {label}
    </span>
  );
}

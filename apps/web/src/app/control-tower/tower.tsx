"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import type { TowerSnapshot, TowerStage } from "@/lib/control-tower";
import { STAGES } from "@/lib/stages";

/*
  One visual world for a screen on the wall: dark, so numbers carry across a
  lit room. Every colour means exactly one thing, everywhere on the board —
    amber  OUT      at a stage now, with the vendor or in-house
    blue   READY    back in hand, waiting to be sent for the stage
    green  FINISHED through every stage
    grey   NOT SENT cut, not sent anywhere yet
    red    EXCEPTION — overdue, idle past its standard, damaged. Nothing
           else is ever red, so a red mark always means "act on this".
*/
const C = {
  ground: "#0f0e0c",
  panel: "#191714",
  panelLit: "#211e1a",
  rule: "#2c2823",
  ink: "#f3eee7",
  muted: "#968d83",
  dim: "#4a443e",
  out: "#e9a93a",
  ready: "#5aa8e0",
  done: "#78bf87",
  idle: "#b3aaa0",
  alarm: "#ff5b4f",
  alarmSoft: "rgba(255,91,79,0.14)",
  warn: "#f08a3c",
  info: "#5aa8e0",
} as const;

const REFRESH_MS = 60_000;
const STALE_MS = 3 * 60_000;
const MAX_BALES = 5;
const MAX_ALERTS = 7;
const MAX_VENDORS = 7;

const clock = (d: Date) => d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
const n = (v: number) => v.toLocaleString("en-IN");
const age = (d: number) => (d < 1 ? `${Math.max(1, Math.round(d * 24))} h` : `${Math.floor(d)} d`);
const dayTarget = (d: number) => `${Number.isInteger(d) ? d : d.toFixed(1)} d`;

// Sizes follow the screen's width, so the same board reads on a 32" TV and a 55" one.
const fs = {
  label: "clamp(10px,0.68vw,15px)",
  small: "clamp(11px,0.78vw,17px)",
  body: "clamp(12px,0.92vw,20px)",
  name: "clamp(13px,1.05vw,23px)",
  kpi: "clamp(24px,2.6vw,56px)",
  big: "clamp(24px,2.9vw,64px)",
  title: "clamp(20px,1.9vw,40px)",
};

export function ControlTower({ snap }: { snap: TowerSnapshot }) {
  const router = useRouter();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const refresh = setInterval(() => router.refresh(), REFRESH_MS);
    const tick = setInterval(() => setNow(new Date()), 15_000);
    return () => {
      clearInterval(refresh);
      clearInterval(tick);
    };
  }, [router]);

  const taken = new Date(snap.takenAt);
  const stale = now.getTime() - taken.getTime() > STALE_MS;
  const t = snap.totals;
  const laneCols = `minmax(0,0.78fr) repeat(${snap.stages.length}, minmax(0,1fr)) minmax(0,0.78fr)`;

  return (
    <div
      className="flex h-screen flex-col gap-[1.1vh] overflow-hidden px-[1.3vw] py-[1.5vh]"
      style={{ background: C.ground, color: C.ink, fontVariantNumeric: "tabular-nums" }}
    >
      {/* ── Header: name, the numbers that matter, and whether this picture is current ── */}
      <header className="flex items-end gap-[1.6vw]">
        <div className="mr-auto min-w-0">
          <p className="tracking-[0.16em] uppercase" style={{ color: C.muted, fontSize: fs.small }}>
            Sree Lakshmi Kalamkari · Kora to Shelf
          </p>
          <h1 className="leading-none font-semibold tracking-tight" style={{ fontSize: fs.title }}>
            Control Tower
          </h1>
        </div>
        <Kpi label="In pipeline" value={t.inPipeline} color={C.ink} />
        <Kpi label="Out" value={t.out} color={C.out} />
        <Kpi label="Ready" value={t.ready} color={C.ready} />
        <Kpi label="Overdue" value={t.overdue} color={t.overdue > 0 ? C.alarm : C.dim} alarm={t.overdue > 0} />
        <Kpi label="Idle" value={t.idle} color={t.idle > 0 ? C.warn : C.dim} alarm={t.idle > 0} />
        <div className="text-right">
          <p className="tracking-[0.14em] uppercase" style={{ color: C.muted, fontSize: fs.label }}>
            Today
          </p>
          <p className="leading-none font-semibold" style={{ fontSize: fs.kpi }}>
            <span style={{ color: C.out }}>{n(t.sentToday)}</span>
            <span style={{ color: C.dim }}> / </span>
            <span style={{ color: C.ready }}>{n(t.receivedToday)}</span>
          </p>
          <p style={{ color: C.muted, fontSize: fs.label }}>sent / received</p>
        </div>
        <Kpi label="Finished" value={t.finished} color={t.finished > 0 ? C.done : C.dim} />
        <div className="pl-[0.6vw] text-right" style={{ borderLeft: `1px solid ${C.rule}` }}>
          <p className="leading-none font-semibold" style={{ fontSize: fs.kpi }}>
            {clock(now)}
          </p>
          <p style={{ color: stale ? C.alarm : C.muted, fontSize: fs.small }} className="mt-1">
            {stale ? `Stale since ${clock(taken)} — check connection` : `Live · updated ${clock(taken)}`}
          </p>
        </div>
      </header>

      {/* ── The life cycle, left to right ── */}
      <section className="grid min-h-0 flex-[1.08] gap-[0.45vw]" style={{ gridTemplateColumns: laneCols }}>
        <EndLane title="Not sent" note="Cut, waiting for Label Stitching" value={t.notStarted} color={C.idle} />
        {snap.stages.map((s, i) => (
          <Lane key={s.stage} step={i + 1} s={s} />
        ))}
        <EndLane
          title="Finished"
          note="Through every stage"
          value={t.finished}
          color={C.done}
          footer={t.readyForShelf > 0 ? `${n(t.readyForShelf)} to put on a shelf` : undefined}
        />
      </section>

      {/* ── What to act on, who holds what, how work is flowing, each bale's progress ── */}
      <section className="grid min-h-0 flex-1 gap-[0.45vw]" style={{ gridTemplateColumns: "1.25fr 1.05fr 1fr 1.1fr" }}>
        <Panel title="Needs attention" aside={snap.alerts.length > 0 ? `${snap.alerts.length}` : undefined}>
          <Alerts alerts={snap.alerts} />
        </Panel>
        <Panel title="Held by vendors" aside={`${snap.vendors.length} ${snap.vendors.length === 1 ? "holder" : "holders"}`}>
          <Vendors vendors={snap.vendors} />
        </Panel>
        <Panel title="Flow · last 7 days" aside="sent · received">
          <Flow days={snap.days} />
        </Panel>
        <Panel title="Bales" aside="life cycle">
          <Bales bales={snap.bales} />
        </Panel>
      </section>

      {/* ── The key, always on screen ── */}
      <footer className="flex flex-wrap items-center gap-x-[1.6vw] gap-y-1" style={{ color: C.muted, fontSize: fs.small }}>
        <Key color={C.out} label="Out — at the stage now" />
        <Key color={C.ready} label="Ready — back in hand, to be sent" />
        <Key color={C.idle} label="Not sent yet" />
        <Key color={C.done} label="Finished" />
        <Key color={C.alarm} label="Red — past the standard, act now" />
        <Link href="/control-tower/standards" className="ml-auto underline decoration-dotted" style={{ color: C.muted }}>
          Turnaround standards
        </Link>
      </footer>
    </div>
  );
}

function Kpi({ label, value, color, alarm = false }: { label: string; value: number; color: string; alarm?: boolean }) {
  return (
    <div className="rounded-md px-[0.5vw] text-right" style={{ background: alarm ? C.alarmSoft : "transparent" }}>
      <p className="tracking-[0.14em] uppercase" style={{ color: alarm ? color : C.muted, fontSize: fs.label }}>
        {label}
      </p>
      <p className="leading-none font-semibold" style={{ color, fontSize: fs.kpi }}>
        {n(value)}
      </p>
    </div>
  );
}

/** One stage: its standard, then OUT and READY each with its clock, then today's movement and the real turnaround. */
function Lane({ step, s }: { step: number; s: TowerStage }) {
  const live = s.out + s.ready > 0;
  const hot = s.outOverdue > 0 || s.readyIdle > 0;
  return (
    <div
      className="flex min-h-0 flex-col rounded-lg px-[0.55vw] py-[0.9vh]"
      style={{
        background: live ? C.panelLit : C.panel,
        borderTop: `4px solid ${hot ? C.alarm : live ? C.ink : C.rule}`,
      }}
    >
      <p style={{ color: C.muted, fontSize: fs.label }}>Stage {step}</p>
      <p className="leading-tight font-semibold" style={{ color: live ? C.ink : C.muted, fontSize: fs.name }}>
        {s.stage}
      </p>
      <p style={{ color: C.muted, fontSize: fs.label }}>
        Standard {dayTarget(s.outDays)} out · {dayTarget(s.waitDays)} wait
      </p>

      <div className="mt-auto flex flex-col gap-[0.9vh] pt-[0.6vh]">
        <Clocked
          label="Out"
          value={s.out}
          color={C.out}
          late={s.outOverdue}
          lateWord="overdue"
          oldest={s.outOldestDays}
        />
        <Clocked
          label="Ready"
          value={s.ready}
          color={C.ready}
          late={s.readyIdle}
          lateWord="idle"
          oldest={s.readyOldestDays}
          lateColor={C.warn}
        />
      </div>

      <div className="mt-[0.8vh] pt-[0.6vh]" style={{ borderTop: `1px solid ${C.rule}`, color: C.muted, fontSize: fs.label }}>
        <p>
          Today <span style={{ color: s.sentToday ? C.out : C.dim }}>↑{n(s.sentToday)}</span>{" "}
          <span style={{ color: s.receivedToday ? C.ready : C.dim }}>↓{n(s.receivedToday)}</span>
        </p>
        <p>
          {s.medianDays === null ? (
            <span style={{ color: C.dim }}>No turnaround yet</span>
          ) : (
            <>
              Median{" "}
              <span style={{ color: s.medianDays > s.outDays ? C.alarm : C.ink }}>{s.medianDays.toFixed(1)} d</span>
              <span style={{ color: C.dim }}> · 30 d</span>
            </>
          )}
        </p>
      </div>
    </div>
  );
}

function Clocked({
  label,
  value,
  color,
  late,
  lateWord,
  oldest,
  lateColor = C.alarm,
}: {
  label: string;
  value: number;
  color: string;
  late: number;
  lateWord: string;
  oldest: number | null;
  lateColor?: string;
}) {
  const on = value > 0;
  return (
    <div>
      <p className="font-semibold tracking-[0.14em] uppercase" style={{ color: on ? color : C.dim, fontSize: fs.label }}>
        {label}
      </p>
      <p className="leading-none font-semibold" style={{ color: on ? color : C.dim, fontSize: fs.big }}>
        {n(value)}
      </p>
      <p className="mt-[0.3vh] leading-tight" style={{ fontSize: fs.label, minHeight: "1.3em" }}>
        {late > 0 ? (
          <span className="rounded px-1 font-semibold" style={{ background: C.alarmSoft, color: lateColor }}>
            {n(late)} {lateWord} · {age(oldest ?? 0)}
          </span>
        ) : on && oldest !== null ? (
          <span style={{ color: C.muted }}>oldest {age(oldest)}</span>
        ) : null}
      </p>
    </div>
  );
}

function EndLane({ title, note, value, color, footer }: { title: string; note: string; value: number; color: string; footer?: string }) {
  const on = value > 0;
  return (
    <div className="flex min-h-0 flex-col rounded-lg px-[0.55vw] py-[0.9vh]" style={{ background: C.panel, borderTop: `4px solid ${on ? color : C.rule}` }}>
      <p className="leading-tight font-semibold" style={{ color: on ? C.ink : C.muted, fontSize: fs.name }}>
        {title}
      </p>
      <p style={{ color: C.muted, fontSize: fs.label }}>{note}</p>
      <p className="mt-auto leading-none font-semibold" style={{ color: on ? color : C.dim, fontSize: fs.big }}>
        {n(value)}
      </p>
      <p className="mt-[0.4vh]" style={{ color: footer ? C.info : C.dim, fontSize: fs.label, minHeight: "1.3em" }}>
        {footer ?? ""}
      </p>
    </div>
  );
}

function Panel({ title, aside, children }: { title: string; aside?: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-0 flex-col overflow-hidden rounded-lg px-[0.7vw] py-[0.9vh]" style={{ background: C.panel }}>
      <div className="mb-[0.6vh] flex items-baseline gap-2">
        <h2 className="font-semibold tracking-[0.1em] uppercase" style={{ fontSize: fs.small }}>
          {title}
        </h2>
        {aside && (
          <span className="ml-auto" style={{ color: C.muted, fontSize: fs.label }}>
            {aside}
          </span>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
    </div>
  );
}

function Alerts({ alerts }: { alerts: TowerSnapshot["alerts"] }) {
  if (alerts.length === 0) {
    return (
      <div className="flex h-full flex-col items-start justify-center gap-1">
        <p className="font-semibold" style={{ color: C.done, fontSize: fs.name }}>
          Everything within standard
        </p>
        <p style={{ color: C.muted, fontSize: fs.small }}>Nothing overdue, idle or damaged.</p>
      </div>
    );
  }
  const shown = alerts.slice(0, MAX_ALERTS);
  const tone = { critical: C.alarm, warning: C.warn, info: C.info } as const;
  return (
    <ul className="flex flex-col gap-[0.7vh]">
      {shown.map((a, i) => (
        <li key={i} className="flex gap-[0.5vw] rounded-md py-[0.4vh] pr-2" style={{ background: a.severity === "critical" ? C.alarmSoft : "transparent" }}>
          <span aria-hidden className="w-[4px] flex-none rounded-full" style={{ background: tone[a.severity] }} />
          <span className="min-w-0">
            <span className="block leading-tight font-semibold" style={{ color: a.severity === "info" ? C.ink : tone[a.severity], fontSize: fs.body }}>
              {a.title}
            </span>
            <span className="block leading-tight" style={{ color: C.muted, fontSize: fs.small }}>
              {a.detail}
            </span>
          </span>
        </li>
      ))}
      {alerts.length > shown.length && (
        <li style={{ color: C.muted, fontSize: fs.small }}>+ {alerts.length - shown.length} more</li>
      )}
    </ul>
  );
}

function Vendors({ vendors }: { vendors: TowerSnapshot["vendors"] }) {
  if (vendors.length === 0) {
    return <p style={{ color: C.muted, fontSize: fs.small }}>Nothing is out with anyone.</p>;
  }
  const shown = vendors.slice(0, MAX_VENDORS);
  return (
    <table className="w-full" style={{ fontSize: fs.body }}>
      <thead>
        <tr style={{ color: C.muted, fontSize: fs.label }} className="text-left tracking-[0.08em] uppercase">
          <th className="pb-[0.4vh] font-medium">Vendor</th>
          <th className="pb-[0.4vh] text-right font-medium">Holds</th>
          <th className="pb-[0.4vh] text-right font-medium">Oldest</th>
          <th className="pb-[0.4vh] text-right font-medium">Late</th>
        </tr>
      </thead>
      <tbody>
        {shown.map((v) => (
          <tr key={`${v.vendor}·${v.stage}`} style={{ borderTop: `1px solid ${C.rule}` }}>
            <td className="py-[0.5vh] pr-2">
              <span className="block truncate leading-tight font-semibold">{v.vendor}</span>
              <span className="block leading-tight" style={{ color: C.muted, fontSize: fs.label }}>
                {v.stage} · standard {dayTarget(v.targetDays)}
              </span>
            </td>
            <td className="py-[0.5vh] text-right font-semibold" style={{ color: C.out }}>
              {n(v.holding)}
            </td>
            <td className="py-[0.5vh] text-right" style={{ color: v.oldestDays > v.targetDays ? C.alarm : C.ink }}>
              {age(v.oldestDays)}
            </td>
            <td className="py-[0.5vh] text-right font-semibold" style={{ color: v.overdue > 0 ? C.alarm : C.dim }}>
              {v.overdue > 0 ? n(v.overdue) : "—"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Seven days of handovers, sent and received side by side, every bar labelled with its number. */
function Flow({ days }: { days: TowerSnapshot["days"] }) {
  const max = Math.max(1, ...days.flatMap((d) => [d.sent, d.received]));
  const W = 700;
  const H = 300;
  const top = 34;
  const base = H - 40;
  const slot = W / days.length;
  const bar = slot * 0.3;
  const y = (v: number) => base - (v / max) * (base - top);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Thaans sent and received per day over the last seven days">
      <line x1="0" x2={W} y1={base} y2={base} stroke={C.rule} strokeWidth="2" />
      {days.map((d, i) => {
        const cx = i * slot + slot / 2;
        const bars = [
          { v: d.sent, x: cx - bar - 3, color: C.out },
          { v: d.received, x: cx + 3, color: C.ready },
        ];
        return (
          <g key={d.label}>
            {d.today && <rect x={i * slot + 4} y={top - 30} width={slot - 8} height={base - top + 30} fill="#ffffff" opacity="0.04" rx="6" />}
            {bars.map((b, j) => (
              <g key={j}>
                <rect x={b.x} y={y(b.v)} width={bar} height={Math.max(0, base - y(b.v))} fill={b.v > 0 ? b.color : "transparent"} rx="3" />
                <text x={b.x + bar / 2} y={y(b.v) - 7} textAnchor="middle" fill={b.v > 0 ? b.color : C.dim} fontSize="21" fontWeight="600">
                  {b.v > 0 ? n(b.v) : "0"}
                </text>
              </g>
            ))}
            <text x={cx} y={H - 12} textAnchor="middle" fill={d.today ? C.ink : C.muted} fontSize="20" fontWeight={d.today ? 700 : 400}>
              {d.today ? "Today" : d.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Each bale as one bar across its life cycle: not sent, out, ready, finished — counts printed on the bar. */
function Bales({ bales }: { bales: TowerSnapshot["bales"] }) {
  const moving = bales.filter((b) => b.thaanCount > 0 && (b.buckets["Finished"] ?? 0) < b.thaanCount);
  if (moving.length === 0) {
    return <p style={{ color: C.muted, fontSize: fs.small }}>No bale is moving through the stages.</p>;
  }
  const shown = moving.slice(0, MAX_BALES);
  return (
    <ul className="flex flex-col gap-[1.1vh]">
      {shown.map((b) => {
        const out = Object.values(b.split).reduce((a, x) => a + x.out, 0);
        const ready = Object.values(b.split).reduce((a, x) => a + x.ready, 0);
        const notSent = b.buckets["Not started"] ?? 0;
        const done = b.buckets["Finished"] ?? 0;
        const parts = [
          { v: notSent, color: C.idle },
          { v: out, color: C.out },
          { v: ready, color: C.ready },
          { v: done, color: C.done },
        ];
        // The furthest stage any of its Thaans has reached.
        const furthest = [...STAGES].reverse().find((st) => (b.split[st]?.out ?? 0) + (b.split[st]?.ready ?? 0) > 0);
        return (
          <li key={b.baleId}>
            <div className="flex items-baseline gap-2" style={{ fontSize: fs.body }}>
              <span className="font-semibold">{b.baleCode}</span>
              <span style={{ color: C.muted }}>{b.baleType}</span>
              <span className="ml-auto" style={{ color: C.muted, fontSize: fs.small }}>
                {n(b.thaanCount)} Thaans{furthest ? ` · up to ${furthest}` : ""}
              </span>
            </div>
            <div className="mt-[0.4vh] flex h-[2.6vh] overflow-hidden rounded" style={{ background: C.rule }}>
              {parts.map((p, i) =>
                p.v > 0 ? (
                  <span
                    key={i}
                    className="flex items-center justify-center overflow-hidden font-semibold"
                    style={{ width: `${(p.v / b.thaanCount) * 100}%`, background: p.color, color: C.ground, fontSize: fs.small }}
                  >
                    {p.v / b.thaanCount > 0.08 ? n(p.v) : ""}
                  </span>
                ) : null,
              )}
            </div>
          </li>
        );
      })}
      {moving.length > shown.length && <li style={{ color: C.muted, fontSize: fs.small }}>+ {moving.length - shown.length} more bales</li>}
    </ul>
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

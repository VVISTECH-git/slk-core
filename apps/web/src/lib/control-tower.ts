import { sql } from "drizzle-orm";

import { loadBaleStageHeatmap, type BaleHeatmapRow } from "@/lib/bales";
import { db } from "@/lib/db";
import { STAGES, type Stage } from "@/lib/stages";

/**
 * The Control Tower: every Thaan's place in its life cycle, judged against
 * the operation's own turnaround standard (`stage_target`). One snapshot,
 * built from a handful of grouped queries — nothing here walks Thaans one by
 * one in JavaScript, so it stays cheap at a wall screen's once a minute
 * however many bales are in flight.
 *
 * Two clocks matter for a Thaan between cutting and the shelf:
 *   OUT    — sent for a stage and not back: measured from `sent_at`
 *            against the stage's out-days target.
 *   READY  — back from the stage before and not yet sent for this one:
 *            measured from the last `received_at` against the wait-days
 *            target. Idle cloth in the warehouse is the cheapest delay to
 *            fix and the easiest to miss, so it gets its own clock.
 * "Today" is the working day in India, whatever the server's clock says.
 */

/** Used when a stage has no row in `stage_target` yet. Days. */
export const DEFAULT_TARGETS: Record<Stage, { outDays: number; waitDays: number }> = {
  "Label Stitching": { outDays: 5, waitDays: 1 },
  Salava: { outDays: 3, waitDays: 1 },
  Karakkaya: { outDays: 3, waitDays: 1 },
  Print: { outDays: 7, waitDays: 1 },
  "Second Print": { outDays: 5, waitDays: 1 },
  Nellateeta: { outDays: 2, waitDays: 1 },
  Udukulu: { outDays: 2, waitDays: 1 },
  Ironing: { outDays: 2, waitDays: 1 },
};

export interface StageTargetRow {
  stage: Stage;
  outDays: number;
  waitDays: number;
  /** False when the stage is running on the default above, not a saved standard. */
  saved: boolean;
}

export async function loadStageTargets(): Promise<StageTargetRow[]> {
  const rows = await db.execute<{ stage: string; outDays: number; waitDays: number }>(sql`
    select stage, out_days::float8 as "outDays", wait_days::float8 as "waitDays" from stage_target
  `);
  const saved = new Map(rows.map((r) => [r.stage, r]));
  return STAGES.map((stage) => {
    const r = saved.get(stage);
    return r === undefined
      ? { stage, ...DEFAULT_TARGETS[stage], saved: false }
      : { stage, outDays: r.outDays, waitDays: r.waitDays, saved: true };
  });
}

export interface TowerStage {
  stage: Stage;
  outDays: number;
  waitDays: number;
  out: number;
  outOverdue: number;
  /** Days since the longest-out Thaan was sent; null when none is out. */
  outOldestDays: number | null;
  ready: number;
  readyIdle: number;
  readyOldestDays: number | null;
  sentToday: number;
  receivedToday: number;
  /** Median days from sent to received over the last 30 days; null with no receipts. */
  medianDays: number | null;
  receipts30: number;
}

export interface TowerVendor {
  vendor: string;
  stage: string;
  holding: number;
  overdue: number;
  oldestDays: number;
  targetDays: number;
}

export interface TowerAlert {
  severity: "critical" | "warning" | "info";
  title: string;
  detail: string;
}

export interface TowerDay {
  /** "Sat 27" */
  label: string;
  sent: number;
  received: number;
  today: boolean;
}

export interface TowerSnapshot {
  takenAt: string;
  totals: {
    thaans: number;
    notStarted: number;
    inPipeline: number;
    out: number;
    ready: number;
    finished: number;
    overdue: number;
    idle: number;
    sentToday: number;
    receivedToday: number;
    damagedOpen: number;
    readyForShelf: number;
  };
  stages: TowerStage[];
  vendors: TowerVendor[];
  alerts: TowerAlert[];
  days: TowerDay[];
  bales: BaleHeatmapRow[];
}

const STAGE_ARRAY = sql.raw(`ARRAY[${STAGES.map((s) => `'${s.replace(/'/g, "''")}'`).join(",")}]::text[]`);
const STAGE_ARRAY_NO_SECOND = sql.raw(
  `ARRAY[${STAGES.filter((s) => s !== "Second Print").map((s) => `'${s.replace(/'/g, "''")}'`).join(",")}]::text[]`,
);
const TODAY = sql`(now() at time zone 'Asia/Kolkata')::date`;
const ist = (col: ReturnType<typeof sql.raw>) => sql`(${col} at time zone 'Asia/Kolkata')::date`;

const n = (v: number) => v.toLocaleString("en-IN");
const days = (d: number) => (d < 1 ? `${Math.max(1, Math.round(d * 24))} h` : `${Math.floor(d)} d`);
const plural = (k: number, one: string, many = `${one}s`) => (k === 1 ? one : many);

export async function loadControlTower(): Promise<TowerSnapshot> {
  const targets = await loadStageTargets();
  const targetJson = JSON.stringify(targets.map((t) => ({ stage: t.stage, out_days: t.outDays, wait_days: t.waitDays })));

  /*
    One row per live Thaan with just what the clocks need: where it is out
    (and since when, and with whom), how many stages it has finished, when it
    last came back, and — from those — which stage it is ready for.
  */
  const base = sql`
    with tg as (
      select * from jsonb_to_recordset(${targetJson}::jsonb) as x(stage text, out_days float8, wait_days float8)
    ),
    t as (
      select
        th.id, th.bale_id, th.colourway_id, th.piece_id,
        (th.code is not null)                                         as has_code,
        oh.stage                                                      as open_stage,
        oh.vendor_id                                                  as open_vendor,
        oh.sent_at                                                    as open_sent,
        coalesce(d.n, 0)                                              as done_n,
        d.last_back,
        case when b.needs_second_print then ${STAGE_ARRAY} else ${STAGE_ARRAY_NO_SECOND} end as path
      from thaan th
      join bale b on b.id = th.bale_id
      left join handover oh on oh.thaan_id = th.id and oh.received_at is null
      left join (
        select thaan_id, count(*)::int as n, max(received_at) as last_back
        from handover where received_at is not null group by thaan_id
      ) d on d.thaan_id = th.id
      where th.voided_at is null
    ),
    s as (
      select t.*,
        case
          when not t.has_code or (t.open_stage is null and t.done_n = 0) then 'not_started'
          when t.open_stage is not null then 'out'
          when t.done_n >= cardinality(t.path) then 'finished'
          else 'ready'
        end as state,
        case when t.open_stage is null and t.done_n > 0 and t.done_n < cardinality(t.path) then t.path[t.done_n + 1] end as ready_stage
      from t
    )
  `;

  const [states, outGroups, readyGroups, today, medians, week, damage, shelf, needs, cutting, bales] = await Promise.all([
    db.execute<{ state: string; n: number }>(sql`${base} select state, count(*)::int as n from s group by state`),
    db.execute<{ stage: string; vendor: string; holding: number; overdue: number; oldest: number; target: number }>(sql`
      ${base}
      select s.open_stage as stage, coalesce(v.name, 'In-house') as vendor, count(*)::int as holding,
        count(*) filter (where extract(epoch from now() - s.open_sent) / 86400 > tg.out_days)::int as overdue,
        max(extract(epoch from now() - s.open_sent) / 86400)::float8 as oldest,
        max(tg.out_days)::float8 as target
      from s left join vendor v on v.id = s.open_vendor left join tg on tg.stage = s.open_stage
      where s.state = 'out'
      group by 1, 2
      order by overdue desc, oldest desc
    `),
    db.execute<{ stage: string; ready: number; idle: number; oldest: number }>(sql`
      ${base}
      select s.ready_stage as stage, count(*)::int as ready,
        count(*) filter (where extract(epoch from now() - s.last_back) / 86400 > tg.wait_days)::int as idle,
        max(extract(epoch from now() - s.last_back) / 86400)::float8 as oldest
      from s left join tg on tg.stage = s.ready_stage
      where s.state = 'ready'
      group by 1
    `),
    db.execute<{ stage: string; sent: number; received: number }>(sql`
      select stage,
        count(*) filter (where ${ist(sql.raw("sent_at"))} = ${TODAY})::int as sent,
        count(*) filter (where received_at is not null and ${ist(sql.raw("received_at"))} = ${TODAY})::int as received
      from handover
      where sent_at > now() - interval '2 days' or received_at > now() - interval '2 days'
      group by stage
    `),
    db.execute<{ stage: string; median: number; receipts: number }>(sql`
      select stage,
        percentile_cont(0.5) within group (order by extract(epoch from received_at - sent_at) / 86400)::float8 as median,
        count(*)::int as receipts
      from handover
      where received_at > now() - interval '30 days' and received_at >= sent_at
      group by stage
    `),
    db.execute<{ day: string; label: string; sent: number; received: number; today: boolean }>(sql`
      with d as (
        select generate_series(${TODAY} - 6, ${TODAY}, interval '1 day')::date as day
      )
      select d.day::text as day, to_char(d.day, 'Dy DD') as label,
        (select count(*)::int from handover h where ${ist(sql.raw("h.sent_at"))} = d.day) as sent,
        (select count(*)::int from handover h where h.received_at is not null and ${ist(sql.raw("h.received_at"))} = d.day) as received,
        d.day = ${TODAY} as today
      from d order by d.day
    `),
    db.execute<{ vendor: string; n: number }>(sql`
      select coalesce(v.name, 'In-house') as vendor, count(*)::int as n
      from thaan_damage td left join vendor v on v.id = td.vendor_id
      where td.addressed_at is null and td.written_off_at is null
      group by 1 order by 2 desc
    `),
    db.execute<{ n: number; records: number }>(sql`
      select count(*)::int as n, count(distinct t.colourway_id)::int as records
      from thaan t
      where t.voided_at is null and t.piece_id is null and t.colourway_id is not null
        and exists (
          select 1 from handover h where h.thaan_id = t.id and h.received_at is not null
            and (h.stage = 'Ironing' or h.through_stage = 'Ironing')
        )
    `),
    db.execute<{ n: number }>(sql`
      select count(distinct cw.id)::int as n
      from colourway cw join design d on d.id = cw.design_id
      where exists (select 1 from thaan t where t.colourway_id = cw.id and t.voided_at is null and t.piece_id is null)
        and (d.motif_id is null or d.craft_technique_id is null or d.fibre_type_id is null
             or coalesce(d.product_type_id, d.home_product_type_id) is null)
    `),
    db.execute<{ code: string; age: number }>(sql`
      select b.code, extract(epoch from now() - coalesce(b.bill_entry_date::timestamptz, b.created_at)) / 86400 as age
      from bale b
      where b.status = 'cutting_in_progress'
      order by b.code
    `),
    loadBaleStageHeatmap(),
  ]);

  const count = (state: string) => states.find((r) => r.state === state)?.n ?? 0;

  const stages: TowerStage[] = targets.map((t) => {
    const outs = outGroups.filter((g) => g.stage === t.stage);
    const ready = readyGroups.find((g) => g.stage === t.stage);
    const day = today.find((g) => g.stage === t.stage);
    const med = medians.find((g) => g.stage === t.stage);
    const out = outs.reduce((a, g) => a + g.holding, 0);
    return {
      stage: t.stage,
      outDays: t.outDays,
      waitDays: t.waitDays,
      out,
      outOverdue: outs.reduce((a, g) => a + g.overdue, 0),
      outOldestDays: out > 0 ? Math.max(...outs.map((g) => g.oldest)) : null,
      ready: ready?.ready ?? 0,
      readyIdle: ready?.idle ?? 0,
      readyOldestDays: ready !== undefined ? ready.oldest : null,
      sentToday: day?.sent ?? 0,
      receivedToday: day?.received ?? 0,
      medianDays: med?.median ?? null,
      receipts30: med?.receipts ?? 0,
    };
  });

  const vendors: TowerVendor[] = outGroups.map((g) => ({
    vendor: g.vendor,
    stage: g.stage,
    holding: g.holding,
    overdue: g.overdue,
    oldestDays: g.oldest,
    targetDays: g.target,
  }));

  // What someone should act on, most urgent first.
  const alerts: TowerAlert[] = [];
  for (const v of vendors) {
    if (v.overdue === 0) continue;
    alerts.push({
      severity: "critical",
      title: `${n(v.overdue)} overdue at ${v.vendor}`,
      detail: `${v.stage} · out ${days(v.oldestDays)} · target ${v.targetDays} d`,
    });
  }
  for (const s of stages) {
    if (s.readyIdle === 0) continue;
    alerts.push({
      severity: "warning",
      title: `${n(s.readyIdle)} idle, ready for ${s.stage}`,
      detail: `Waiting in the warehouse ${days(s.readyOldestDays ?? 0)} · target ${s.waitDays} d`,
    });
  }
  for (const d of damage) {
    alerts.push({
      severity: "warning",
      title: `${n(d.n)} flagged damaged · ${d.vendor}`,
      detail: "Not yet addressed or written off",
    });
  }
  const shelfRow = shelf[0];
  if (shelfRow !== undefined && shelfRow.n > 0) {
    alerts.push({
      severity: "info",
      title: `${n(shelfRow.n)} back from Ironing, not on a shelf`,
      detail: `${shelfRow.records} ${plural(shelfRow.records, "record")} ready for Put on the shelf`,
    });
  }
  const needRow = needs[0];
  if (needRow !== undefined && needRow.n > 0) {
    alerts.push({
      severity: "info",
      title: `${n(needRow.n)} ${plural(needRow.n, "record")} missing details`,
      detail: "Fibre, product type, craft or motif — needed before the shelf",
    });
  }
  for (const c of cutting) {
    if (c.age < 3) continue;
    alerts.push({
      severity: "info",
      title: `Bale ${c.code} cutting still open`,
      detail: `${days(c.age)} since bill entry — close it once every Thaan is cut`,
    });
  }

  const out = stages.reduce((a, s) => a + s.out, 0);
  const ready = stages.reduce((a, s) => a + s.ready, 0);

  return {
    takenAt: new Date().toISOString(),
    totals: {
      thaans: states.reduce((a, r) => a + r.n, 0),
      notStarted: count("not_started"),
      inPipeline: out + ready,
      out,
      ready,
      finished: count("finished"),
      overdue: stages.reduce((a, s) => a + s.outOverdue, 0),
      idle: stages.reduce((a, s) => a + s.readyIdle, 0),
      sentToday: today.reduce((a, r) => a + r.sent, 0),
      receivedToday: today.reduce((a, r) => a + r.received, 0),
      damagedOpen: damage.reduce((a, r) => a + r.n, 0),
      readyForShelf: shelfRow?.n ?? 0,
    },
    stages,
    vendors,
    alerts,
    days: week.map((d) => ({ label: d.label, sent: d.sent, received: d.received, today: d.today })),
    bales,
  };
}

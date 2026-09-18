import { sql } from "drizzle-orm";
import QRCode from "qrcode";

import { db } from "@/lib/db";
import { STAGES, stagesFor } from "@/lib/stages";

/**
 * Thaans — what a bale becomes once it's cut. See
 * `packages/db/src/schema/production.ts` for why this isn't called `piece`.
 */
export type ThaanRow = {
  id: string;
  code: string | null;
  baleId: string;
  baleCode: string;
  supplierName: string;
  itemName: string;
  /** Cascaded from the bale — the same "Sarees, Fabric, Chunnies..." set. */
  baleType: string;
  billEntryDate: string;
  /** Metres received ÷ Thaans cut from that bale — this Thaan's own share. */
  perThaanMetres: number | null;
  qrGeneratedAt: string | null;
  qrGeneratedByName: string | null;
  createdAt: string;
  voidedAt: string | null;
  voidedByName: string | null;
  /**
   * Where this Thaan actually is right now, in plain terms — computed
   * against the whole pipeline, not just Label Stitching: no code yet
   * ("QR Pending"), coded but nothing sent for its first stage yet — can
   * happen with no vendor doing Label Stitching ("QR Generated"), out for
   * whichever stage currently has it ("Out for Salava"), back from one
   * stage and waiting to be sent for the next ("Ready for Karakkaya"), or
   * through every stage ("Finished").
   */
  pipelineStatus: string;
};

export async function loadThaans(): Promise<ThaanRow[]> {
  const rows = await db.execute<
    Omit<ThaanRow, "pipelineStatus"> & {
      openStage: string | null;
      completedStages: number;
      needsSecondPrint: boolean;
    }
  >(sql`
    select
      t.id,
      t.code,
      t.bale_id                                              as "baleId",
      b.code                                                 as "baleCode",
      s.name                                                  as "supplierName",
      i.name                                                  as "itemName",
      b.type                                                  as "baleType",
      to_char(b.bill_entry_date, 'DD Mon YYYY')              as "billEntryDate",
      round(b.metres_received / count(*) over (partition by t.bale_id), 2)::double precision
                                                               as "perThaanMetres",
      to_char(t.qr_generated_at, 'DD Mon YYYY, HH12:MI AM')  as "qrGeneratedAt",
      qr_by.name                                              as "qrGeneratedByName",
      to_char(t.created_at, 'DD Mon YYYY')                   as "createdAt",
      to_char(t.voided_at, 'DD Mon YYYY, HH12:MI AM')        as "voidedAt",
      void_by.name                                            as "voidedByName",
      open_h.stage                                            as "openStage",
      coalesce(done.n, 0)::int                                as "completedStages",
      b.needs_second_print                                    as "needsSecondPrint"
    from thaan t
    join bale b on b.id = t.bale_id
    join supplier s on s.id = b.supplier_id
    join cloth_item i on i.id = b.item_id
    left join actor qr_by on qr_by.id = t.qr_generated_by_id
    left join actor void_by on void_by.id = t.voided_by_id
    left join handover open_h on open_h.thaan_id = t.id and open_h.received_at is null
    left join (
      select thaan_id, count(*)::int as n from handover where received_at is not null group by thaan_id
    ) done on done.thaan_id = t.id
    order by t.created_at desc, t.code
  `);

  return rows.map(({ openStage, completedStages, needsSecondPrint, ...row }) => ({
    ...row,
    pipelineStatus: pipelineStatus(row.code, openStage, completedStages, needsSecondPrint),
  }));
}

/**
 * One Thaan's full row, by its own code — what scanning a printed label
 * hands back. Same shape and same query `loadThaans` uses, just narrowed to
 * one `t.code =` instead of every row, so a scan-to-inspect lookup doesn't
 * duplicate the join.
 */
export async function loadThaanByCode(code: string): Promise<ThaanRow | null> {
  const rows = await db.execute<
    Omit<ThaanRow, "pipelineStatus"> & {
      openStage: string | null;
      completedStages: number;
      needsSecondPrint: boolean;
    }
  >(sql`
    select
      t.id,
      t.code,
      t.bale_id                                              as "baleId",
      b.code                                                 as "baleCode",
      s.name                                                  as "supplierName",
      i.name                                                  as "itemName",
      b.type                                                  as "baleType",
      to_char(b.bill_entry_date, 'DD Mon YYYY')              as "billEntryDate",
      round(b.metres_received / count(*) over (partition by t.bale_id), 2)::double precision
                                                               as "perThaanMetres",
      to_char(t.qr_generated_at, 'DD Mon YYYY, HH12:MI AM')  as "qrGeneratedAt",
      qr_by.name                                              as "qrGeneratedByName",
      to_char(t.created_at, 'DD Mon YYYY')                   as "createdAt",
      to_char(t.voided_at, 'DD Mon YYYY, HH12:MI AM')        as "voidedAt",
      void_by.name                                            as "voidedByName",
      open_h.stage                                            as "openStage",
      coalesce(done.n, 0)::int                                as "completedStages",
      b.needs_second_print                                    as "needsSecondPrint"
    from thaan t
    join bale b on b.id = t.bale_id
    join supplier s on s.id = b.supplier_id
    join cloth_item i on i.id = b.item_id
    left join actor qr_by on qr_by.id = t.qr_generated_by_id
    left join actor void_by on void_by.id = t.voided_by_id
    left join handover open_h on open_h.thaan_id = t.id and open_h.received_at is null
    left join (
      select thaan_id, count(*)::int as n from handover where received_at is not null group by thaan_id
    ) done on done.thaan_id = t.id
    where t.code = ${code}
  `);

  const [row] = rows;
  if (row === undefined) return null;

  const { openStage, completedStages, needsSecondPrint, ...rest } = row;
  return { ...rest, pipelineStatus: pipelineStatus(rest.code, openStage, completedStages, needsSecondPrint) };
}

function pipelineStatus(
  code: string | null,
  openStage: string | null,
  completedStages: number,
  needsSecondPrint: boolean,
): string {
  if (code === null) return "QR Pending";
  if (openStage !== null) return `Out for ${openStage}`;
  if (completedStages === 0) return "QR Generated";
  const stages = stagesFor(needsSecondPrint);
  if (completedStages >= stages.length) return "Finished";
  return `Ready for ${stages[completedStages]}`;
}

export type StageFunnelRow = { stage: string; completed: number };

/**
 * How many Thaans have finished each stage, in pipeline order — not still
 * out for it, not merely started, actually handed back and confirmed. Every
 * Thaan must clear stage N before stage N+1 can open (see `lib/stages.ts`),
 * so "completed Ironing" already means "finished the whole pipeline" —
 * there is no separate "Finished" count to compute.
 *
 * Counted straight from `handover`, not derived from `loadThaans`' own
 * per-row `pipelineStatus`: that reads one Thaan's current stage, this
 * reads how many ever cleared each one, which needs every row's history,
 * not just its latest.
 */
export async function loadStageFunnel(): Promise<{ eligible: number; stages: StageFunnelRow[] }> {
  const [{ eligible }] = await db.execute<{ eligible: number }>(sql`
    select count(*)::int as "eligible" from thaan where code is not null and voided_at is null
  `);

  const rows = await db.execute<{ stage: string; completed: number }>(sql`
    select h.stage, count(distinct h.thaan_id)::int as "completed"
    from handover h
    join thaan t on t.id = h.thaan_id
    where h.received_at is not null and t.voided_at is null
    group by h.stage
  `);

  const byStage = new Map(rows.map((r) => [r.stage, r.completed]));
  const stages = STAGES.map((stage) => ({ stage, completed: byStage.get(stage) ?? 0 }));

  return { eligible, stages };
}

/**
 * Every non-voided Thaan, bucketed by where it currently sits — "Not
 * started", each of `STAGES`, or "Finished" — with who's holding it (if
 * anyone) and since when, so a bucket with hundreds of Thaans in it is
 * still answerable at a glance: which vendor, which bale, how long. Bucket
 * logic mirrors `loadBaleStageHeatmap` (`lib/bales.ts`) exactly — that
 * function's own comment explains why "Out for X" and "X done, not yet
 * sent on" share one "X" bucket — just without grouping by bale, since the
 * two callers below want a whole-pipeline view, not a per-bale one. Kept as
 * its own copy rather than sharing code across the two files: the
 * duplication is small, stable, and load-bearing for staying in sync
 * (`stagesFor`'s per-bale conditional stage list is the one part worth not
 * silently drifting on) — if you change the bucket rule here, change it
 * there too.
 *
 * `sinceAt` is whichever event actually put the Thaan in this bucket: the
 * open handover's `sentAt` if it's out for a stage, else the most recent
 * completed handover's `receivedAt` if it's waiting to be sent for the
 * next one, else the bale's own `billEntryDate` if it hasn't started —
 * "how long has this actually been sitting here", not a proxy for it.
 */
async function loadThaanBuckets(
  baleType?: string,
): Promise<
  { thaanId: string; baleCode: string; baleType: string; bucket: string; vendorName: string | null; sinceAt: string | Date | null }[]
> {
  const bales = await db.execute<{
    id: string;
    needsSecondPrint: boolean;
    code: string;
    billEntryDate: string | Date;
    type: string;
  }>(sql`
    select id, needs_second_print as "needsSecondPrint", code, bill_entry_date as "billEntryDate", type from bale
  `);
  const balesById = new Map(bales.map((b) => [b.id, b]));

  const thaanRows = await db.execute<{
    thaanId: string;
    baleId: string;
    hasCode: boolean;
    openStage: string | null;
    openSentAt: string | Date | null;
    openVendorName: string | null;
    completedCount: number;
    lastReceivedAt: string | Date | null;
  }>(sql`
    select
      t.id as "thaanId",
      t.bale_id as "baleId",
      (t.code is not null) as "hasCode",
      open_h.stage as "openStage",
      open_h.sent_at as "openSentAt",
      ov.name as "openVendorName",
      coalesce(done.n, 0)::int as "completedCount",
      done.last_received_at as "lastReceivedAt"
    from thaan t
    left join handover open_h on open_h.thaan_id = t.id and open_h.received_at is null
    left join vendor ov on ov.id = open_h.vendor_id
    left join (
      select thaan_id, count(*)::int as n, max(received_at) as last_received_at
      from handover where received_at is not null group by thaan_id
    ) done on done.thaan_id = t.id
    where t.voided_at is null
  `);

  return thaanRows
    .filter((row) => baleType === undefined || balesById.get(row.baleId)?.type === baleType)
    .map((row) => {
      const bale = balesById.get(row.baleId);
      const stages = stagesFor(bale?.needsSecondPrint ?? true);

      let bucket: string;
      if (!row.hasCode || (row.openStage === null && row.completedCount === 0)) bucket = "Not started";
      else if (row.openStage !== null) bucket = row.openStage;
      else if (row.completedCount >= stages.length) bucket = "Finished";
      else bucket = stages[row.completedCount] ?? "Finished";

      const sinceAt = row.openStage !== null ? row.openSentAt : row.completedCount > 0 ? row.lastReceivedAt : (bale?.billEntryDate ?? null);

      return {
        thaanId: row.thaanId,
        baleCode: bale?.code ?? "—",
        baleType: bale?.type ?? "—",
        bucket,
        vendorName: row.openStage !== null ? row.openVendorName : null,
        sinceAt,
      };
    });
}

/** "13 Sep 2026" — matches the "DD Mon YYYY" convention every other date in this API is already formatted as (see `to_char(..., 'DD Mon YYYY')` elsewhere in this file), for a value that started as a raw Date/string rather than SQL. */
function formatDate(value: string | Date | null): string | null {
  if (value === null) return null;
  const d = value instanceof Date ? value : new Date(value);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

/** Whole days between `value` and now — the actual backlog signal; a date alone still makes the reader do the subtraction. */
function daysSince(value: string | Date | null): number | null {
  if (value === null) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24)));
}

function earlier(a: string | Date | null, b: string | Date | null): string | Date | null {
  if (a === null) return b;
  if (b === null) return a;
  return a < b ? a : b;
}

export type StageSummaryRow = {
  bucket: string;
  count: number;
  /** How long the oldest Thaan in this bucket has been sitting there — null when the bucket is empty. How backlogged it is, not just how big. */
  oldestDaysWaiting: number | null;
  oldestSince: string | null;
};

/**
 * How many Thaans currently sit at each point in the pipeline, across the
 * whole business, and how long the oldest one there has been waiting —
 * Production Manager and Operations Manager's own landing view, not one
 * bale's own breakdown (that's the Dashboard's heatmap). A count alone
 * doesn't say anything at real volume — "340 at Salava" is meaningless
 * without knowing whether that's a healthy pipeline or a three-week
 * backlog; `oldestDaysWaiting` is what turns the count into a signal.
 *
 * `baleType` narrows to one of `bale.type`'s five values ("Sarees",
 * "Fabric", "Chunnies", "Bedsheets", "Pillows") — the same breakdown, scoped
 * to what `loadTypeSummary`'s own drill-down needs: whether a type that's
 * mostly Finished still has anything left in the pipeline behind it, not
 * just its overall completion.
 */
export async function loadStageSummary(baleType?: string): Promise<StageSummaryRow[]> {
  const buckets = await loadThaanBuckets(baleType);

  const totals = new Map<string, number>();
  const oldest = new Map<string, string | Date>();
  for (const b of buckets) {
    totals.set(b.bucket, (totals.get(b.bucket) ?? 0) + 1);
    const older = earlier(oldest.get(b.bucket) ?? null, b.sinceAt);
    if (older !== null) oldest.set(b.bucket, older);
  }

  const columns = ["Not started", ...STAGES, "Finished"];
  return columns.map((bucket) => {
    const since = oldest.get(bucket) ?? null;
    return { bucket, count: totals.get(bucket) ?? 0, oldestDaysWaiting: daysSince(since), oldestSince: formatDate(since) };
  });
}

export type StageGroupRow = {
  baleCode: string;
  /** Who currently has it, if this bucket means "out for" that stage — null for every other bucket. */
  vendorName: string | null;
  count: number;
  /** How long the oldest Thaan in this group has been sitting there — oldest-first is the drill-down's default order. */
  daysWaiting: number | null;
  since: string | null;
};

/**
 * One bucket's Thaans, grouped by vendor and bale rather than listed one by
 * one — a stage with hundreds of Thaans in it is a hundred rows of "T00001,
 * T00002, T00003…" that answers nothing; grouped and sorted oldest-first,
 * the same list answers "who's holding what, and what's been stuck
 * longest" in a screenful. The stage summary's drill-down. `baleType` — see
 * `loadStageSummary`'s own comment — narrows to one bale type.
 */
export async function loadThaansInBucket(bucket: string, baleType?: string): Promise<StageGroupRow[]> {
  const buckets = (await loadThaanBuckets(baleType)).filter((b) => b.bucket === bucket);

  const groups = new Map<string, { baleCode: string; vendorName: string | null; count: number; sinceAt: string | Date | null }>();
  for (const b of buckets) {
    const key = `${b.vendorName ?? ""}::${b.baleCode}`;
    const group = groups.get(key) ?? { baleCode: b.baleCode, vendorName: b.vendorName, count: 0, sinceAt: null };
    group.count += 1;
    group.sinceAt = earlier(group.sinceAt, b.sinceAt);
    groups.set(key, group);
  }

  return [...groups.values()]
    .sort((a, b) => {
      if (a.sinceAt === null) return b.sinceAt === null ? 0 : 1;
      if (b.sinceAt === null) return -1;
      return a.sinceAt < b.sinceAt ? -1 : a.sinceAt > b.sinceAt ? 1 : 0;
    })
    .map((g) => ({
      baleCode: g.baleCode,
      vendorName: g.vendorName,
      count: g.count,
      daysWaiting: daysSince(g.sinceAt),
      since: formatDate(g.sinceAt),
    }));
}

/** `bale.type`'s own fixed set — see `bale_type_known` in `packages/db/src/schema/production.ts`. */
const BALE_TYPES = ["Sarees", "Fabric", "Chunnies", "Bedsheets", "Pillows"];

export type TypeSummaryRow = {
  type: string;
  total: number;
  finished: number;
};

/**
 * Every bale type's own completion — how many of its Thaans are Finished
 * against how many exist at all. Not what "time to reorder raw cloth of
 * this type" means by itself (that's a judgement call, made by whoever
 * reads this, about their own lead times and buffer) — but the one number
 * that actually answers it: a type sitting at 95% Finished with nothing
 * left behind it isn't "doing well", it's about to run out of stock to
 * cut. `loadStageSummary(type)` is this same type's own full pipeline
 * breakdown, for seeing exactly where that last 5% still sits.
 *
 * Types with zero Thaans on file are left out — nothing to reorder against
 * yet, and a 0/0 row answers nothing.
 */
export async function loadTypeSummary(): Promise<TypeSummaryRow[]> {
  const buckets = await loadThaanBuckets();

  const totals = new Map<string, number>();
  const finished = new Map<string, number>();
  for (const b of buckets) {
    totals.set(b.baleType, (totals.get(b.baleType) ?? 0) + 1);
    if (b.bucket === "Finished") finished.set(b.baleType, (finished.get(b.baleType) ?? 0) + 1);
  }

  return BALE_TYPES.map((type) => ({ type, total: totals.get(type) ?? 0, finished: finished.get(type) ?? 0 })).filter(
    (r) => r.total > 0,
  );
}

/**
 * A QR code as an SVG data URI, generated server-side — same reasoning as
 * the catalogue's own `qr()` in `lib/pieces.ts`: these get printed, and a
 * printer should be given something that scales rather than a bitmap.
 */
async function qr(text: string): Promise<string> {
  const svg = await QRCode.toString(text, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 0,
    width: 160,
  });

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export interface ThaanPrintRow {
  id: string;
  code: string;
  qr: string;
}

export interface ThaanPrintBatch {
  baleCode: string;
  rows: ThaanPrintRow[];
}

/**
 * The Thaans from one bale that already have a code — what "Print QR codes"
 * hands to the printer. `onlyThaanId` narrows it to a single reprint, from
 * a Thaan row's own "Print QR code" action.
 */
export async function loadThaanPrintBatch(baleId: string, onlyThaanId?: string): Promise<ThaanPrintBatch> {
  const [bale] = await db.execute<{ code: string }>(sql`
    select code from bale where id = ${baleId}
  `);

  const thaans = await db.execute<{ id: string; code: string }>(
    onlyThaanId === undefined
      ? sql`
          select id, code from thaan
          where bale_id = ${baleId} and code is not null
          order by code
        `
      : sql`
          select id, code from thaan
          where bale_id = ${baleId} and code is not null and id = ${onlyThaanId}
          order by code
        `,
  );

  const rows = await Promise.all(
    thaans.map(async (t) => ({ id: t.id, code: t.code, qr: await qr(t.code) })),
  );

  return { baleCode: bale?.code ?? "", rows };
}

/**
 * A bale's coded Thaans, code only — no QR image. What mobile's own
 * "Print QR Labels" wants: it renders each QR itself, from the code, with
 * `pw.BarcodeWidget`, so `loadThaanPrintBatch`'s own per-row `qr()` call
 * (a real SVG render, not free — 60 of them for a bale that size) would be
 * pure waste here, generated only to be thrown away unread.
 */
export async function loadThaanCodesForBale(baleId: string): Promise<{ baleCode: string; codes: string[] }> {
  const [bale] = await db.execute<{ code: string }>(sql`
    select code from bale where id = ${baleId}
  `);

  const thaans = await db.execute<{ code: string }>(sql`
    select code from thaan
    where bale_id = ${baleId} and code is not null
    order by code
  `);

  return { baleCode: bale?.code ?? "", codes: thaans.map((t) => t.code) };
}

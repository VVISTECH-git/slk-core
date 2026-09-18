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

import { sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { isPileStage } from "@/lib/piles";

/**
 * The two pile writes that run inside someone else's transaction — the
 * receive that closes handovers makes and fills piles in the same
 * transaction, so a pile can never exist without the receive that created
 * it having happened. Kept out of the `"use server"` file on purpose: a
 * function exported from there becomes a callable endpoint, and one that
 * takes a transaction handle must not be.
 */

/** The transaction handle `db.transaction` hands its callback — the one type both paths share. */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface NewPile {
  name: string;
  mainColourId: string | null;
  /** An R2 key from `presignPilePhoto`, if the photo was taken before the pile was made. */
  photoKey: string | null;
}

/**
 * Makes a pile inside `tx`. Shared with `receiveBatch`, which makes piles
 * as part of the same transaction that closes the handovers, so a pile can
 * never exist without the receive that created it having happened.
 */
export async function createPileInTx(
  tx: Tx,
  draft: NewPile,
  stage: string,
  actorId: string | null,
): Promise<{ ok: true; id: string; code: string } | { ok: false; message: string }> {
  const name = draft.name.trim();
  if (name === "") return { ok: false, message: "Give the pile a name." };
  if (!isPileStage(stage)) return { ok: false, message: `Piles start at Print — not at ${stage}.` };

  if (draft.mainColourId !== null) {
    const [c] = await tx.execute<{ id: string }>(sql`
      select lv.id from lookup_value lv join lookup_list ll on ll.id = lv.list_id
      where lv.id = ${draft.mainColourId} and ll.code = 'colour' and lv.status = 'active'
    `);
    if (c === undefined) return { ok: false, message: "That colour is no longer on the list." };
  }

  const [row] = await tx.execute<{ id: string; code: string }>(sql`
    insert into pile (code, name, photo_key, main_colour_id, created_stage, created_by_id)
    values ('P' || nextval('pile_code_seq'), ${name}, ${draft.photoKey}, ${draft.mainColourId}, ${stage}, ${actorId})
    returning id, code
  `);
  await tx.execute(sql`
    insert into pile_event (pile_id, stage, kind, actor_id, detail, at)
    values (${row.id}, ${stage}, 'created', ${actorId}, ${JSON.stringify({ name })}::jsonb, clock_timestamp())
  `);
  return { ok: true, id: row.id, code: row.code };
}

export interface AssignOutcome {
  added: number;
  moved: number;
  /** Thaan codes that couldn't go in, each with why. */
  refused: { code: string; why: string }[];
}

/**
 * Puts Thaans in a pile, inside `tx`. A Thaan already in another pile is
 * moved (and the move recorded, with where it came from). Refused: a Thaan
 * that hasn't come back from Print yet — piles are about what's printed on
 * the cloth, which nobody knows before then — and a voided one.
 */
export async function assignThaansInTx(
  tx: Tx,
  pileId: string,
  thaanIds: string[],
  stage: string | null,
  actorId: string | null,
): Promise<AssignOutcome> {
  const out: AssignOutcome = { added: 0, moved: 0, refused: [] };

  for (const thaanId of thaanIds) {
    const [t] = await tx.execute<{
      code: string | null;
      voided: boolean;
      printed: boolean;
      pileId: string | null;
      pileCode: string | null;
    }>(sql`
      select
        t.code,
        (t.voided_at is not null) as "voided",
        exists (
          select 1 from handover h where h.thaan_id = t.id and h.received_at is not null
            and (h.stage = 'Print' or h.through_stage in ('Print', 'Second Print', 'Nellateeta', 'Udukulu', 'Ironing'))
        ) as "printed",
        t.pile_id as "pileId",
        p.code    as "pileCode"
      from thaan t left join pile p on p.id = t.pile_id
      where t.id = ${thaanId}
    `);
    const code = t?.code ?? thaanId;
    if (t === undefined) { out.refused.push({ code, why: "not found" }); continue; }
    if (t.voided) { out.refused.push({ code, why: "voided" }); continue; }
    if (!t.printed) { out.refused.push({ code, why: "not back from Print yet" }); continue; }
    if (t.pileId === pileId) continue; // already here — nothing to record

    await tx.execute(sql`update thaan set pile_id = ${pileId}, updated_at = now() where id = ${thaanId}`);
    if (t.pileId === null) {
      out.added++;
      await tx.execute(sql`
        insert into pile_event (pile_id, thaan_id, stage, kind, actor_id, at)
        values (${pileId}, ${thaanId}, ${stage}, 'added', ${actorId}, clock_timestamp())
      `);
    } else {
      out.moved++;
      await tx.execute(sql`
        insert into pile_event (pile_id, thaan_id, stage, kind, actor_id, detail, at)
        values (${pileId}, ${thaanId}, ${stage}, 'moved', ${actorId}, ${JSON.stringify({ from: t.pileCode })}::jsonb, clock_timestamp())
      `);
    }
  }
  return out;
}


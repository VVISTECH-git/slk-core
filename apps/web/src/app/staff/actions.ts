"use server";

import { and, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { actor, actorToken } from "@slk/db";
import { hashSecret, pinProblem } from "@slk/domain";

import { isRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { guard } from "@/lib/session";

/**
 * Managing who can sign in.
 *
 * Owner-only throughout, and the guard is on every one of them rather than on
 * the screen: a Server Action is a POST to an endpoint whose id is embedded in
 * a page, and "the sidebar did not show the link" has never been a check.
 *
 * PIN rules come from `pinProblem` in @slk/domain, the same function
 * `pnpm db:actor` calls. Two copies of "what counts as a usable PIN" is how
 * one caller ends up accepting 123456 while the other refuses it.
 */

export interface Result {
  ok: boolean;
  message: string;
}

/** Codes are typed on a phone by someone holding a saree. Keep them plain. */
function cleanCode(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, "");
}

function done(): void {
  revalidatePath("/staff");
}

export async function createStaff(
  code: string,
  name: string,
  role: string,
  pin: string,
): Promise<Result> {
  const denied = await guard("owner");
  if (denied !== null) return denied;

  const wantedCode = cleanCode(code);
  const wantedName = name.trim();

  if (wantedCode === "") return { ok: false, message: "A code is needed." };
  if (wantedName === "") return { ok: false, message: "A name is needed." };
  if (!isRole(role)) return { ok: false, message: "Unknown role." };

  const problem = pinProblem(pin);
  if (problem !== null) return { ok: false, message: problem };

  const [clash] = await db
    .select({ code: actor.code })
    .from(actor)
    .where(eq(actor.code, wantedCode));

  if (clash !== undefined) {
    return { ok: false, message: `"${wantedCode}" is already taken.` };
  }

  await db.insert(actor).values({
    code: wantedCode,
    name: wantedName,
    role,
    secretHash: await hashSecret(pin),
  });

  done();

  return { ok: true, message: `Added ${wantedName} as ${wantedCode}.` };
}

export async function setPin(actorId: string, pin: string): Promise<Result> {
  const denied = await guard("owner");
  if (denied !== null) return denied;

  const problem = pinProblem(pin);
  if (problem !== null) return { ok: false, message: problem };

  const [who] = await db
    .select({ name: actor.name })
    .from(actor)
    .where(eq(actor.id, actorId));

  if (who === undefined) return { ok: false, message: "No such person." };

  await db
    .update(actor)
    .set({ secretHash: await hashSecret(pin), updatedAt: new Date() })
    .where(eq(actor.id, actorId));

  /*
    Every existing sign-in is revoked.

    A new PIN is set because the old one is not trusted — forgotten, seen over
    a shoulder, or the handset is gone. Leaving thirty-day tokens alive would
    mean whoever prompted the change keeps their way in, which is the one thing
    setting a new PIN is meant to stop.
  */
  const out = await db
    .update(actorToken)
    .set({ revokedAt: new Date() })
    .where(and(eq(actorToken.actorId, actorId), isNull(actorToken.revokedAt)))
    .returning({ id: actorToken.id });

  done();

  return {
    ok: true,
    message:
      out.length === 0
        ? `New PIN set for ${who.name}.`
        : `New PIN set for ${who.name}. ${out.length} sign-in${out.length === 1 ? "" : "s"} ended.`,
  };
}

export async function setRole(actorId: string, role: string): Promise<Result> {
  const denied = await guard("owner");
  if (denied !== null) return denied;

  if (!isRole(role)) return { ok: false, message: "Unknown role." };

  const [who] = await db
    .select({ name: actor.name, role: actor.role })
    .from(actor)
    .where(eq(actor.id, actorId));

  if (who === undefined) return { ok: false, message: "No such person." };

  // The last owner cannot demote themselves out of existence: nobody would be
  // able to manage accounts, and the only way back would be db:actor over SSH.
  if (who.role === "owner" && role !== "owner") {
    const refusal = await lastOwnerCheck(actorId);
    if (refusal !== null) return refusal;
  }

  await db
    .update(actor)
    .set({ role, updatedAt: new Date() })
    .where(eq(actor.id, actorId));

  done();

  return { ok: true, message: `${who.name} is now ${role}.` };
}

export async function setActive(
  actorId: string,
  isActive: boolean,
): Promise<Result> {
  const denied = await guard("owner");
  if (denied !== null) return denied;

  const [who] = await db
    .select({ name: actor.name, role: actor.role })
    .from(actor)
    .where(eq(actor.id, actorId));

  if (who === undefined) return { ok: false, message: "No such person." };

  if (!isActive && who.role === "owner") {
    const refusal = await lastOwnerCheck(actorId);
    if (refusal !== null) return refusal;
  }

  await db
    .update(actor)
    .set({ isActive, updatedAt: new Date() })
    .where(eq(actor.id, actorId));

  /*
    Deactivating ends every session. Otherwise the account is switched off and
    the phone in their pocket keeps working for another month — `actorFor`
    checks `is_active`, but only when the token is next used, and the point of
    switching someone off is that it takes effect now.
  */
  if (!isActive) {
    await db
      .update(actorToken)
      .set({ revokedAt: new Date() })
      .where(and(eq(actorToken.actorId, actorId), isNull(actorToken.revokedAt)));
  }

  done();

  return {
    ok: true,
    message: isActive
      ? `${who.name} can sign in again.`
      : `${who.name} is switched off and signed out everywhere.`,
  };
}

/**
 * Sign one person out of everything.
 *
 * For the handset left in an auto-rickshaw, when the account itself is fine.
 * Revoked rather than deleted, so the revocation is itself auditable.
 */
export async function revokeSessions(actorId: string): Promise<Result> {
  const denied = await guard("owner");
  if (denied !== null) return denied;

  const [who] = await db
    .select({ name: actor.name })
    .from(actor)
    .where(eq(actor.id, actorId));

  if (who === undefined) return { ok: false, message: "No such person." };

  const out = await db
    .update(actorToken)
    .set({ revokedAt: new Date() })
    .where(and(eq(actorToken.actorId, actorId), isNull(actorToken.revokedAt)))
    .returning({ id: actorToken.id });

  done();

  return {
    ok: true,
    message:
      out.length === 0
        ? `${who.name} was not signed in anywhere.`
        : `Signed ${who.name} out of ${out.length} device${out.length === 1 ? "" : "s"}.`,
  };
}

/** Refuses when this is the only owner left who can still sign in. */
async function lastOwnerCheck(actorId: string): Promise<Result | null> {
  const [{ others }] = await db.execute<{ others: number }>(sql`
    select count(*)::int as others from actor
    where role = 'owner' and is_active and secret_hash is not null
      and id <> ${actorId}
  `);

  return others > 0
    ? null
    : {
        ok: false,
        message:
          "That is the last owner who can sign in. Make somebody else an owner first.",
      };
}

import { sql } from "drizzle-orm";

import { db } from "@/lib/db";

/**
 * Who can sign in, and from what.
 *
 * The only way an account came to exist was `pnpm db:actor` on somebody's
 * machine with the production URL in their environment — fine for minting the
 * first owner, and no way to run a business. This is the screen that replaces
 * it for everything after that first one.
 */

export type StaffRow = {
  id: string;
  code: string;
  name: string;
  role: string;
  isActive: boolean;
  /** False for a machine account, which cannot sign in interactively. */
  hasPin: boolean;
  /** Handsets and browsers currently holding a live token. */
  sessions: number;
  /** "02 Sep 2026", or null if they have never signed in. */
  lastSeen: string | null;
  /** Movements they have recorded. Nothing before the ledger named anyone. */
  movements: number;
};

export async function loadStaff(): Promise<StaffRow[]> {
  return db.execute<StaffRow>(sql`
    select
      a.id,
      a.code,
      a.name,
      a.role,
      a.is_active                                    as "isActive",
      (a.secret_hash is not null)                    as "hasPin",
      coalesce(t.live, 0)::int                       as sessions,
      to_char(t.last_seen, 'DD Mon YYYY')            as "lastSeen",
      coalesce(m.n, 0)::int                          as movements
    from actor a
    left join (
      select actor_id,
             count(*) filter (
               where revoked_at is null and expires_at > now()
             )                                       as live,
             max(last_used_at)                       as last_seen
      from actor_token group by actor_id
    ) t on t.actor_id = a.id
    left join (
      select actor_id, count(*) as n from movement
      where actor_id is not null group by actor_id
    ) m on m.actor_id = a.id
    -- Active first, then by name. A deactivated account is history: it has to
    -- stay reachable, and it should not be in the way.
    order by a.is_active desc, a.name
  `);
}

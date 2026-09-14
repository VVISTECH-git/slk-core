import { sql } from "drizzle-orm";

import { db } from "@/lib/db";

/**
 * Job functions — "Bale Custodian" is the first — separate from an
 * actor's access level (floor/office/owner). See
 * `packages/db/src/schema/access.ts` for why the two are different things.
 */
export type JobRoleRow = {
  id: string;
  name: string;
  actorCount: number;
};

export async function loadJobRoles(): Promise<JobRoleRow[]> {
  return db.execute<JobRoleRow>(sql`
    select
      jr.id,
      jr.name,
      count(ajr.actor_id)::int as "actorCount"
    from job_role jr
    left join actor_job_role ajr on ajr.job_role_id = jr.id
    group by jr.id
    order by jr.name
  `);
}

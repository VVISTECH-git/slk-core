import { requirePage } from "@/lib/session";
import { loadJobRoles } from "@/lib/job-roles";

import { JobRoles } from "./job-roles";

export const dynamic = "force-dynamic";

/**
 * Job functions — "Bale Custodian" is the first — separate from an
 * actor's access level. Owner-only, the same as Staff: this is the shape
 * of who's responsible for what, not floor-level data entry.
 */
export default async function JobRolesPage() {
  await requirePage("owner");

  return <JobRoles rows={await loadJobRoles()} />;
}

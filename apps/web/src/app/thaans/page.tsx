import { requirePage } from "@/lib/session";
import { loadStageFunnel, loadThaans } from "@/lib/thaans";

import { Thaans } from "./thaans";

export const dynamic = "force-dynamic";

/**
 * Kora to Shelf, step two: what a bale becomes once it's cut. Read-only for
 * now — cutting and QR generation happen from Bale Intake, this is just
 * where the result is browsable. See
 * `packages/db/src/schema/production.ts` for why this isn't called
 * "Pieces".
 */
export default async function ThaansPage() {
  await requirePage();

  const [rows, funnel] = await Promise.all([loadThaans(), loadStageFunnel()]);

  return <Thaans rows={rows} funnel={funnel} />;
}

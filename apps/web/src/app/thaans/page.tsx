import { requirePage } from "@/lib/session";
import {
  loadStageFunnel,
  loadThaanLocations,
  loadThaanPage,
  type ThaanQuery,
} from "@/lib/thaans";

import { Thaans } from "./thaans";

export const dynamic = "force-dynamic";

const STATUSES: readonly NonNullable<ThaanQuery["status"]>[] = [
  "in_pipeline",
  "on_shelf",
  "gone",
  "voided",
  "all",
];

/**
 * Stock Records: every Thaan from cutting onwards, with its shelf state once
 * shelved. The search, the status, the location and the bale type live in
 * the URL — ?q=T00002007 — so the server can answer them: a visit fetches
 * the newest hundred that match, and a code typed into the box finds its
 * Thaan wherever it is. See `packages/db/src/schema/production.ts` for why
 * this isn't called "Pieces".
 */
export default async function ThaansPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; location?: string; baleType?: string }>;
}) {
  await requirePage();

  const params = await searchParams;
  const status = STATUSES.find((s) => s === params.status) ?? "all";

  const initial: Required<ThaanQuery> = {
    q: (params.q ?? "").trim(),
    status,
    location: (params.location ?? "").trim(),
    baleType: (params.baleType ?? "").trim(),
  };

  const [page, locations, funnel] = await Promise.all([
    loadThaanPage(initial),
    loadThaanLocations(),
    loadStageFunnel(),
  ]);

  return <Thaans page={page} locations={locations} funnel={funnel} initial={initial} />;
}

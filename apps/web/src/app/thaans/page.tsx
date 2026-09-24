import { requirePage } from "@/lib/session";
import {
  THAAN_LIMIT,
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
  searchParams: Promise<{ q?: string; status?: string; location?: string; baleType?: string; page?: string; per?: string }>;
}) {
  await requirePage();

  const params = await searchParams;
  const status = STATUSES.find((s) => s === params.status) ?? "all";

  const asked: Required<ThaanQuery> = {
    q: (params.q ?? "").trim(),
    status,
    location: (params.location ?? "").trim(),
    baleType: (params.baleType ?? "").trim(),
    page: Number.parseInt(params.page ?? "1", 10) || 1,
    perPage: Number.parseInt(params.per ?? "", 10) || THAAN_LIMIT,
  };

  const [page, locations] = await Promise.all([loadThaanPage(asked), loadThaanLocations()]);
  // What the server actually did — a page past the end comes back clamped.
  const initial: Required<ThaanQuery> = { ...asked, page: page.page, perPage: page.perPage };

  return <Thaans page={page} locations={locations} initial={initial} />;
}

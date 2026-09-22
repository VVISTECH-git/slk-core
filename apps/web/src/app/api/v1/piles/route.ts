import { createPile } from "@/app/piles/actions";
import { ApiError, body, guardedJobRole } from "@/lib/api";
import { loadPiles } from "@/lib/piles";

/** Every pile, newest first — `?status=draft|ready|live` narrows it. */
export const GET = guardedJobRole(
  ["Bale Custodian", "Handler", "Production Manager", "Operations Manager"],
  async (request) => {
    const status = new URL(request.url).searchParams.get("status");
    return loadPiles(status === "draft" || status === "ready" || status === "live" ? status : undefined);
  },
);

/**
 * Makes an empty pile — for sorting Thaans that came back "just as Thaans"
 * earlier. A pile made as part of a delivery goes through
 * `POST /handovers/receive` with `piles` instead.
 */
export const POST = guardedJobRole(["Bale Custodian", "Handler"], async (request) => {
  const raw = await body(request);
  const name = typeof raw.name === "string" ? raw.name : "";
  const mainColourId = typeof raw.mainColourId === "string" && raw.mainColourId !== "" ? raw.mainColourId : null;
  const photoKey = typeof raw.photoKey === "string" && raw.photoKey !== "" ? raw.photoKey : null;
  const stage = typeof raw.stage === "string" ? raw.stage : "Print";

  const result = await createPile({ name, mainColourId, photoKey }, stage);
  if (!result.ok) throw new ApiError(result.message, 422);

  return { message: result.message, pile: result.pile };
});

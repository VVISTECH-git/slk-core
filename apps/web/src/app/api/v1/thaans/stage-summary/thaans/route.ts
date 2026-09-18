import { ApiError, guardedJobRole } from "@/lib/api";
import { loadThaansInBucket } from "@/lib/thaans";

/**
 * The actual Thaans sitting in one stage-summary bucket — the drill-down
 * behind its count. `?bucket=` rather than a path segment: bucket names
 * ("Not started", "Second Print") carry spaces, which a dynamic route
 * segment would need URL-encoding gymnastics for that a query param avoids
 * entirely. `?type=` optionally narrows to one `bale.type` too.
 */
export const GET = guardedJobRole(["Production Manager", "Operations Manager"], async (request) => {
  const params = new URL(request.url).searchParams;
  const bucket = params.get("bucket")?.trim() ?? "";
  if (bucket === "") throw new ApiError("Pass ?bucket=.", 400);
  const type = params.get("type")?.trim();

  return loadThaansInBucket(bucket, type === "" || type === null ? undefined : type);
});

import { ApiError, guardedJobRole } from "@/lib/api";
import { loadThaansInBucket } from "@/lib/thaans";

/**
 * The actual Thaans sitting in one stage-summary bucket — the drill-down
 * behind its count. `?bucket=` rather than a path segment: bucket names
 * ("Not started", "Second Print") carry spaces, which a dynamic route
 * segment would need URL-encoding gymnastics for that a query param avoids
 * entirely.
 */
export const GET = guardedJobRole(["Production Manager", "Operations Manager"], async (request) => {
  const bucket = new URL(request.url).searchParams.get("bucket")?.trim() ?? "";
  if (bucket === "") throw new ApiError("Pass ?bucket=.", 400);

  return loadThaansInBucket(bucket);
});

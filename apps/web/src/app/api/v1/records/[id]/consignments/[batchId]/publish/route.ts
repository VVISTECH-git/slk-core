import { publishBatchToChannel } from "@/app/records/publish-actions";
import { ApiError, body, guarded, idAfter } from "@/lib/api";

/**
 * Put one consignment on one channel — create if it has never been listed
 * there, update the same Shopify product in place otherwise. See
 * publishBatchToChannel's own doc comment for the reasoning: the first
 * listing of something is a decision, not a side effect of saving a price.
 *
 * `office`, matching the web tab this mirrors: putting something in front of
 * a real customer is a bigger call than floor staff correcting their own
 * entry.
 */
export const POST = guarded("office", async (request) => {
  const batchId = idAfter(request.url, "consignments");
  const { channelCode } = await body(request);

  if (typeof channelCode !== "string" || channelCode.trim() === "") {
    throw new ApiError("Which channel?", 400);
  }

  const result = await publishBatchToChannel(batchId, channelCode);
  if (!result.ok) throw new ApiError(result.message, 422, result.errors);

  return { message: result.message };
});

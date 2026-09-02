import { removeImage } from "@/app/records/image-actions";
import { ApiError, guarded, recordIdFrom } from "@/lib/api";

/**
 * Take the photograph off a slot, leaving the slot wanted.
 *
 * Deleting the picture and deleting the intention are different acts. Somebody
 * who took a blurred shot of the pallu wants to take another, not to stop the
 * record needing one — so the row stays with an empty storage key, which is
 * exactly the shot list.
 */
export const DELETE = guarded("floor", async (request) => {
  const id = recordIdFrom(request.url);

  const slotId = decodeURIComponent(
    new URL(request.url).pathname.split("/").pop() ?? "",
  );

  if (!/^[0-9a-f-]{36}$/i.test(slotId)) {
    throw new ApiError("Not an image slot.", 400);
  }

  const result = await removeImage(id, slotId);

  if (!result.ok) throw new ApiError(result.message, 404);

  return { slotId };
});

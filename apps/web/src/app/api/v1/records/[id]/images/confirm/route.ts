import { confirmImage } from "@/app/records/image-actions";
import { ApiError, body, guarded, recordIdFrom } from "@/lib/api";

/**
 * The photograph arrived — record that it belongs to this slot.
 *
 * Split from presign deliberately. Between the two the file travels to R2 on
 * a network that drops, and the row must only exist for a file that actually
 * landed. Writing it at presign time would leave slots pointing at objects
 * that were never uploaded, which reads as "photographed" on every screen.
 *
 * Not idempotency-keyed, unlike creating a record: this is an upsert on
 * (colourway, slot), so calling it twice with the same key writes the same row
 * twice and changes nothing. A repeat is already harmless.
 */
export const POST = guarded("floor", async (request) => {
  const id = recordIdFrom(request.url);
  const fields = await body(request);

  const slotId = typeof fields["slotId"] === "string" ? fields["slotId"].trim() : "";
  const key = typeof fields["key"] === "string" ? fields["key"].trim() : "";

  if (slotId === "" || key === "") {
    throw new ApiError("A slot and a key are needed.", 400);
  }

  /**
   * The pixel dimensions, if the phone knows them.
   *
   * Optional because it is a description of the file rather than part of it —
   * a photograph with no width recorded is still a photograph, and refusing
   * the upload over a number nothing depends on would be absurd.
   */
  const size = (name: string): number | null => {
    const value = fields[name];
    return typeof value === "number" && Number.isFinite(value) && value > 0
      ? Math.round(value)
      : null;
  };

  const result = await confirmImage(id, slotId, key, size("width"), size("height"));

  // The action refuses a key it did not mint for this record and slot, which
  // is the check that stops a signed URL for one product being filed under
  // another.
  if (!result.ok) throw new ApiError(result.message, 409);

  return { slotId };
});

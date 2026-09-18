import { addressDamagedThaan } from "@/app/vendors/actions";
import { ApiError, body, guardedJobRole } from "@/lib/api";

/** Finance's review of one damaged Thaan during that vendor's settlement — wraps the same action the web Vendors drawer's "Mark addressed" button calls. */
export const POST = guardedJobRole(["Finance Manager"], async (request) => {
  const raw = await body(request);
  const damageId = typeof raw.damageId === "string" ? raw.damageId : "";
  if (damageId === "") throw new ApiError("Pass damageId.", 400);

  const result = await addressDamagedThaan(damageId);
  if (!result.ok) throw new ApiError(result.message, 422);

  return { message: result.message };
});

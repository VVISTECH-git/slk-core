import { writeOffDamagedThaan } from "@/app/vendors/actions";
import { ApiError, body, guardedJobRole } from "@/lib/api";

/** Retires an already-addressed damaged Thaan for good — wraps the same action the web Vendors drawer's "Write off" button calls. */
export const POST = guardedJobRole(["Finance Manager"], async (request) => {
  const raw = await body(request);
  const damageId = typeof raw.damageId === "string" ? raw.damageId : "";
  if (damageId === "") throw new ApiError("Pass damageId.", 400);

  const result = await writeOffDamagedThaan(damageId);
  if (!result.ok) throw new ApiError(result.message, 422);

  return { message: result.message };
});

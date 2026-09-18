/**
 * Pure, no `db` import — safe for a "use client" component to pull in
 * directly. `lib/thaan-damage.ts` re-exports this for server-side callers,
 * but a client component should import it from here — see
 * `lib/vendor-status.ts` for the same pattern and why it matters.
 */

export type DamagedThaanStatus = "flagged" | "addressed" | "written_off";

export function damagedThaanStatus(row: { addressedAt: string | null; writtenOffAt: string | null }): DamagedThaanStatus {
  if (row.writtenOffAt !== null) return "written_off";
  if (row.addressedAt !== null) return "addressed";
  return "flagged";
}

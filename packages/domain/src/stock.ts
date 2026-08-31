/**
 * What a location's stock number means.
 *
 * Domain logic, not UI: the ops app shows it, the sync worker will compute
 * the same figure before publishing availability, and the two must not
 * disagree about what "on hand" is.
 *
 * The ledger is append-only and every quantity is positive — direction lives
 * in from/to rather than in a sign — so a location's position is simply what
 * arrived minus what left.
 *
 * That subtraction is only meaningful for somewhere we hold stock. Applied to
 * somewhere stock goes when it stops being ours, it produces a negative:
 * Production has sent out 585 units and received none, so its "on hand" reads
 * −585, which is true and tells the reader nothing. What is worth knowing
 * about an external location is how much has reached it.
 */
export interface LocationPosition {
  isInternal: boolean;
  inbound: number;
  outbound: number;
}

export function stockAt(location: LocationPosition): number {
  return location.isInternal
    ? location.inbound - location.outbound
    : location.inbound;
}

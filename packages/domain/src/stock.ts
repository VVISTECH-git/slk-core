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

/**
 * The smallest length a metre-sold design is counted and sold in.
 *
 * Shopify's own inventory API has no fractional quantity — confirmed against
 * its schema (`InventorySetQuantitiesInput`, `InventoryQuantity`) before this
 * was written, not assumed — so a bolt of cloth cannot be tracked in metres
 * on the ledger and pushed to Shopify as-is. It is tracked as an integer
 * count of this unit instead, everywhere: the ledger, a reservation, the
 * quantity Shopify is told. 0.5 m matches the minimum length itokri sells,
 * chosen as the reference for this store's own metre-tracked types.
 *
 * A human enters and reads metres; only the conversion at that boundary
 * needs this constant. Selling, reserving and packing never touch it — a
 * Shopify order's line-item quantity already arrives in these units,
 * because the variant itself is priced per unit (see shopifyPriceForMetre).
 */
export const FABRIC_UNIT_METRES = 0.5;

/** A human-entered length, rounded to the nearest whole unit for storage. */
export function metresToUnits(metres: number): number {
  return Math.round(metres / FABRIC_UNIT_METRES);
}

/** The reverse, for showing a stored unit count back to a human as a length. */
export function unitsToMetres(units: number): number {
  return units * FABRIC_UNIT_METRES;
}

/**
 * What Shopify should be charged per unit, given a per-metre retail price in
 * minor currency units (paise) — so the storefront's plain quantity picker
 * multiplies out to the right total without Shopify ever knowing about
 * metres. Rounded rather than left fractional: minor units are already the
 * smallest currency amount that exists.
 */
export function shopifyPriceForMetreMinor(retailPerMetreMinor: number): number {
  return Math.round(retailPerMetreMinor * FABRIC_UNIT_METRES);
}

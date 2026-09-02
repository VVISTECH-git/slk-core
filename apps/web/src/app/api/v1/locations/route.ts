import { guarded } from "@/lib/api";
import { loadPickableLocations } from "@/lib/locations";

/**
 * Where stock can be counted in.
 *
 * Not part of /options, and deliberately so: locations are not vocabulary.
 * The ledger points at them by foreign key, "how much do we have" is defined
 * as internal minus external, and a warehouse will want an address before
 * long — none of which a lookup value could carry.
 *
 * The pickable ones only, internal first, which is the order somebody
 * standing in a warehouse wants: the place they are is near the top.
 */
export const GET = guarded("floor", () => loadPickableLocations());

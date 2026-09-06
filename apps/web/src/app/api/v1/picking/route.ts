import { guarded } from "@/lib/api";
import { loadOpenReservations } from "@/lib/reservations";

/**
 * Every order waiting to be packed, oldest first — the same list `/picking`
 * shows, each row already carrying the internal locations that currently
 * hold stock of its colourway, so packing doesn't need a second request to
 * ask where.
 *
 * `floor`: packing an order is exactly the kind of thing whoever is holding
 * the phone or standing at the shelf does, matching the web page's own
 * `requirePage("floor")`.
 */
export const GET = guarded("floor", () => loadOpenReservations());

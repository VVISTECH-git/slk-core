/**
 * The shapes of movement someone can record, and where each one sends stock.
 *
 * A movement is always positive and always between two places; the kind is
 * what decides which two. Naming the kinds rather than asking for a from and
 * a to is the difference between "Receive 12 into Retail Unit 1" and a form
 * that will happily sell stock into a warehouse.
 *
 *   other   the location the kind implies, by code — null means the person
 *           picks both ends, which only a transfer does
 *   dir     whether the location they pick receives the stock or sends it
 *
 * Pure, and imported by both the form and the Server Action that writes the
 * row, so the two cannot disagree about what "sold" means. Not in actions.ts:
 * a "use server" file may only export async functions, and a constant does
 * not want a network round trip to be read.
 */
export const MOVEMENT_KINDS = {
  received: {
    label: "Received",
    other: "PRODUCTION",
    dir: "in",
    prompt: "Stock arriving from production.",
  },
  returned: {
    label: "Returned",
    other: "CUSTOMER",
    dir: "in",
    prompt: "A customer sent it back and it can be sold again.",
  },
  sold: {
    label: "Sold",
    other: "CUSTOMER",
    dir: "out",
    prompt: "It has left with a customer.",
  },
  damaged: {
    label: "Damaged",
    other: "SCRAP",
    dir: "out",
    prompt: "Written off. It stops counting as stock.",
  },
  transferred: {
    label: "Transferred",
    other: null,
    dir: "out",
    prompt: "Moved between two of our own locations.",
  },
} as const satisfies Record<
  string,
  { label: string; other: string | null; dir: "in" | "out"; prompt: string }
>;

export type MovementKind = keyof typeof MOVEMENT_KINDS;

export const MOVEMENT_KIND_LIST = Object.entries(MOVEMENT_KINDS).map(
  ([key, spec]) => ({ key: key as MovementKind, ...spec }),
);

export interface MovementDraft {
  kind: MovementKind;
  /** The location the person chose — where it lands, or where it leaves from. */
  locationId: string;
  /** Only for a transfer: where it is going. */
  toLocationId?: string;
  qty: string;
  reference: string;
  note: string;
}

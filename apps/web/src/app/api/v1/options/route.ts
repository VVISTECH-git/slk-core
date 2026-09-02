import { guarded } from "@/lib/api";
import { loadOptions } from "@/lib/editor";

/**
 * The whole controlled vocabulary, grouped by list code.
 *
 * Every dropdown on the entry form comes from here, so the app fetches it once
 * on sign-in rather than a list at a time — thirty-odd round trips on a mobile
 * network to fill one form is the difference between a usable screen and one
 * nobody waits for.
 *
 * Sent whole rather than filtered per field: the lists parent each other
 * (Textile Material narrows to the chosen fibre, Product Type to the chosen
 * industry), and a client that holds all of them can narrow without asking
 * again. It is a few hundred rows.
 *
 * `floor` can read it. Choosing from a vocabulary is not editing it — that is
 * Master Lists, which is not exposed here at all.
 */
export const GET = guarded("floor", () => loadOptions());

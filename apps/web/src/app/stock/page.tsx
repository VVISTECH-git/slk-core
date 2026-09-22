import { redirect } from "next/navigation";

/**
 * Retired. Stock Records is the Thaans page now — one row per Thaan from
 * cutting onwards, with its shelf state once shelved — so a bookmark or a
 * saved default page pointing here lands there instead.
 */
export default function StockPage() {
  redirect("/thaans");
}

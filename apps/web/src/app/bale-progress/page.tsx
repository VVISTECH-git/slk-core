import { redirect } from "next/navigation";

/** Renamed to Dashboard. Kept as a redirect so a bookmarked or shared link to the old URL still lands somewhere real. */
export default function BaleProgressRedirect() {
  redirect("/dashboard");
}

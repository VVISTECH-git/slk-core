import { redirect } from "next/navigation";

/** The dashboard now lives at "/" itself, not here — kept as a redirect so an already-shared "/dashboard" link still lands somewhere real. */
export default function DashboardRedirect() {
  redirect("/");
}

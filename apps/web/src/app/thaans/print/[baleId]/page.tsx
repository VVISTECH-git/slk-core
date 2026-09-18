import { notFound } from "next/navigation";

import { requireJobRolePage } from "@/lib/session";
import { loadThaanPrintBatch } from "@/lib/thaans";

import { PrintView } from "./print-view";

export const dynamic = "force-dynamic";

// Same gate as Bale Intake's own "Print QR codes" — the only place the bulk
// case is ever launched from. A single-Thaan reprint comes from the
// Admin-only Thaans screen instead, but Admin passes this gate too, so one
// check covers both entry points.
const PRINT_JOB_ROLES = ["Bale Custodian"];

/**
 * The QR codes generated for one bale's Thaans, laid out for a thermal
 * receipt roll rather than an A4 sheet of labels — see the `@page` rule in
 * `print-view.tsx`.
 */
export default async function PrintThaansPage({
  params,
  searchParams,
}: {
  params: Promise<{ baleId: string }>;
  searchParams: Promise<{ thaan?: string }>;
}) {
  await requireJobRolePage(PRINT_JOB_ROLES);

  const { baleId } = await params;
  const { thaan } = await searchParams;
  const batch = await loadThaanPrintBatch(baleId, thaan);

  if (batch.baleCode === "" || batch.rows.length === 0) {
    notFound();
  }

  // A single-Thaan reprint only ever gets here from the Thaans screen's own
  // row menu — the bulk print action on Bale Intake never sets `thaan`.
  const back = thaan === undefined ? { href: "/bales", label: "Back to Bale Intake" } : { href: "/thaans", label: "Back to Thaans" };

  return <PrintView batch={batch} back={back} />;
}

import { notFound } from "next/navigation";

import { requirePage } from "@/lib/session";
import { loadThaanPrintBatch } from "@/lib/thaans";

import { PrintView } from "./print-view";

export const dynamic = "force-dynamic";

/**
 * The QR codes generated for one bale's Thaans, laid out for a thermal
 * receipt roll rather than an A4 sheet of labels — see the `@page` rule in
 * `print-view.tsx`.
 */
export default async function PrintThaansPage({
  params,
}: {
  params: Promise<{ baleId: string }>;
}) {
  await requirePage();

  const { baleId } = await params;
  const batch = await loadThaanPrintBatch(baleId);

  if (batch.baleCode === "" || batch.rows.length === 0) {
    notFound();
  }

  return <PrintView batch={batch} />;
}

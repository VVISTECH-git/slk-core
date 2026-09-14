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
  searchParams,
}: {
  params: Promise<{ baleId: string }>;
  searchParams: Promise<{ thaan?: string }>;
}) {
  await requirePage();

  const { baleId } = await params;
  const { thaan } = await searchParams;
  const batch = await loadThaanPrintBatch(baleId, thaan);

  if (batch.baleCode === "" || batch.rows.length === 0) {
    notFound();
  }

  return <PrintView batch={batch} />;
}

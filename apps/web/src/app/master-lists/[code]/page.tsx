import { notFound } from "next/navigation";

import { loadList } from "@/lib/vocabulary";

import { Values } from "./values";

export const dynamic = "force-dynamic";

export default async function ListPage({ params }: PageProps<"/master-lists/[code]">) {
  const { code } = await params;

  const loaded = await loadList(code);
  if (loaded === null) notFound();

  return (
    <Values
      list={loaded.list}
      values={loaded.values}
      duplicates={loaded.duplicates}
    />
  );
}

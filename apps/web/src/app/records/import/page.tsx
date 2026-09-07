import { requirePage } from "@/lib/session";

import { ImportClient } from "./import-client";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  await requirePage();

  return <ImportClient />;
}

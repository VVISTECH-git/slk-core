import { requirePage } from "@/lib/session";
import { loadCategories, loadClassifications } from "@/lib/operational";

import { OperationalStandard } from "./operational";

export const dynamic = "force-dynamic";

export default async function OperationalStandardPage() {
  await requirePage();

  const [classifications, categories] = await Promise.all([
    loadClassifications(),
    loadCategories(),
  ]);

  return (
    <OperationalStandard
      classifications={classifications}
      categories={categories}
    />
  );
}

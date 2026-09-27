import { Header } from "@/components/ui";
import { loadStageTargets } from "@/lib/control-tower";
import { requirePage } from "@/lib/session";

import { StandardsForm } from "./standards-form";

export const dynamic = "force-dynamic";

export const metadata = { title: "Turnaround Standards" };

/** Where the Control Tower's red comes from: the days each stage may take, and the days cloth may wait between stages. */
export default async function StandardsPage() {
  await requirePage();
  const targets = await loadStageTargets();
  return (
    <div className="flex min-h-screen flex-col">
      <Header
        crumbs={[{ label: "Control Tower", href: "/control-tower" }]}
        title="Turnaround Standards"
        lede="How long each stage may keep a Thaan before it is overdue, and how long cloth may wait in the warehouse before it is idle. The Control Tower marks anything past these in red."
      />
      <div className="px-8 py-6">
        <StandardsForm initial={targets} />
      </div>
    </div>
  );
}

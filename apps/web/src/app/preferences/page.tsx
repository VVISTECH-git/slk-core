import { requirePage } from "@/lib/session";

import { Preferences } from "./preferences";

export const dynamic = "force-dynamic";

export default async function PreferencesPage() {
  await requirePage();

  return <Preferences />;
}

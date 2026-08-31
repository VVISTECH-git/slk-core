import { loadAllValues, loadLists } from "@/lib/vocabulary";

import { Directory } from "./directory";

export const dynamic = "force-dynamic";

export default async function MasterListsPage() {
  const [lists, values] = await Promise.all([loadLists(), loadAllValues()]);

  const attention = lists.reduce((sum, l) => sum + l.attention, 0);

  return <Directory lists={lists} values={values} attention={attention} />;
}

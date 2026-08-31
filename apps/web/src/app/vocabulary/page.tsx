import { duplicatesFor, loadVocabulary } from "@/lib/vocabulary";

import { Workbench } from "./workbench";

export const dynamic = "force-dynamic";

export default async function VocabularyPage() {
  const { values, lists } = await loadVocabulary();

  // 227 values is 25k comparisons — cheap enough on every load, and running it
  // server-side keeps the rule out of the browser bundle.
  const duplicates = duplicatesFor(values);

  return <Workbench values={values} lists={lists} duplicates={duplicates} />;
}

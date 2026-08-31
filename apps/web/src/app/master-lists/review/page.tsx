import { duplicatesFor, loadAllValues } from "@/lib/vocabulary";

import { Inbox } from "./inbox";

export const dynamic = "force-dynamic";

export default async function ReviewPage() {
  const values = await loadAllValues();

  // 227 values is 25k comparisons — cheap enough on every load, and running it
  // server-side keeps the rule out of the browser bundle.
  const duplicates = duplicatesFor(values);

  return (
    <Inbox
      duplicates={duplicates}
      proposals={values.filter((v) => v.status === "proposed")}
      review={values.filter((v) => v.needsReview)}
    />
  );
}

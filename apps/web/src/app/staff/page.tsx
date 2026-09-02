import { MIN_PIN_LENGTH } from "@slk/domain";

import { requirePage } from "@/lib/session";
import { loadStaff } from "@/lib/staff";

import { Staff } from "./staff";

export const dynamic = "force-dynamic";

export default async function StaffPage() {
  // Owner, and asked for before anything is loaded — the rows say who works
  // here and which of them are signed in, which is not a list to hand to
  // somebody on their way to being refused.
  await requirePage("owner");

  return (
    <Staff
      rows={await loadStaff()}
      /*
        Passed down rather than imported in the client component. The rule
        lives in @slk/domain beside `pinProblem`, which is the function that
        enforces it — but that module imports node:crypto, and a client
        component that reaches for it drags the whole of it into the browser
        bundle and breaks at run time.
      */
      minPin={MIN_PIN_LENGTH}
    />
  );
}

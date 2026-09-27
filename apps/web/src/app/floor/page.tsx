import { redirect } from "next/navigation";

/** The Floor Monitor became the Control Tower — kept so a screen already pointed here keeps working. */
export default function FloorRedirect() {
  redirect("/control-tower");
}

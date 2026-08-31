import { redirect } from "next/navigation";

export default function Home() {
  // The first screen in the sidebar. Landing anywhere else leaves the nav
  // with nothing highlighted.
  redirect("/records");
}

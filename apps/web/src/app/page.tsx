import { redirect } from "next/navigation";

export default function Home() {
  // Nothing to land on until the catalogue exists; the vocabulary is what is
  // actually built.
  redirect("/vocabulary");
}

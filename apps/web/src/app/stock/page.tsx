import { NotBuiltYet } from "@/components/not-built-yet";

export default function StockPage() {
  return (
    <NotBuiltYet
      title="Stock"
      what="What is on hand, per colourway and per location, derived from the movement ledger rather than stored — plus the drawer for pieces, movements and photographs."
      waitingOn="the movement ledger. Nothing can show a count until there is something to count."
    />
  );
}

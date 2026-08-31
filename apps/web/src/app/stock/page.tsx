import { NotBuiltYet } from "@/components/not-built-yet";

export default function StockPage() {
  return (
    <NotBuiltYet
      title="Stock"
      what="What is on hand, per colourway and per location, with the drawer for pieces, movements and photographs — and Record movement, which is the one action a stock inspector actually needs."
      waitingOn="nothing structural. The ledger exists and Product Records already derives a count from it; this screen is the per-location view and the movement form on top of it."
    />
  );
}

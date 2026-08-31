import { NotBuiltYet } from "@/components/not-built-yet";

export default function RecordsPage() {
  return (
    <NotBuiltYet
      title="Product Records"
      what="Every design and colourway in one table, with inline editing, column filters, and the editor for basic details, prices, images and stock."
      waitingOn="the catalogue tables — design, colourway and piece — which depend on decisions still open about how SLK manufactures and sells."
    />
  );
}

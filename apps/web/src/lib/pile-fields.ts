import type { AttributeKey } from "@/lib/attributes";
import { STAGES, type Stage } from "@/lib/stages";

/**
 * Which Product Management facts each stage decides — the one table behind
 * "Piles to complete". A pile at Nellateeta is asked for Print's fields too,
 * cumulatively, so anything missed at the door can still be filled in
 * later; changing what a stage asks for is one edit here.
 *
 * Colour is not in this table: a pile's main colour is fixed when it is
 * made and becomes the colourway's colour; the secondary colour is asked
 * for at Print alongside the motif.
 */
export const PILE_STAGE_FIELDS: Record<Stage, AttributeKey[]> = {
  "Label Stitching": [],
  Salava: [],
  Karakkaya: [],
  Print: ["craftTechnique", "craftSubType", "motifCategory", "motif", "sareeStyle"],
  "Second Print": [],
  Nellateeta: ["borderStyle", "borderHeight"],
  Udukulu: [],
  // Prices, product photos and stock come after Ironing — Phase 3, not a lookup field.
  Ironing: [],
};

/** The fields that must be filled for a pile at `stage` to count as complete so far. */
export const PILE_STAGE_REQUIRED: Record<Stage, AttributeKey[]> = {
  "Label Stitching": [],
  Salava: [],
  Karakkaya: [],
  Print: ["craftTechnique", "motif"],
  "Second Print": [],
  Nellateeta: ["borderStyle"],
  Udukulu: [],
  Ironing: [],
};

/** Every field asked for up to and including `stage`, in pipeline order. */
export function fieldsThrough(stage: Stage): AttributeKey[] {
  const out: AttributeKey[] = [];
  for (const s of STAGES) {
    out.push(...PILE_STAGE_FIELDS[s]);
    if (s === stage) break;
  }
  return out;
}

export function requiredThrough(stage: Stage): AttributeKey[] {
  const out: AttributeKey[] = [];
  for (const s of STAGES) {
    out.push(...PILE_STAGE_REQUIRED[s]);
    if (s === stage) break;
  }
  return out;
}

/** Short words for the "Needs motif, craft" badge — what a person calls the field, not its key. */
export const FIELD_SHORT: Partial<Record<AttributeKey, string>> = {
  craftTechnique: "craft",
  craftSubType: "craft type",
  motifCategory: "motif group",
  motif: "motif",
  sareeStyle: "layout",
  borderStyle: "border",
  borderHeight: "border height",
  fibreType: "fibre",
  productType: "product type",
  homeProductType: "product type",
  garmentType: "blouse",
};

/**
 * A bale's type is the raw cloth's own word for what it will become; the
 * catalogue's Product Type list uses the finished product's. One table
 * bridges the two, by label, so a renamed list value is a one-line change
 * here and not a migration.
 */
export const BALE_TYPE_TO_PRODUCT: Record<string, { industry: string; list: "product_type" | "home_product_type"; label: string }> = {
  Sarees: { industry: "Clothing", list: "product_type", label: "Saree" },
  Fabric: { industry: "Clothing", list: "product_type", label: "Fabric" },
  Chunnies: { industry: "Clothing", list: "product_type", label: "Dupatta" },
  Bedsheets: { industry: "Home", list: "home_product_type", label: "Bedsheets" },
  Pillows: { industry: "Home", list: "home_product_type", label: "Pillow Covers" },
};

/** The later of the two stages by pipeline order. */
export function laterOf(a: Stage, b: Stage): Stage {
  return STAGES.indexOf(b) > STAGES.indexOf(a) ? b : a;
}

/**
 * The bulk-import spreadsheet's columns, in order.
 *
 * One list rather than one array for the template writer and another for the
 * row parser — the same reason `ATTRIBUTES` in "@/lib/attributes" is one map
 * instead of three. A column added here appears in the downloaded template
 * and is understood by the parser in the same edit; adding it in only one
 * place is a template with a column nothing reads, or a parser expecting a
 * column nobody sees.
 *
 * Deliberately free of any database import — this is the shape of the sheet,
 * not how its dropdown values are fetched. See import-actions.ts for that.
 */
import type { AttributeKey } from "@/lib/attributes";

export interface DropdownColumn {
  kind: "dropdown";
  header: string;
  /** Lookup list code this column's choices come from, or "location" for the warehouse list. */
  list: string;
  required?: boolean;
  /** Where a chosen value's id is written. Colour/location are not plain attributes. */
  target: AttributeKey | "colour" | "secondaryColour" | "location";
}

export interface TextColumn {
  kind: "text";
  header: string;
  target: "existingProductCode" | "descriptors" | "name" | "notes" | "reference";
  required?: boolean;
  hint?: string;
}

export interface NumberColumn {
  kind: "number";
  header: string;
  target: "cost" | "making" | "wholesale" | "retail" | "mrp" | "openingQty";
  required?: boolean;
}

export type ImportColumn = DropdownColumn | TextColumn | NumberColumn;

/**
 * Left out on purpose, to keep the sheet usable: the placement-only motif
 * columns (Pallu/Border/Saree Body/Blouse Motif — all four read the Motif
 * list a second time), the three values Textile Material replaced, and the
 * Home & Lifestyle weaving-category branch. A record needing one of those
 * is finished by opening it in Product Management after the import, the same
 * screen a typo would be fixed on.
 */
export const IMPORT_COLUMNS: ImportColumn[] = [
  {
    kind: "text",
    header: "Existing Product Code",
    target: "existingProductCode",
    hint:
      "Leave blank to create a brand-new product. Fill in a design code (e.g. SAR-SRI-SIL-0001) to add a " +
      "new consignment of stock to that product instead — every column below except Colour, Reference, " +
      "Notes and the Opening Stock columns is then ignored.",
  },
  { kind: "dropdown", header: "Industry", list: "industry", required: true, target: "industry" },
  { kind: "dropdown", header: "Product Type (Clothing)", list: "product_type", target: "productType" },
  { kind: "dropdown", header: "Product Type (Home & Lifestyle)", list: "home_product_type", target: "homeProductType" },
  { kind: "dropdown", header: "Product Sub Type", list: "garment_type", target: "garmentType" },
  { kind: "dropdown", header: "Colour", list: "colour", required: true, target: "colour" },
  { kind: "dropdown", header: "Secondary Colour", list: "colour", target: "secondaryColour" },
  { kind: "dropdown", header: "Fiber Type", list: "fibre_type", required: true, target: "fibreType" },
  { kind: "dropdown", header: "Craft Technique", list: "craft_technique", required: true, target: "craftTechnique" },
  { kind: "dropdown", header: "Craft Sub Type", list: "craft_sub_type", target: "craftSubType" },
  { kind: "dropdown", header: "Weave Structure", list: "weave_structure", target: "weaveStructure" },
  { kind: "dropdown", header: "Textile Material", list: "textile_material", target: "textileMaterial" },
  { kind: "dropdown", header: "Fabric Type", list: "fabric_type", target: "fabricType" },
  { kind: "dropdown", header: "Production Method", list: "production_method", target: "productionMethod" },
  { kind: "dropdown", header: "Audience", list: "audience_type", target: "audienceType" },
  { kind: "dropdown", header: "Region Style", list: "regional_style", target: "regionalStyle" },
  { kind: "dropdown", header: "Motif Category", list: "motif_category", target: "motifCategory" },
  { kind: "dropdown", header: "Motif", list: "motif", target: "motif" },
  { kind: "dropdown", header: "Border Style", list: "border_style", target: "borderStyle" },
  { kind: "dropdown", header: "Border Height", list: "border_height", target: "borderHeight" },
  { kind: "dropdown", header: "Saree Style", list: "saree_style", target: "sareeStyle" },
  { kind: "dropdown", header: "Blouse Style", list: "blouse_style", target: "blouseStyle" },
  { kind: "dropdown", header: "Blouse Border", list: "border_style", target: "blouseBorder" },
  { kind: "dropdown", header: "Blouse Availability", list: "blouse_available", target: "blouseAvailable" },
  { kind: "dropdown", header: "Blouse Status", list: "blouse_status", target: "blouseStatus" },
  { kind: "dropdown", header: "Blouse Material", list: "blouse_material", target: "blouseMaterial" },
  { kind: "dropdown", header: "Pallu Design", list: "pallu_design", target: "palluDesign" },

  {
    kind: "text",
    header: "Descriptors",
    target: "descriptors",
    hint: "Optional. Comma-separated, e.g. \"Soft, Pure\" — must match values from the Descriptor list.",
  },
  {
    kind: "text",
    header: "Custom Name",
    target: "name",
    hint: "Leave blank to compose the name from the fields above, the same way a new record does.",
  },
  { kind: "text", header: "Notes", target: "notes" },
  {
    kind: "text",
    header: "Reference",
    target: "reference",
    hint: "Optional. A supplier invoice number or similar — only used when Existing Product Code is filled in.",
  },

  { kind: "number", header: "Cost Price (Rs)", target: "cost" },
  { kind: "number", header: "Making Price (Rs)", target: "making" },
  { kind: "number", header: "Wholesale Price (Rs)", target: "wholesale" },
  { kind: "number", header: "Retail Price (Rs)", target: "retail", required: true },
  { kind: "number", header: "MRP (Rs)", target: "mrp" },

  {
    kind: "dropdown",
    header: "Opening Stock Location",
    list: "location",
    required: true,
    target: "location",
  },
  { kind: "number", header: "Opening Stock Quantity", target: "openingQty", required: true },
];

/** Every distinct lookup list a dropdown column draws from, "location" included. */
export const IMPORT_LISTS: string[] = [
  ...new Set(
    IMPORT_COLUMNS.filter((c): c is DropdownColumn => c.kind === "dropdown").map((c) => c.list),
  ),
];

/** Rows the template ships with beneath the header, for data validation to cover. */
export const TEMPLATE_ROWS = 500;

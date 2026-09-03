/**
 * The attribute map and the shapes built on it.
 *
 * Deliberately free of any database import. The editor is a client component
 * and needs `defaultAttributes` as a value, not a type — importing it from
 * the module that opens a Postgres connection would pull the driver into the
 * browser bundle.
 */

/**
 * Which lookup list each editable attribute draws from, and which column on
 * `design` holds it.
 *
 * One table rather than three parallel ones: the editor, the validator and
 * the save all read from here, so a new attribute is a single line and cannot
 * be half-wired.
 */
export const ATTRIBUTES = {
  industry: { list: "industry", column: "industry_id", label: "Industry" },
  productType: { list: "product_type", column: "product_type_id", label: "Product Type" },
  homeProductType: { list: "home_product_type", column: "home_product_type_id", label: "Product Type" },
  garmentType: { list: "garment_type", column: "garment_type_id", label: "Product Sub Type" },

  /**
   * How the thing is sold, and so what a price is a price *of*.
   *
   * Never chosen. The workbook states it on the same row as the product type
   * — Fabric is sold by the Metre, everything else by the Piece — and that
   * relationship is carried in `parent_value_id`, so it is derived from
   * Product Type and stored alongside it. A record where the two disagreed
   * would be a record whose price meant nothing.
   */
  uom: { list: "uom", column: "uom_id", label: "Sold By" },
  homeWeavingCategory: { list: "home_weaving_category", column: "home_weaving_category_id", label: "Weaving Category" },
  productionMethod: { list: "production_method", column: "production_method_id", label: "Production Method" },
  audienceType: { list: "audience_type", column: "audience_type_id", label: "Audience" },
  descriptor: { list: "descriptor", column: "descriptor_id", label: "Descriptor" },
  fibreType: { list: "fibre_type", column: "fibre_type_id", label: "Fiber Type" },
  weaveStructure: { list: "weave_structure", column: "weave_structure_id", label: "Weave Structure" },
  textileMaterial: { list: "textile_material", column: "textile_material_id", label: "Textile Material" },
  // The three Textile Material replaces. Their lists are switched off, so
  // nothing new is written to them; they stay because records carry them.
  silkSubFamily: { list: "silk_sub_family", column: "silk_sub_family_id", label: "Silk Sub Family" },
  cottonSubFamily: { list: "cotton_sub_family", column: "cotton_sub_family_id", label: "Cotton Sub Family" },
  fabricType: { list: "fabric_type", column: "fabric_type_id", label: "Fabric Type" },
  craftTechnique: { list: "craft_technique", column: "craft_technique_id", label: "Craft Technique" },
  craftSubType: { list: "craft_sub_type", column: "craft_sub_type_id", label: "Craft Sub Type" },
  regionalStyle: { list: "regional_style", column: "regional_style_id", label: "Region Style" },
  motifCategory: { list: "motif_category", column: "motif_category_id", label: "Motif Category" },
  motif: { list: "motif", column: "motif_id", label: "Motif" },
  borderStyle: { list: "border_style", column: "border_style_id", label: "Border Style" },
  borderHeight: { list: "border_height", column: "border_height_id", label: "Border Height" },
  sareeStyle: { list: "saree_style", column: "saree_style_id", label: "Saree Style" },
  blouseStyle: { list: "blouse_style", column: "blouse_style_id", label: "Blouse Style" },
  // Placement, not vocabulary: all three read a list that already exists.
  palluMotif: { list: "motif", column: "pallu_motif_id", label: "Pallu Motif" },
  borderMotif: { list: "motif", column: "border_motif_id", label: "Border Motif" },
  sareeBodyMotif: { list: "motif", column: "saree_body_motif_id", label: "Saree Body Motif" },
  blouseMotif: { list: "motif", column: "blouse_motif_id", label: "Blouse Motif" },
  blouseBorder: { list: "border_style", column: "blouse_border_id", label: "Blouse Border" },
  // Superseded by Saree Style. Its list is switched off, so nothing new is
  // written to it; the column stays because records still carry it.
  sareeLayout: { list: "saree_layout", column: "saree_layout_id", label: "Saree Layout" },
  palluDesign: { list: "pallu_design", column: "pallu_design_id", label: "Pallu Design" },
  blouseAvailable: { list: "blouse_available", column: "blouse_available_id", label: "Blouse Availability" },
  blouseStatus: { list: "blouse_status", column: "blouse_status_id", label: "Blouse Status" },
  blouseMaterial: { list: "blouse_material", column: "blouse_material_id", label: "Blouse Material" },
} as const;

export type AttributeKey = keyof typeof ATTRIBUTES;

export const ATTRIBUTE_KEYS = Object.keys(ATTRIBUTES) as AttributeKey[];

export interface Option {
  id: string;
  label: string;
  /**
   * The value's frozen identity. Renaming a category on Master Lists changes
   * its label and leaves this alone, so anything that has to recognise a
   * particular value recognises it by this and never by what it is called.
   */
  code: string;
  /** The value this one sits under — the list filters on it. */
  parentId: string | null;
  /** How a product type is measured. Only product types have one. */
  soldById: string | null;
  hex: string | null;
  /**
   * Whether this product type is tracked piece by piece.
   *
   * A fact about the product type, kept on the product type — sarees are
   * tagged individually and get item codes, cloth by the metre is not. It was
   * a comparison against the literal string "Saree", which would have gone
   * quietly wrong the first time anybody renamed the category.
   */
  serialised: boolean;
  /** Pre-selected on a new record. At most one per list. */
  isDefault: boolean;
}

export type Options = Record<string, Option[]>;

export interface RecordDetail {
  id: string;
  designId: string;
  code: string;
  name: string;
  nameIsCustom: boolean;
  isSerialised: boolean;
  notes: string | null;
  colourId: string | null;
  secondaryColourId: string | null;
  costMinor: number | null;
  makingMinor: number | null;
  wholesaleMinor: number | null;
  retailMinor: number | null;
  mrpMinor: number | null;
  attributes: Partial<Record<AttributeKey, string | null>>;
  /** Every colour under this design — a change to attributes hits all of them. */
  siblings: { id: string; colour: string | null }[];
  stock: {
    onHand: number;
    received: number;
    sold: number;
    damaged: number;
    returned: number;
    adjusted: number;
    byLocation: { location: string; qty: number }[];
  };
  /**
   * What arrived, and when — newest first.
   *
   * Each consignment is one product code and the item codes minted under it.
   * The Stock tab's totals say how much is here now; this says what came in
   * and against which invoice, which is the question a supplier query
   * actually asks.
   */
  consignments: {
    id: string;
    code: string;
    qty: number;
    location: string | null;
    receivedAt: string;
    reference: string | null;
    note: string | null;
    items: string[];

    /**
     * What this consignment is listed as, if it differs from the rest of the
     * line. Null on every one of these means "compose it" — see
     * @slk/domain/listing — which is the answer for the batch that is the
     * fourth run of the same saree and does not need anybody's afternoon.
     */
    title: string | null;
    description: string | null;
    /** Grams. Null until entered — there is no honest default for a weight. */
    weightGrams: number | null;
    hsnCode: string | null;
  }[];

  /**
   * The photographs this product should have.
   *
   * `url` is null for a slot somebody has decided is wanted and nobody has
   * photographed yet — which is the shot list, and worth having.
   */
  images: { slotId: string | null; url: string | null }[];
  /** The adjectives on the design. A set, unlike every other attribute. */
  descriptors: string[];

  movements: {
    id: number;
    kind: string;
    qty: number;
    occurredAt: string;
    reason: string | null;
    from: string | null;
    to: string | null;
  }[];
}

/**
 * The attribute values a new record starts with, taken from whichever value
 * in each list is marked as the default.
 *
 * Colour is deliberately not defaulted here — it is per-colourway, and a
 * record silently created in someone else's idea of a default colour is worse
 * than one that makes you choose.
 */
export function defaultAttributes(
  options: Options,
): Partial<Record<AttributeKey, string | null>> {
  const defaults: Partial<Record<AttributeKey, string | null>> = {};

  /*
    Two passes, because a default can belong to another default.

    Saree is the default Product Type and belongs to Clothing, which is the
    default Industry — so it applies. Mul Mul is the default Textile Material
    and belongs to Cotton, which is not the default fibre and may never be
    chosen — so it does not, and is applied when the fibre is answered.

    The rule is the same in both cases: a parented default applies only where
    its parent has actually been settled. One pass would have made that
    depend on the order the attributes happen to be declared in.
  */
  const applied = new Set<string>();

  for (const key of ATTRIBUTE_KEYS) {
    const chosen = options[ATTRIBUTES[key].list]?.find((o) => o.isDefault);
    if (chosen === undefined || chosen.parentId !== null) continue;

    defaults[key] = chosen.id;
    applied.add(chosen.id);
  }

  for (const key of ATTRIBUTE_KEYS) {
    const chosen = options[ATTRIBUTES[key].list]?.find((o) => o.isDefault);
    if (chosen === undefined || chosen.parentId === null) continue;
    if (!applied.has(chosen.parentId)) continue;

    defaults[key] = chosen.id;
    applied.add(chosen.id);
  }

  /*
    Unit of measure follows from the product type rather than being asked.

    Set here as well as on every change, or a record created without touching
    Product Type would be priced "per" nothing — which is what happened the
    moment Saree started arriving as a default rather than being chosen.
  */
  const productType = (options["product_type"] ?? [])
    .concat(options["home_product_type"] ?? [])
    .find((o) => o.id === (defaults.productType ?? defaults.homeProductType));

  if (productType?.soldById != null) defaults.uom = productType.soldById;

  return defaults;
}

/**
 * Industry decides what the rest of the record even means.
 *
 * A saree and a bedsheet do not share a product type list, and asking a
 * bedsheet whether a blouse comes with it is nonsense. The workbook keeps two
 * sheets for exactly this reason, and the database keeps two columns —
 * `product_type_id` and `home_product_type_id` — so the only thing missing
 * was the form honouring it.
 *
 * Here rather than beside the Server Action that enforces it: a "use server"
 * file may only export async functions, and both the form and the action need
 * this string to agree on.
 */
export const HOME_INDUSTRY_LABELS = ["Home", "Home & Lifestyle"];

/**
 * Whether this industry is the home one, whatever it is called today.
 *
 * It was one string, compared exactly, and the live database had already
 * been renamed from Home & Lifestyle to Home — so the whole home branch of
 * the form was unreachable there and nobody could see why. Matching a label
 * is the wrong shape for this; it should be the value's code. Until the
 * industry list carries one the form can read, both spellings count.
 */
export function isHomeIndustry(label: string | null | undefined): boolean {
  return label != null && HOME_INDUSTRY_LABELS.includes(label);
}

/**
 * The controlled vocabulary, transcribed from `Master Listing - New.xlsx`
 * (dated 30 Aug 2026) — sheets *Sheet2 Corrected*, *Garments* and
 * *Home and Life Style*.
 *
 * Values are verbatim. Nothing is renamed, merged, re-cased or spelling-
 * corrected here; the workbook's Correction Log is the record of intentional
 * changes, and correcting a value in this file would put the two out of step
 * with no trace of why.
 *
 * ONE deliberate divergence from the workbook, recorded in
 * docs/decisions/0001-craft-technique-tie-and-dye.md:
 *
 *   Craft Technique omits `Tie & Dye`. It sits at the bottom of that column
 *   out of alphabetical order, and Correction Log row 18 had already removed
 *   it — Bandhani and Shibori are the named tie-dye techniques and Tie & Dye
 *   was their parent. It is dropped here explicitly, and this comment is the
 *   reason a re-import must not silently put it back.
 *
 * 27 lists · 227 values.
 */

export interface SeedValue {
  label: string;
  /** Label of the companion value in `parentList`. */
  parent?: string;
  /**
   * Pre-selected on a new record. Applied only when the list has no default
   * at all, so a choice made on the Values screen is never overwritten by a
   * re-seed.
   */
  isDefault?: boolean;
  /** Correction Log: PROPOSED — confirm or replace. */
  proposed?: boolean;
  /** Seeded already retired — a value kept only so old records still read. */
  retired?: boolean;
  /** Correction Log: NEEDS REVIEW — check against real stock. */
  needsReview?: boolean;
  meta?: Record<string, unknown>;
}

export interface SeedList {
  code: string;
  label: string;
  description: string;
  /** New values are stored lower case, as the workbook has them. */
  /** Application logic reads these by code; values may be relabelled, not removed. */
  isSystem?: boolean;
  /** Code of the list this list's `parent` labels are drawn from. */
  parentList?: string;
  values: SeedValue[];
}

const plain = (...labels: string[]): SeedValue[] =>
  labels.map((label) => ({ label }));

/**
 * Ordered so that a list is always defined before any list that references it:
 * `uom` and `motif_category` come first because product types and motifs point
 * at them.
 */
export const MASTER_LISTING: SeedList[] = [
  {
    code: "uom",
    label: "UOM",
    description:
      "Unit of measure. Added to the workbook 30 Aug 2026 — the application had been deriving it from Product Type.",
    isSystem: true,
    values: plain("Piece", "Metre"),
  },
  {
    code: "image_slot",
    label: "Image Slot",
    description:
      "The photographs a product carries. Body, Pallu, Border and Blouse are the parts a saree is judged by; add more and they are offered on every record.",
    values: plain("Body", "Pallu", "Border", "Blouse"),
  },
  {
    code: "motif_category",
    label: "Motif Category",
    description:
      "Renamed from Primary Design Descriptor. Parents every value in the Motif list.",
    values: plain(
      "Floral",
      "Fauna",
      "Birds",
      "Figures & Idols",
      "Mythology & Story",
      "Music Instruments",
      "Geometric",
      "Objects",
      "Kolam",
      "Warli",
      "Village Life",
    ),
  },

  {
    code: "industry",
    label: "Industry",
    description: "The top-level split. Decides which product type list applies.",
    isSystem: true,
    values: [
      // Nearly everything SLK makes is clothing, so a new record starts there.
      { label: "Clothing", isDefault: true },
      { label: "Home & Lifestyle" },
    ],
  },
  {
    code: "production_method",
    label: "Production Method",
    description:
      "Renamed from Weave Type — handloom vs machine is a production method, not a weave structure.",
    values: plain("Handloom", "Machine Made"),
  },
  {
    code: "product_type",
    label: "Product Type",
    description: "Clothing product types. Each states its own unit of measure.",
    parentList: "uom",
    values: [
      { label: "Saree", parent: "Piece" },
      { label: "Dupatta", parent: "Piece" },
      { label: "Fabric", parent: "Metre" },
      { label: "Bedsheets", parent: "Piece" },
      { label: "Scarves", parent: "Piece" },
      { label: "Stolls", parent: "Piece" },
    ],
  },
  {
    code: "weave_structure",
    label: "Weave Structure",
    description:
      "Column added to give Jacquard a correct home; it had been sitting in Fabric Type.",
    values: plain("Plain Weave", "Jacquard"),
  },
  {
    code: "fibre_type",
    label: "Fibre Type",
    description: "The fibre itself. Blouse Material deliberately reuses part of this list.",
    values: plain(
      "Silk",
      "Cotton",
      "Viscose",
      "Modal",
      "Linen",
      "Jute",
      "Rayon",
      "Sico (Silk-Cotton Blend)",
    ),
  },
  {
    code: "silk_sub_family",
    label: "Silk Sub Family",
    description: "Applies only when Fibre Type is Silk. Dola and Geecha moved in from Regional Style.",
    values: plain("Pattu", "Katan", "Kora", "Tussar", "Dola", "Geecha"),
  },
  {
    code: "cotton_sub_family",
    label: "Cotton Sub Family",
    description: "Applies only when Fibre Type is Cotton.",
    values: plain("Mul Mul", "Khadi", "Mercerized"),
  },
  {
    code: "fabric_type",
    label: "Fabric Type",
    description: "Sheer or specialty cloth only.",
    values: plain("Georgette", "Chiffon", "Crepe", "Tissue"),
  },
  {
    code: "audience_type",
    label: "Audience Type",
    description: "Who the piece is for. Defaults to Women.",
    values: [
      { label: "Men" },
      // Every record that has an audience has this one — sarees, dupattas,
      // the lot. Typing it on each of them is work the default should do.
      { label: "Women", isDefault: true },
      { label: "Kids" },
    ],
  },
  {
    code: "craft_technique",
    label: "Craft Technique",
    description:
      "How the design was put on the cloth. Tie & Dye deliberately omitted — see decision 0001.",
    values: plain(
      "3D Print",
      "Ajrakh",
      "Anchor Thread Work",
      "Applique",
      "Bagru",
      "Bandhani",
      "Batik",
      "Block Print",
      "Chikankari",
      "Cut Work",
      "Digital Print",
      "Discharge Print",
      "Embroidery",
      "Hand Painting",
      "Kalamkari",
      "Kantha Work",
      "Knot Work",
      "Madhubani",
      "Marble Print",
      "Mirror Work",
      "Patch Work",
      "Screen Print",
      "Sequins",
      "Shibori",
      "Thread Work",
      "Zari Work",
    ),
  },
  {
    code: "craft_sub_type",
    label: "Craft Sub Type",
    description: "Branches of Kalamkari. Applies only when Craft Technique is Kalamkari.",
    values: plain("Pen (Srikalahasti)", "Block / Vanaspathi (Machilipatnam)"),
  },
  {
    code: "regional_style",
    label: "Regional Style",
    description: "The weaving region or tradition the piece belongs to.",
    values: plain(
      "Banarasi",
      "Bhagalpuri",
      "Chanderi",
      "Chennuri",
      "Chettinad",
      "Devagiri",
      "Gadwal",
      "Ikat",
      "Jamdani",
      "Kanchipuram",
      "Kashmiri",
      "Kota Doria",
      "Maheshwari",
      "Mangalagiri",
      "Narayanpet",
      "Nellore",
      "Nizam",
      "Paithani",
      "Pochampally",
      "Sambalpuri",
      "Srikalahasti",
      "Sungudi",
      "Venkatagiri",
    ),
  },
  {
    code: "motif",
    label: "Motif",
    description:
      "Row-aligned with Motif Belongs To in the workbook, so each motif states its category.",
    parentList: "motif_category",
    values: [
      { label: "Bapu Bomma", parent: "Figures & Idols" },
      { label: "Buddha", parent: "Figures & Idols" },
      { label: "Climbers", parent: "Floral" },
      { label: "Deer", parent: "Fauna" },
      { label: "Devi", parent: "Figures & Idols" },
      { label: "Elephant", parent: "Fauna" },
      { label: "Fish", parent: "Fauna" },
      { label: "Flowers", parent: "Floral" },
      { label: "Ghatotkacha", parent: "Mythology & Story" },
      { label: "Hands", parent: "Objects" },
      { label: "Ladies", parent: "Figures & Idols" },
      { label: "Leaf", parent: "Floral" },
      { label: "Lotus", parent: "Floral" },
      { label: "Nandi", parent: "Fauna" },
      { label: "Palanquin", parent: "Objects" },
      { label: "Peacock", parent: "Birds" },
      { label: "Raja Rani", parent: "Figures & Idols" },
      { label: "Snail", parent: "Fauna" },
      { label: "Sparrows", parent: "Birds" },
      { label: "Story", parent: "Mythology & Story" },
      { label: "Swan", parent: "Birds" },
      { label: "Swastika", parent: "Geometric" },
      { label: "Tabla", parent: "Music Instruments" },
      { label: "Tarpanam", parent: "Mythology & Story" },
      { label: "Trees", parent: "Floral" },
      { label: "Veena", parent: "Music Instruments" },
      { label: "Waves", parent: "Geometric" },
    ],
  },
  {
    code: "border_style",
    label: "Border Style",
    description:
      "Retired in favour of Border Height, which covers the same ground in contiguous bands. Kept because existing designs carry these values.",
    // Seeded retired. The list overlapped Border Height and only one was
    // wanted; the values remain so that designs already carrying them still
    // read, which is the whole point of retiring rather than deleting.
    values: [
      { label: "Khaddi", retired: true },
      { label: "Zari", retired: true },
      { label: "Gap", retired: true },
      { label: "Temple", retired: true },
    ],
  },
  {
    code: "border_height",
    label: "Border Height",
    description:
      "Contiguous bands. The original 2-3 / 4-5 / 6-8 inch left 3-4, 5-6 and over-8 unclassifiable.",
    values: plain("Up to 3 inch", "3-5 inch", "5-8 inch", "Above 8 inch"),
  },
  {
    code: "saree_layout",
    label: "Saree Layout",
    description: "Saree only. Renamed from Saree - Main Part; describes layout, not a part.",
    values: plain("All Over", "Half and Half", "Plain (No Design)", "Scattered Buta"),
  },
  {
    code: "pallu_design",
    label: "Pallu Design",
    description:
      "Saree only. The column arrived empty — all five values are PROPOSED, to confirm or replace.",
    values: [
      { label: "Plain Pallu", proposed: true },
      { label: "Zari Pallu", proposed: true },
      { label: "Contrast Pallu", proposed: true },
      { label: "Woven Motif Pallu", proposed: true },
      { label: "Same as Border", proposed: true },
    ],
  },
  {
    code: "blouse_available",
    label: "Blouse Available",
    description: "Saree only. Gates Blouse Status and Blouse Material.",
    isSystem: true,
    values: plain("Yes", "No"),
  },
  {
    code: "blouse_status",
    label: "Blouse Status",
    description: "Not Applicable added for when Blouse Available is No.",
    values: plain("Stitched", "UnStitched", "Not Applicable"),
  },
  {
    code: "blouse_material",
    label: "Blouse Material",
    description: "Deliberately reuses Cotton / Silk / Rayon from Fibre Type.",
    values: plain("Cotton", "Silk", "Rayon", "Not Applicable"),
  },
  {
    code: "colour",
    label: "Colour",
    description:
      "Swatches are resolved from the name, so a new colour gets one without anyone picking a hex. Four web-palette names are flagged NEEDS REVIEW.",
    values: [
      { label: "beige" },
      { label: "black" },
      { label: "blue" },
      { label: "bottle green", meta: { hex: "#0B4F2C" } },
      { label: "brown" },
      { label: "chartreuse", needsReview: true },
      { label: "cream", meta: { hex: "#F0E4C8" } },
      { label: "dark blue" },
      { label: "dark gray" },
      { label: "dark green" },
      { label: "dark magenta" },
      { label: "dark olive green" },
      { label: "dark orange" },
      { label: "dark sea green", needsReview: true },
      { label: "dark slate blue", needsReview: true },
      { label: "deep pink" },
      { label: "ghost white", needsReview: true },
      { label: "golden", meta: { hex: "#D4AF37" } },
      { label: "gray" },
      { label: "green" },
      { label: "hot pink" },
      { label: "indigo" },
      { label: "lavender" },
      { label: "light pink" },
      { label: "light sky blue" },
      { label: "magenta" },
      { label: "maroon" },
      { label: "multicolour", meta: { hex: "#B23A26" } },
      { label: "mustard", meta: { hex: "#C9A227" } },
      { label: "navy" },
      { label: "off white", meta: { hex: "#F4F0E6" } },
      { label: "olive" },
      { label: "orange" },
      { label: "peach", meta: { hex: "#FFCBA4" } },
      { label: "pink" },
      { label: "purple" },
      { label: "red" },
      { label: "rust", meta: { hex: "#B7410E" } },
      { label: "silver" },
      { label: "sky blue" },
      { label: "teal" },
      { label: "turquoise" },
      { label: "white" },
      { label: "yellow" },
    ],
  },
  {
    code: "descriptor",
    label: "Descriptor",
    description:
      "Sales words, size words and duplicates of other columns were removed.",
    values: plain(
      "contrast",
      "designer",
      "fancy",
      "pure",
      "raw",
      "royal",
      "semi",
      "soft",
      "special",
      "straight",
      "stretchable",
      "traditional",
    ),
  },

  {
    code: "garment_type",
    label: "Garment Type",
    description:
      "Garments sheet. All sold by the piece; some are multi-piece sets, carried in meta.pieces.",
    parentList: "uom",
    values: [
      { label: "Shirts", parent: "Piece" },
      { label: "Tops", parent: "Piece" },
      { label: "Frocks", parent: "Piece" },
      { label: "Kurthi", parent: "Piece" },
      { label: "Suit Sets", parent: "Piece", meta: { pieces: "2 or 3" } },
      { label: "Coord Sets", parent: "Piece", meta: { pieces: "2" } },
      { label: "Lehanga Sets", parent: "Piece", meta: { pieces: "2 or 3" } },
      { label: "Crop Tops Sets", parent: "Piece", meta: { pieces: "2" } },
      { label: "Skirts", parent: "Piece" },
      { label: "Palazoos", parent: "Piece" },
      { label: "Patiala Sets", parent: "Piece", meta: { pieces: "2" } },
      { label: "Kurtha", parent: "Piece" },
    ],
  },
  {
    code: "home_product_type",
    label: "Home Product Type",
    description: "Home and Life Style sheet. All sold by the piece.",
    parentList: "uom",
    values: [
      { label: "Table Mats", parent: "Piece" },
      { label: "Runners", parent: "Piece" },
      { label: "Naphkin", parent: "Piece" },
      { label: "Chair Covers", parent: "Piece" },
      { label: "Deewan Sets", parent: "Piece" },
    ],
  },
  {
    code: "home_weaving_category",
    label: "Home Weaving Category",
    description: "Home and Life Style sheet. The workbook holds one value.",
    values: plain("Crochets"),
  },
];

/**
 * Columns the workbook defines but leaves empty. They exist as lists so the
 * Values screen can be filled in later, at which point the Add Stock form
 * turns each from free text into a dropdown without a code change.
 */
export const EMPTY_LISTS: SeedList[] = [
  ...[
    "Size",
    "Colors",
    "Audience",
    "Lining",
    "Sleeve Length",
    "Collar Type",
    "Length",
    "Neck Type",
    "Chest",
    "Style",
    "Waist",
  ].map((column) => ({
    code: `garment_${column.toLowerCase().replace(/\s+/g, "_")}`,
    label: `Garment · ${column}`,
    description: "Garments sheet column. Arrived empty — free text until it has values.",
    values: [],
  })),
  ...["Length", "Width", "Color"].map((column) => ({
    code: `home_${column.toLowerCase()}`,
    label: `Home · ${column}`,
    description:
      "Home and Life Style sheet column. Arrived empty — free text until it has values.",
    values: [],
  })),
];

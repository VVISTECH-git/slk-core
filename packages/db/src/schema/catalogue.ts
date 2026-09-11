import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { actor } from "./access";
import { lookupValue } from "./lookup";

/**
 * The catalogue, in the shape the prototype settled on:
 *
 *   DESIGN     what it is — the whole taxonomy lives here
 *     COLOURWAY  design + colour; priced, the sellable line
 *       PIECE      one physical object (serialised product types only)
 *         MOVEMENT   the only thing that ever changes a quantity
 *
 * Stock on hand is always derived from movements and never stored.
 *
 * Every taxonomy field is a reference to `lookup_value`, never the word
 * itself, so renaming a value updates every record at once. The two sheets
 * whose columns arrived empty — Garments and Home and Life Style — go in
 * `extra` instead, because those genuinely change shape.
 */

/** A reference into the lookup master. Nullable: most attributes are optional. */
const attr = (column: string) =>
  uuid(column).references(() => lookupValue.id, { onDelete: "restrict" });

export const location = pgTable(
  "location",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull(),
    name: text("name").notNull(),

    /**
     * Stock we own sits in internal locations. PRODUCTION, CUSTOMER and SCRAP
     * are external, which is what makes "how many do we have" answerable as
     * one sum rather than a list of special cases.
     */
    isInternal: boolean("is_internal").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("location_code_key").on(t.code)],
);

export const design = pgTable(
  "design",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    /**
     * TYPE-REGION-FIBRE-SEQ, e.g. SAR-SRI-SIL-0001. Built once at creation
     * from abbreviations and then frozen: it is printed on the QR label, so
     * renaming a taxonomy value must never move it.
     */
    code: text("code").notNull(),
    seq: integer("seq").notNull(),

    /** Composed from the taxonomy, unless someone typed over it. */
    name: text("name").notNull(),
    nameIsCustom: boolean("name_is_custom").notNull().default(false),

    industryId: attr("industry_id"),
    productTypeId: attr("product_type_id"),
    garmentTypeId: attr("garment_type_id"),
    homeProductTypeId: attr("home_product_type_id"),
    homeWeavingCategoryId: attr("home_weaving_category_id"),
    productionMethodId: attr("production_method_id"),
    weaveStructureId: attr("weave_structure_id"),
    fibreTypeId: attr("fibre_type_id"),
    /**
     * What the cloth is — Mul Mul, Katan, Georgette.
     *
     * One column where there were three. The three below asked the same
     * question split by fibre, and two of them could never both apply; they
     * stay because records still carry their values, and their lists are
     * switched off so nothing new is written to them.
     */
    textileMaterialId: attr("textile_material_id"),
    silkSubFamilyId: attr("silk_sub_family_id"),
    cottonSubFamilyId: attr("cotton_sub_family_id"),
    fabricTypeId: attr("fabric_type_id"),
    audienceTypeId: attr("audience_type_id"),
    craftTechniqueId: attr("craft_technique_id"),
    craftSubTypeId: attr("craft_sub_type_id"),
    regionalStyleId: attr("regional_style_id"),
    motifCategoryId: attr("motif_category_id"),
    motifId: attr("motif_id"),
    borderStyleId: attr("border_style_id"),
    borderHeightId: attr("border_height_id"),
    sareeLayoutId: attr("saree_layout_id"),

    /**
     * How the design sits on the cloth, and how the blouse relates to it.
     *
     * Saree Style holds what Product Sub Type was carrying — a layout is not
     * a sub type of anything — and supersedes Saree Layout, which asked the
     * same question with one value missing.
     */
    sareeStyleId: attr("saree_style_id"),
    blouseStyleId: attr("blouse_style_id"),

    /**
     * Where a motif appears, and what kind of border the blouse has.
     *
     * All three draw on lists that already exist — a motif on the blouse is
     * a motif, and a blouse border has the styles a saree border has. The
     * question is placement, not vocabulary.
     */
    palluMotifId: attr("pallu_motif_id"),
    borderMotifId: attr("border_motif_id"),
    sareeBodyMotifId: attr("saree_body_motif_id"),
    blouseMotifId: attr("blouse_motif_id"),
    blouseBorderId: attr("blouse_border_id"),
    palluDesignId: attr("pallu_design_id"),
    blouseAvailableId: attr("blouse_available_id"),
    blouseStatusId: attr("blouse_status_id"),
    blouseMaterialId: attr("blouse_material_id"),
    descriptorId: attr("descriptor_id"),
    uomId: attr("uom_id"),

    /**
     * Identity and sourcing — who this is from, and where "what was actually
     * asked for" is kept, apart from "what was actually entered", so a
     * review screen can show the two side by side. `sourceAttributes` is
     * deliberately unstructured: it holds whatever a reference listing
     * said, typed in by hand, not a second copy of the taxonomy.
     */
    shortName: text("short_name"),
    brandId: attr("brand_id"),
    collectionId: attr("collection_id"),
    supplierId: attr("supplier_id"),
    sourceUrl: text("source_url"),
    sourceSku: text("source_sku"),
    sourceAttributes: jsonb("source_attributes").notNull().default({}),
    countryOfOriginId: attr("country_of_origin_id"),

    /**
     * Technique detail beyond Craft Technique/Craft Sub Type — how the cloth
     * was printed, dyed, woven or embroidered, and who made it, as distinct
     * questions rather than folded into one. Region and weave structure are
     * not repeated here: `regionalStyleId` and `weaveStructureId` above
     * already answer Craft Region and Weaving technique.
     */
    printTechniqueId: attr("print_technique_id"),
    dyeTechniqueId: attr("dye_technique_id"),
    embroideryTechniqueId: attr("embroidery_technique_id"),
    artisanClusterId: attr("artisan_cluster_id"),

    /** Appearance facts a shopper asks about that are not a colour or a motif. */
    patternId: attr("pattern_id"),
    textureId: attr("texture_id"),
    finishId: attr("finish_id"),
    /** Promotes what used to be free text in `extra.transparency` to a filterable list. */
    transparencyId: attr("transparency_id"),

    /** Category-specific classifications that are filterable, not just a measurement. */
    bedSizeId: attr("bed_size_id"),
    ageGroupId: attr("age_group_id"),
    sleeveTypeId: attr("sleeve_type_id"),
    closureTypeId: attr("closure_type_id"),
    fitTypeId: attr("fit_type_id"),
    fringeTypeId: attr("fringe_type_id"),
    stylingTypeId: attr("styling_type_id"),

    /** GST rate lives in this value's own `meta`, the same place colour keeps its hex. */
    taxCategoryId: attr("tax_category_id"),
    /** The design-level default; `batch.hsnCode` stays the per-consignment override. */
    hsnCode: text("hsn_code"),

    /** Never sent to Shopify unless set — `vendorFor()`/composed title/description still apply. */
    seoTitle: text("seo_title"),
    seoDescription: text("seo_description"),
    handleBase: text("handle_base"),
    /** Manual tags on top of whatever `listingTags()` already composes. */
    extraTags: jsonb("extra_tags").notNull().default([]),

    /**
     * Sarees are tracked per physical piece; other product types use a pooled
     * quantity. Defaulted from the product type at creation and overridable
     * per design, exactly as the prototype allows.
     */
    isSerialised: boolean("is_serialised").notNull().default(false),

    /**
     * The Garments and Home and Life Style columns that arrived empty —
     * Size, Colors, Sleeve Length, Length, Width. Free text until those
     * lookup lists have values, at which point they become dropdowns with no
     * migration.
     */
    extra: jsonb("extra").notNull().default({}),

    notes: text("notes"),
    status: text("status").notNull().default("active"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("design_code_key").on(t.code),
    index("design_product_type_idx").on(t.productTypeId),
    index("design_craft_technique_idx").on(t.craftTechniqueId),
    index("design_regional_style_idx").on(t.regionalStyleId),
  ],
);

/**
 * The adjectives a design carries — Soft, Pure, Traditional.
 *
 * The one attribute that is genuinely a set. Every other question the
 * catalogue asks has exactly one answer, so it lives in a column on `design`;
 * this one had a column too, and a saree could be Soft or Pure but never
 * both, which made whoever filed it choose half the truth.
 *
 * Cascades from the design and restricts from the value: deleting a design
 * takes its descriptors with it, and deleting a descriptor that designs still
 * carry is refused — the same protection the columns get from their own
 * foreign keys.
 */
export const designDescriptor = pgTable(
  "design_descriptor",
  {
    designId: uuid("design_id")
      .notNull()
      .references(() => design.id, { onDelete: "cascade" }),
    descriptorId: uuid("descriptor_id")
      .notNull()
      .references(() => lookupValue.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.designId, t.descriptorId] }),
    index("design_descriptor_value_idx").on(t.descriptorId),
  ],
);

/**
 * Handmade, Handloom, Hand block printed, Natural dyed, Artisan made, Hand
 * embroidered, Minor handmade variations expected — the trust claims a
 * listing makes about how a piece was made.
 *
 * Design-scoped, not colourway-scoped, on purpose: a claim like this
 * describes the physical technique behind a weave or a print run, which
 * does not change between one colourway of a design and the next. The
 * review pipeline and the Sales Story/Care content that genuinely do differ
 * per colour live on `colourway` instead — see migration 0053's own
 * comment.
 *
 * Same shape as `designDescriptor` above, and the same reasoning: a design
 * can honestly carry more than one of these, so it is a set, not a column.
 */
export const designClaim = pgTable(
  "design_claim",
  {
    designId: uuid("design_id")
      .notNull()
      .references(() => design.id, { onDelete: "cascade" }),
    claimId: uuid("claim_id")
      .notNull()
      .references(() => lookupValue.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.designId, t.claimId] }),
    index("design_claim_value_idx").on(t.claimId),
  ],
);

export const colourway = pgTable(
  "colourway",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    designId: uuid("design_id")
      .notNull()
      .references(() => design.id, { onDelete: "cascade" }),
    /**
     * The primary colour. Not unique with the design — hand-done work means
     * two arrivals in the same nominal colour are not the same physical
     * piece, and each gets its own colourway, own photos, own Product Code.
     * The Product Code on the consignment it receives is what's actually
     * unique; colour here is a description, not an identity.
     */
    colourId: attr("colour_id"),
    /** A contrast pallu, a border in another shade. Not part of the identity. */
    secondaryColourId: attr("secondary_colour_id"),

    /**
     * The five prices the prototype carries, in paise. Integers, never floats
     * — a rupee is 100 paise and rounding a price is always a bug.
     * `retail` is what stock value is calculated from.
     */
    costMinor: bigint("cost_minor", { mode: "number" }),
    makingMinor: bigint("making_minor", { mode: "number" }),
    wholesaleMinor: bigint("wholesale_minor", { mode: "number" }),
    retailMinor: bigint("retail_minor", { mode: "number" }),
    mrpMinor: bigint("mrp_minor", { mode: "number" }),
    currency: text("currency").notNull().default("INR"),

    isActive: boolean("is_active").notNull().default(true),

    /**
     * Taxable, tracked, and continue-selling-out-of-stock are per-colourway
     * because a channel's inventory policy is a fact about a specific
     * sellable line, not about the design it was cut or printed from.
     */
    isTaxable: boolean("is_taxable").notNull().default(true),
    tracksInventory: boolean("tracks_inventory").notNull().default(true),
    continueSellingOos: boolean("continue_selling_oos")
      .notNull()
      .default(false),

    /**
     * Editorial review, not the same thing as `isActive` above. `isActive`
     * says whether this colour still sells at all; `reviewStatus` says
     * whether what is entered for it has been checked before it is allowed
     * to reach Shopify. An archived colourway was presumably approved once;
     * a freshly drafted one is neither active-false nor approved — the two
     * facts are orthogonal on purpose, see migration 0052's own comment.
     */
    reviewStatus: text("review_status").notNull().default("draft"),
    createdBy: uuid("created_by_id").references(() => actor.id, {
      onDelete: "restrict",
    }),
    updatedBy: uuid("updated_by_id").references(() => actor.id, {
      onDelete: "restrict",
    }),
    submittedBy: uuid("submitted_by_id").references(() => actor.id, {
      onDelete: "restrict",
    }),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    reviewedBy: uuid("reviewed_by_id").references(() => actor.id, {
      onDelete: "restrict",
    }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("colourway_design_idx").on(t.designId),
    index("colourway_review_status_idx").on(t.reviewStatus, t.updatedAt),
    check(
      "colourway_review_status_known",
      sql`${t.reviewStatus} in ('draft', 'submitted', 'needs_changes', 'approved')`,
    ),
  ],
);

/**
 * The merchandising copy behind one colourway — the answers a good
 * salesperson would give in person, asked as structured questions instead
 * of one description box, plus what those answers compose into.
 *
 * One row per colourway, not per design: two colours of the same weave can
 * honestly read differently ("the indigo drapes darker, pairs with...").
 * The eight `q*` columns are what was typed; the seven prose columns are
 * generated from them by deterministic template composition (see
 * `listingBody()` in @slk/domain) and then freely hand-edited — a record
 * with no story still composes exactly the plain `listingDescription()`
 * paragraph it always has, this is additive, never a replacement path.
 * `generatedFingerprint` lets the UI say "the answers changed since this
 * was last generated" without a second, separate change-tracking table.
 */
export const colourwayStory = pgTable("colourway_story", {
  colourwayId: uuid("colourway_id")
    .primaryKey()
    .references(() => colourway.id, { onDelete: "cascade" }),

  qSpecial: text("q_special"),
  qFeel: text("q_feel"),
  qOccasions: text("q_occasions"),
  qRecommendTo: text("q_recommend_to"),
  qStyling: text("q_styling"),
  qIncluded: text("q_included"),
  qBeforeBuying: text("q_before_buying"),
  qWhyBuy: text("q_why_buy"),

  shortDescription: text("short_description"),
  fullDescription: text("full_description"),
  whyLove: text("why_love"),
  craftStory: text("craft_story"),
  stylingSuggestions: text("styling_suggestions"),
  productDetails: text("product_details"),
  customerNotes: text("customer_notes"),

  generatedAt: timestamp("generated_at", { withTimezone: true }),
  generatedFingerprint: text("generated_fingerprint"),
  editedBy: uuid("edited_by_id").references(() => actor.id, {
    onDelete: "restrict",
  }),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * The care instructions behind one colourway — structured, not buried in
 * the internal Notes field the way care advice used to be typed. The
 * wash/dry/iron methods are lookup-backed because "Dry clean only" is a
 * fixed vocabulary a filter or a report can use; the three warnings are
 * booleans because they are genuinely yes/no facts with no vocabulary to
 * maintain.
 */
export const colourwayCare = pgTable("colourway_care", {
  colourwayId: uuid("colourway_id")
    .primaryKey()
    .references(() => colourway.id, { onDelete: "cascade" }),

  washMethodId: attr("wash_method_id"),
  waterTempId: attr("water_temp_id"),
  detergentId: attr("detergent_id"),
  dryingId: attr("drying_id"),
  ironingId: attr("ironing_id"),

  dryCleanRequired: boolean("dry_clean_required").notNull().default(false),
  colourBleedWarning: boolean("colour_bleed_warning").notNull().default(false),
  shrinkageWarning: boolean("shrinkage_warning").notNull().default(false),

  storageNote: text("storage_note"),
  /** The customer-facing one — internal `notes` on `design` stays separate and unread by anyone but staff. */
  specialNotes: text("special_notes"),

  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * One consignment of one colourway — what arrived, on a day, into a place.
 *
 * The design code describes what somebody entered and repeats; two people
 * looking at the same Kalamkari saree will name different motifs, and SLK's
 * rule is that whatever they enter is accepted rather than argued over. So
 * identity comes from counting instead:
 *
 *   design code   what it is, as entered. Repeats. Internal.
 *   product code  this consignment. The same goods next month get another.
 *   item code     one physical saree.
 *
 * Ten pieces arriving on Tuesday are one product code and ten item codes.
 */
export const batch = pgTable(
  "batch",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    colourwayId: uuid("colourway_id")
      .notNull()
      .references(() => colourway.id, { onDelete: "restrict" }),

    /** 300001 and up, from a sequence. Assigned once, never recomputed. */
    code: text("code").notNull(),

    /**
     * What was counted in. The ledger remains the authority on how much is on
     * hand now; this is what arrived that day and does not change afterwards.
     */
    qty: integer("qty").notNull(),
    locationId: uuid("location_id").references(() => location.id, {
      onDelete: "restrict",
    }),

    /**
     * What this consignment sells for, where it differs from the line.
     *
     * Handloom does not repeat. The indigo in March is not the indigo in July,
     * the cotton costs what it costs that month, and two runs of the same teal
     * saree can be worth different money — which is also why each consignment
     * is listed separately rather than as a variant.
     *
     * Null inherits the colourway's price, so a consignment carries one only
     * when this cloth is genuinely worth something else. Read them through the
     * `batch_price` view rather than coalescing at each call site; three copies
     * of that rule is how one of them ends up disagreeing.
     */
    costMinor: bigint("cost_minor", { mode: "number" }),
    makingMinor: bigint("making_minor", { mode: "number" }),
    wholesaleMinor: bigint("wholesale_minor", { mode: "number" }),
    retailMinor: bigint("retail_minor", { mode: "number" }),
    mrpMinor: bigint("mrp_minor", { mode: "number" }),

    receivedAt: timestamp("received_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    reference: text("reference"),
    note: text("note"),

    /**
     * What the storefront calls this consignment, when the composed name is
     * not the one to read.
     *
     * Null composes from the design and its colour. The override is for the
     * run that needs a hand — a festival edition, a collaboration, a name the
     * taxonomy cannot reach.
     */
    title: text("title"),

    /**
     * The shopper-facing paragraph. Null composes from the taxonomy.
     *
     * Distinct from `note` directly above, which is internal and says why a
     * delivery was short. This is the only text on the record written to be
     * read by somebody deciding whether to buy.
     */
    description: text("description"),

    /** Grams. Shipping is priced by weight, and a saree runs 400 to 900. */
    weightGrams: integer("weight_grams"),

    /** Scanned, not typed twice — the code print-ready packaging reads. */
    barcode: text("barcode"),
    /** Centimetres, one decimal — what a shipping-rate calculation needs beyond weight. */
    packageLengthCm: numeric("package_length_cm", { precision: 6, scale: 1 }),
    packageWidthCm: numeric("package_width_cm", { precision: 6, scale: 1 }),
    packageHeightCm: numeric("package_height_cm", { precision: 6, scale: 1 }),

    /**
     * The HSN code this consignment is invoiced under. Handloom is not all one
     * code and GST is charged on it, so it belongs on the thing being sold
     * rather than assumed across the catalogue.
     */
    hsnCode: text("hsn_code"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("batch_code_key").on(t.code),
    index("batch_colourway_idx").on(t.colourwayId, t.receivedAt),
  ],
);

export const piece = pgTable(
  "piece",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    colourwayId: uuid("colourway_id")
      .notNull()
      .references(() => colourway.id, { onDelete: "cascade" }),

    /**
     * The consignment it arrived in, so a piece can name where it came
     * from. Nullable for the pieces that predate consignments.
     */
    batchId: uuid("batch_id").references((): AnyPgColumn => batch.id, {
      onDelete: "restrict",
    }),

    /** The item code — 500001 and up, printed on the QR label. Frozen. */
    code: text("code").notNull(),
    serial: integer("serial").notNull(),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("piece_code_key").on(t.code),
    index("piece_colourway_idx").on(t.colourwayId),
  ],
);

export const image = pgTable(
  "image",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    colourwayId: uuid("colourway_id")
      .notNull()
      .references(() => colourway.id, { onDelete: "cascade" }),

    /**
     * Which photograph this is — Body, Pallu, Border, Blouse, or whatever
     * else SLK adds. A lookup value rather than free text, so the list is
     * maintained on Master Lists instead of in this file.
     */
    slotId: attr("slot_id"),

    /**
     * Null until a photograph exists.
     *
     * Choosing which pictures a product needs and taking them are different
     * acts, days apart and often different people. A row with a slot and no
     * file is the list of what is still to be shot.
     */
    storageKey: text("storage_key"),
    width: integer("width"),
    height: integer("height"),
    sortOrder: integer("sort_order").notNull().default(0),

    /**
     * What the photograph shows, for a reader who cannot see it.
     *
     * Null composes from the product, its colour and the slot — "Teal
     * Kalamkari Cotton Saree, pallu" — which is better than the empty string
     * every image would otherwise carry, and better than most alt text
     * anybody types at four in the afternoon with forty more to upload.
     */
    alt: text("alt"),

    /**
     * Which photograph is the main one — the tile shown in the catalogue
     * table and the first image on Shopify. At most one per colourway; see
     * the partial unique index below. A colourway with none picked falls
     * back to whatever `sortOrder` already put first, same as before this
     * column existed.
     */
    isPrimary: boolean("is_primary").notNull().default(false),
    /** "Supplier image" / "In-house" / "Artisan photo" — not shown to a customer, for the catalogue's own records. */
    sourceNote: text("source_note"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("image_colourway_slot_key").on(t.colourwayId, t.slotId),
    index("image_colourway_idx").on(t.colourwayId),
    uniqueIndex("image_one_primary_per_colourway")
      .on(t.colourwayId)
      .where(sql`${t.isPrimary}`),
  ],
);

/**
 * The ledger. Append-only: a mistake is corrected by appending its reverse,
 * never by editing or deleting a row. The immutability trigger and the REVOKE
 * that enforce this live in a hand-written migration alongside the generated
 * one.
 */
export const movement = pgTable(
  "movement",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),

    colourwayId: uuid("colourway_id")
      .notNull()
      .references(() => colourway.id, { onDelete: "restrict" }),
    pieceId: uuid("piece_id").references(() => piece.id, {
      onDelete: "restrict",
    }),

    /**
     * Who recorded it.
     *
     * The question asked when a floor count and the system disagree is not
     * "when did this go wrong" but "who was counting", and until this column
     * the ledger could not answer it. Null for everything written before the
     * portal had a sign-in: a blank is honest, and a default would attribute
     * last month's deliveries to whoever signs in next.
     */
    actorId: uuid("actor_id").references(() => actor.id, {
      onDelete: "restrict",
    }),

    /**
     * Always positive. Direction lives in from/to rather than in a sign,
     * so a transfer is one row and there is no convention to get backwards.
     */
    qty: integer("qty").notNull(),

    kind: text("kind").notNull(),

    /**
     * The consignment this movement recorded the arrival of.
     *
     * Only ever set on a `received` movement — selling or transferring moves
     * stock that already exists, and the saree keeps the codes it arrived
     * with. Nullable because everything before consignments existed has none,
     * and inventing one would be inventing a delivery.
     */
    batchId: uuid("batch_id").references((): AnyPgColumn => batch.id, {
      onDelete: "restrict",
    }),

    fromLocationId: uuid("from_location_id").references(() => location.id, {
      onDelete: "restrict",
    }),
    toLocationId: uuid("to_location_id").references(() => location.id, {
      onDelete: "restrict",
    }),

    /** When it happened on the floor, against when it was typed in. */
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),

    reason: text("reason"),
    reference: text("reference"),
    note: text("note"),

    /** Makes a webhook delivered twice a no-op rather than a double count. */
    idempotencyKey: text("idempotency_key"),
  },
  (t) => [
    uniqueIndex("movement_idempotency_key").on(t.idempotencyKey),
    index("movement_colourway_idx").on(t.colourwayId, t.occurredAt),
    index("movement_piece_idx").on(t.pieceId),
    // Asked as "what has this person been doing", never as a filter on a
    // scan, so it reads by actor and then by time.
    index("movement_actor_idx").on(t.actorId, t.occurredAt),
  ],
);

export type Location = typeof location.$inferSelect;
export type Design = typeof design.$inferSelect;
export type DesignDescriptor = typeof designDescriptor.$inferSelect;
export type DesignClaim = typeof designClaim.$inferSelect;
export type Colourway = typeof colourway.$inferSelect;
export type ColourwayStory = typeof colourwayStory.$inferSelect;
export type ColourwayCare = typeof colourwayCare.$inferSelect;
export type Batch = typeof batch.$inferSelect;
export type Piece = typeof piece.$inferSelect;
export type Image = typeof image.$inferSelect;
export type Movement = typeof movement.$inferSelect;

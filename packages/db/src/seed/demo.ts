import { eq, sql } from "drizzle-orm";

import { designCode, designName, pieceCode } from "@slk/domain";

import type { Database } from "../client";
import {
  colourway,
  design,
  location,
  lookupList,
  lookupValue,
  movement,
  piece,
} from "../schema/index";

/**
 * Sample stock, so the ops screens have something real to show before SLK's
 * own catalogue is loaded.
 *
 * Every attribute is a genuine value from `Master Listing - New.xlsx` — no
 * invented taxonomy — so what appears on screen is the vocabulary SLK will
 * actually use. Quantities and prices are made up and are not real trading
 * figures.
 *
 * Separate from `db:seed` on purpose: the vocabulary belongs in every
 * database, this does not.
 */

const LOCATIONS = [
  { code: "WH-MAIN", name: "Warehouse", isInternal: true, sortOrder: 0 },
  { code: "SHOP-01", name: "Retail Unit 1", isInternal: true, sortOrder: 1 },
  { code: "SHOP-02", name: "Retail Unit 2", isInternal: true, sortOrder: 2 },
  { code: "PRODUCTION", name: "Production", isInternal: false, sortOrder: 10 },
  { code: "CUSTOMER", name: "Customer", isInternal: false, sortOrder: 11 },
  { code: "SCRAP", name: "Scrap", isInternal: false, sortOrder: 12 },
];

interface DemoDesign {
  productType: string;
  industry: string;
  productionMethod?: string;
  fibreType?: string;
  silkSubFamily?: string;
  cottonSubFamily?: string;
  weaveStructure?: string;
  audienceType?: string;
  craftTechnique?: string;
  craftSubType?: string;
  regionalStyle?: string;
  motifCategory?: string;
  motif?: string;
  borderStyle?: string;
  borderHeight?: string;
  sareeLayout?: string;
  palluDesign?: string;
  blouseAvailable?: string;
  blouseStatus?: string;
  blouseMaterial?: string;
  descriptor?: string;
  garmentType?: string;
  colours: { colour: string; cost: number; retail: number; qty: number }[];
}

/** Prices in rupees here; stored as paise. */
const DESIGNS: DemoDesign[] = [
  {
    productType: "Saree",
    industry: "Clothing",
    productionMethod: "Handloom",
    fibreType: "Cotton",
    cottonSubFamily: "Mul Mul",
    weaveStructure: "Plain Weave",
    audienceType: "Women",
    craftTechnique: "Kalamkari",
    craftSubType: "Pen (Srikalahasti)",
    regionalStyle: "Srikalahasti",
    motifCategory: "Mythology & Story",
    motif: "Tarpanam",
    borderStyle: "Temple",
    borderHeight: "3-5 inch",
    sareeLayout: "All Over",
    palluDesign: "Woven Motif Pallu",
    blouseAvailable: "Yes",
    blouseStatus: "UnStitched",
    blouseMaterial: "Cotton",
    descriptor: "traditional",
    colours: [
      { colour: "indigo", cost: 3200, retail: 7800, qty: 6 },
      { colour: "maroon", cost: 3200, retail: 7800, qty: 4 },
      { colour: "mustard", cost: 3400, retail: 8200, qty: 3 },
    ],
  },
  {
    productType: "Saree",
    industry: "Clothing",
    productionMethod: "Handloom",
    fibreType: "Silk",
    silkSubFamily: "Pattu",
    weaveStructure: "Jacquard",
    audienceType: "Women",
    craftTechnique: "Zari Work",
    regionalStyle: "Kanchipuram",
    motifCategory: "Birds",
    motif: "Peacock",
    borderStyle: "Zari",
    borderHeight: "Above 8 inch",
    sareeLayout: "Half and Half",
    palluDesign: "Zari Pallu",
    blouseAvailable: "Yes",
    blouseStatus: "Stitched",
    blouseMaterial: "Silk",
    descriptor: "pure",
    colours: [
      { colour: "bottle green", cost: 14000, retail: 32000, qty: 2 },
      { colour: "deep pink", cost: 14000, retail: 32000, qty: 3 },
    ],
  },
  {
    productType: "Saree",
    industry: "Clothing",
    productionMethod: "Handloom",
    fibreType: "Sico (Silk-Cotton Blend)",
    weaveStructure: "Plain Weave",
    audienceType: "Women",
    craftTechnique: "Kantha Work",
    regionalStyle: "Gadwal",
    motifCategory: "Floral",
    motif: "Lotus",
    borderStyle: "Khaddi",
    borderHeight: "5-8 inch",
    sareeLayout: "Scattered Buta",
    palluDesign: "Contrast Pallu",
    blouseAvailable: "Yes",
    blouseStatus: "UnStitched",
    blouseMaterial: "Cotton",
    descriptor: "soft",
    colours: [
      { colour: "teal", cost: 5200, retail: 11500, qty: 5 },
      { colour: "rust", cost: 5200, retail: 11500, qty: 2 },
    ],
  },
  {
    productType: "Saree",
    industry: "Clothing",
    productionMethod: "Machine Made",
    fibreType: "Viscose",
    weaveStructure: "Plain Weave",
    audienceType: "Women",
    craftTechnique: "Digital Print",
    regionalStyle: "Pochampally",
    motifCategory: "Geometric",
    motif: "Waves",
    borderStyle: "Gap",
    borderHeight: "Up to 3 inch",
    sareeLayout: "All Over",
    palluDesign: "Plain Pallu",
    blouseAvailable: "No",
    blouseStatus: "Not Applicable",
    blouseMaterial: "Not Applicable",
    descriptor: "fancy",
    colours: [
      { colour: "navy", cost: 900, retail: 2400, qty: 12 },
      { colour: "purple", cost: 900, retail: 2400, qty: 9 },
    ],
  },
  {
    productType: "Saree",
    industry: "Clothing",
    productionMethod: "Handloom",
    fibreType: "Cotton",
    cottonSubFamily: "Khadi",
    weaveStructure: "Plain Weave",
    audienceType: "Women",
    craftTechnique: "Ajrakh",
    regionalStyle: "Bhagalpuri",
    motifCategory: "Floral",
    motif: "Climbers",
    borderStyle: "Khaddi",
    borderHeight: "3-5 inch",
    sareeLayout: "All Over",
    palluDesign: "Same as Border",
    blouseAvailable: "Yes",
    blouseStatus: "UnStitched",
    blouseMaterial: "Cotton",
    descriptor: "raw",
    colours: [{ colour: "indigo", cost: 2800, retail: 6500, qty: 7 }],
  },
  {
    productType: "Dupatta",
    industry: "Clothing",
    productionMethod: "Handloom",
    fibreType: "Silk",
    silkSubFamily: "Tussar",
    audienceType: "Women",
    craftTechnique: "Block Print",
    regionalStyle: "Chanderi",
    motifCategory: "Floral",
    motif: "Flowers",
    borderStyle: "Zari",
    borderHeight: "Up to 3 inch",
    descriptor: "designer",
    colours: [
      { colour: "cream", cost: 700, retail: 1900, qty: 18 },
      { colour: "peach", cost: 700, retail: 1900, qty: 14 },
    ],
  },
  {
    productType: "Fabric",
    industry: "Clothing",
    productionMethod: "Handloom",
    fibreType: "Cotton",
    cottonSubFamily: "Mercerized",
    craftTechnique: "Bagru",
    regionalStyle: "Sungudi",
    motifCategory: "Floral",
    motif: "Leaf",
    descriptor: "special",
    colours: [
      { colour: "off white", cost: 180, retail: 420, qty: 240 },
      { colour: "olive", cost: 180, retail: 420, qty: 165 },
    ],
  },
  {
    productType: "Stolls",
    industry: "Clothing",
    productionMethod: "Machine Made",
    fibreType: "Modal",
    craftTechnique: "Shibori",
    regionalStyle: "Kota Doria",
    motifCategory: "Geometric",
    motif: "Waves",
    borderStyle: "Gap",
    descriptor: "contrast",
    colours: [{ colour: "turquoise", cost: 320, retail: 850, qty: 26 }],
  },
  {
    productType: "Bedsheets",
    industry: "Home & Lifestyle",
    productionMethod: "Machine Made",
    fibreType: "Cotton",
    cottonSubFamily: "Mercerized",
    craftTechnique: "Screen Print",
    regionalStyle: "Jamdani",
    motifCategory: "Village Life",
    descriptor: "royal",
    colours: [
      { colour: "sky blue", cost: 640, retail: 1550, qty: 22 },
      { colour: "beige", cost: 640, retail: 1550, qty: 16 },
    ],
  },
  {
    productType: "Fabric",
    industry: "Clothing",
    garmentType: "Kurthi",
    productionMethod: "Machine Made",
    fibreType: "Rayon",
    audienceType: "Women",
    craftTechnique: "Embroidery",
    regionalStyle: "Lucknowi" /* not in the workbook — resolves to null */,
    motifCategory: "Floral",
    motif: "Flowers",
    descriptor: "semi",
    colours: [{ colour: "light pink", cost: 450, retail: 1250, qty: 31 }],
  },
];

type Lookup = Map<string, Map<string, string>>;

async function loadLookups(db: Database): Promise<Lookup> {
  const rows = await db
    .select({
      listCode: lookupList.code,
      label: lookupValue.label,
      id: lookupValue.id,
    })
    .from(lookupValue)
    .innerJoin(lookupList, eq(lookupList.id, lookupValue.listId));

  const map: Lookup = new Map();

  for (const row of rows) {
    const list = map.get(row.listCode) ?? new Map<string, string>();
    list.set(row.label.toLowerCase(), row.id);
    map.set(row.listCode, list);
  }

  return map;
}

export interface DemoReport {
  designs: number;
  colourways: number;
  pieces: number;
  movements: number;
  unresolved: string[];
}

export async function loadDemoStock(db: Database): Promise<DemoReport> {
  const report: DemoReport = {
    designs: 0,
    colourways: 0,
    pieces: 0,
    movements: 0,
    unresolved: [],
  };

  for (const spec of LOCATIONS) {
    await db.insert(location).values(spec).onConflictDoNothing();
  }

  const locations = new Map(
    (await db.select().from(location)).map((l) => [l.code, l.id]),
  );

  const production = locations.get("PRODUCTION");
  const warehouse = locations.get("WH-MAIN");

  if (production === undefined || warehouse === undefined) {
    throw new Error("demo locations are missing");
  }

  const lookups = await loadLookups(db);

  /** Resolves a label to its id, recording anything the workbook does not have. */
  const ref = (listCode: string, label: string | undefined): string | null => {
    if (label === undefined) return null;

    const id = lookups.get(listCode)?.get(label.toLowerCase());

    if (id === undefined) {
      const note = `${listCode}: ${label}`;
      if (!report.unresolved.includes(note)) report.unresolved.push(note);
      return null;
    }

    return id;
  };

  const [existing] = await db
    .select({ max: sql<number>`coalesce(max(${design.seq}), 0)::int` })
    .from(design);

  let seq = existing?.max ?? 0;

  for (const spec of DESIGNS) {
    seq += 1;

    const code = designCode({
      productType: spec.productType,
      regionalStyle: spec.regionalStyle,
      fibreType: spec.fibreType,
      seq,
    });

    const name = designName(spec);

    const [row] = await db
      .insert(design)
      .values({
        code,
        seq,
        name,
        industryId: ref("industry", spec.industry),
        productTypeId: ref("product_type", spec.productType),
        garmentTypeId: ref("garment_type", spec.garmentType),
        productionMethodId: ref("production_method", spec.productionMethod),
        weaveStructureId: ref("weave_structure", spec.weaveStructure),
        fibreTypeId: ref("fibre_type", spec.fibreType),
        silkSubFamilyId: ref("silk_sub_family", spec.silkSubFamily),
        cottonSubFamilyId: ref("cotton_sub_family", spec.cottonSubFamily),
        audienceTypeId: ref("audience_type", spec.audienceType),
        craftTechniqueId: ref("craft_technique", spec.craftTechnique),
        craftSubTypeId: ref("craft_sub_type", spec.craftSubType),
        regionalStyleId: ref("regional_style", spec.regionalStyle),
        motifCategoryId: ref("motif_category", spec.motifCategory),
        motifId: ref("motif", spec.motif),
        borderStyleId: ref("border_style", spec.borderStyle),
        borderHeightId: ref("border_height", spec.borderHeight),
        sareeLayoutId: ref("saree_layout", spec.sareeLayout),
        palluDesignId: ref("pallu_design", spec.palluDesign),
        blouseAvailableId: ref("blouse_available", spec.blouseAvailable),
        blouseStatusId: ref("blouse_status", spec.blouseStatus),
        blouseMaterialId: ref("blouse_material", spec.blouseMaterial),
        descriptorId: ref("descriptor", spec.descriptor),
        uomId: ref("uom", spec.productType === "Fabric" ? "Metre" : "Piece"),
        // Sarees are tracked per piece; everything else pools.
        isSerialised: spec.productType === "Saree",
      })
      .returning();

    if (row === undefined) continue;
    report.designs += 1;

    for (const variant of spec.colours) {
      const [cw] = await db
        .insert(colourway)
        .values({
          designId: row.id,
          colourId: ref("colour", variant.colour),
          costMinor: variant.cost * 100,
          retailMinor: variant.retail * 100,
          mrpMinor: Math.round(variant.retail * 1.15) * 100,
          wholesaleMinor: Math.round(variant.retail * 0.72) * 100,
        })
        .returning();

      if (cw === undefined) continue;
      report.colourways += 1;

      const occurredAt = new Date(Date.UTC(2026, 7, 20, 6, 0, 0));

      if (row.isSerialised) {
        // Receiving serialised stock mints a piece and a movement per unit.
        for (let serial = 1; serial <= variant.qty; serial += 1) {
          const [p] = await db
            .insert(piece)
            .values({
              colourwayId: cw.id,
              code: pieceCode(code, variant.colour, serial),
              serial,
            })
            .returning();

          if (p === undefined) continue;
          report.pieces += 1;

          await db.insert(movement).values({
            colourwayId: cw.id,
            pieceId: p.id,
            qty: 1,
            kind: "received",
            fromLocationId: production,
            toLocationId: warehouse,
            occurredAt,
            reason: "New stock",
            note: `Tagged ${p.code}`,
          });
          report.movements += 1;
        }
      } else {
        await db.insert(movement).values({
          colourwayId: cw.id,
          qty: variant.qty,
          kind: "received",
          fromLocationId: production,
          toLocationId: warehouse,
          occurredAt,
          reason: "New stock",
        });
        report.movements += 1;
      }
    }
  }

  return report;
}

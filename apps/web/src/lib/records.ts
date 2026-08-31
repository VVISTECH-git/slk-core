import { sql } from "drizzle-orm";

import { db } from "@/lib/db";

/**
 * One row per colourway — the sellable line — with its design's attributes
 * flattened alongside it, which is how Product Records reads in the
 * prototype.
 *
 * Every attribute is a join to `lookup_value` rather than a stored word, so a
 * rename in the vocabulary shows up here on the next load with nothing else
 * to do.
 */
export type RecordRow = {
  id: string;
  designId: string;
  code: string;
  name: string;
  industry: string | null;
  productType: string | null;
  subType: string | null;
  productionMethod: string | null;
  fibreType: string | null;
  regionalStyle: string | null;
  craftTechnique: string | null;
  audienceType: string | null;

  /**
   * Everything else the design carries, so the Columns menu can offer it.
   *
   * Fetched whether or not a column is showing. Eleven more left joins on a
   * table of 227 lookup values costs about a millisecond — the list query
   * plans in 49ms and executes in 2 — and fetching on demand would mean a
   * round trip every time somebody ticks a box.
   */
  subFamily: string | null;
  weaveStructure: string | null;
  fabricType: string | null;
  craftSubType: string | null;
  motifCategory: string | null;
  motif: string | null;
  borderHeight: string | null;
  palluDesign: string | null;
  blouseAvailable: string | null;
  descriptor: string | null;

  /** The newest consignment of this colourway — 300001 and up. */
  productCode: string | null;
  /** Two letters from the motif category: Fauna FA, Birds BI. */
  motifCode: string | null;

  colour: string | null;
  colourHex: string | null;
  uom: string | null;
  isSerialised: boolean;
  quantity: number;
  priceMinor: number | null;
  costMinor: number | null;
  wholesaleMinor: number | null;
  mrpMinor: number | null;
  pieces: number;
};

export async function loadRecords(): Promise<RecordRow[]> {
  return db.execute<RecordRow>(sql`
    select
      cw.id                                             as id,
      d.id                                              as "designId",
      d.code                                            as code,
      d.name                                            as name,
      industry.label                                    as industry,
      product_type.label                                as "productType",
      coalesce(garment_type.label, weaving.label)       as "subType",
      production_method.label                           as "productionMethod",
      fibre.label                                       as "fibreType",
      region.label                                      as "regionalStyle",
      craft.label                                       as "craftTechnique",
      audience.label                                    as "audienceType",
      colour.label                                      as colour,
      colour.meta ->> 'hex'                             as "colourHex",
      motif_cat.meta ->> 'abbr'                          as "motifCode",
      latest.code                                       as "productCode",
      coalesce(silk_sub.label, cotton_sub.label)        as "subFamily",
      weave.label                                       as "weaveStructure",
      fabric.label                                      as "fabricType",
      craft_sub.label                                   as "craftSubType",
      motif_cat.label                                   as "motifCategory",
      motif.label                                       as motif,
      border.label                                      as "borderHeight",
      pallu.label                                       as "palluDesign",
      blouse.label                                      as "blouseAvailable",
      descriptor.label                                  as descriptor,
      uom.label                                         as uom,
      d.is_serialised                                   as "isSerialised",
      coalesce(oh.qty, 0)::int                          as quantity,
      cw.retail_minor                                   as "priceMinor",
      cw.cost_minor                                     as "costMinor",
      cw.wholesale_minor                                as "wholesaleMinor",
      cw.mrp_minor                                      as "mrpMinor",
      coalesce(pc.n, 0)::int                            as pieces
    from colourway cw
    join design d                     on d.id = cw.design_id
    left join lookup_value industry           on industry.id = d.industry_id
    left join lookup_value product_type       on product_type.id = d.product_type_id
    left join lookup_value garment_type       on garment_type.id = d.garment_type_id
    left join lookup_value weaving            on weaving.id = d.home_weaving_category_id
    left join lookup_value production_method  on production_method.id = d.production_method_id
    left join lookup_value fibre              on fibre.id = d.fibre_type_id
    left join lookup_value region             on region.id = d.regional_style_id
    left join lookup_value craft              on craft.id = d.craft_technique_id
    left join lookup_value audience           on audience.id = d.audience_type_id
    left join lookup_value colour             on colour.id = cw.colour_id
    left join lookup_value uom                on uom.id = d.uom_id
    left join lookup_value silk_sub           on silk_sub.id = d.silk_sub_family_id
    left join lookup_value cotton_sub         on cotton_sub.id = d.cotton_sub_family_id
    left join lookup_value weave              on weave.id = d.weave_structure_id
    left join lookup_value fabric             on fabric.id = d.fabric_type_id
    left join lookup_value craft_sub          on craft_sub.id = d.craft_sub_type_id
    left join lookup_value motif_cat          on motif_cat.id = d.motif_category_id
    left join lookup_value motif              on motif.id = d.motif_id
    left join lookup_value border             on border.id = d.border_height_id
    left join lookup_value pallu              on pallu.id = d.pallu_design_id
    left join lookup_value blouse             on blouse.id = d.blouse_available_id
    left join lookup_value descriptor         on descriptor.id = d.descriptor_id
    -- The most recent consignment of this colourway. A colourway can have
    -- many; the grid shows one row per colourway, so it shows the newest.
    left join lateral (
      select b.code from batch b
      where b.colourway_id = cw.id
      order by b.received_at desc, b.code desc limit 1
    ) latest on true
    left join colourway_on_hand oh            on oh.colourway_id = cw.id
    left join (
      select colourway_id, count(*) as n from piece group by colourway_id
    ) pc                                      on pc.colourway_id = cw.id
    -- Both, not just the design: archiving one colour of a design that still
    -- has others leaves the design active, and only the colourway retired.
    where d.status <> 'archived' and cw.is_active
    order by d.seq, colour.sort_order
  `);
}

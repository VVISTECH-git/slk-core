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

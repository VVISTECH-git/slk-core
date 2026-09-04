import { listingAlt, listingDescription, listingTitle } from "@slk/domain";

import { shopifyCategoryFor } from "./taxonomy";
import type { ShopifyClient } from "./shopify-client";

/**
 * Everything a listing is built from, in one row — the shape both
 * publish.ts (one consignment, by hand) and publish-listing.ts (every
 * linked consignment of a colourway, on an edit) supply, so the two can
 * never quietly compose a title or a description differently from each
 * other.
 */
export type ConsignmentRow = {
  design_name: string;
  product_type: string | null;
  colour: string | null;
  secondary_colour: string | null;
  craft_technique: string | null;
  textile_material: string | null;
  fibre_type: string | null;
  motif: string | null;
  motif_category: string | null;
  border_height: string | null;
  border_style: string | null;
  pallu_design: string | null;
  blouse_available: string | null;
  blouse_style: string | null;
  blouse_material: string | null;
  title_override: string | null;
  description_override: string | null;
  weight_grams: number | null;
  hsn_code: string | null;
};

export type PhotoRow = { slot: string | null; storage_key: string; alt_override: string | null };

export interface SentProduct {
  productId: string;
  variantId: string;
  inventoryItemId: string;
  title: string;
}

/**
 * Composes the listing and sends one productSet call — creates when
 * `existingProductId` is undefined, updates that exact product in place
 * otherwise. The one place either caller reaches Shopify from, so a change
 * to what a listing looks like only ever needs making once.
 */
export async function sendProductSet(
  client: ShopifyClient,
  productCode: string,
  row: ConsignmentRow,
  photos: PhotoRow[],
  r2PublicBase: string,
  retailMinor: number,
  sellable: number,
  existingProductId: string | undefined,
): Promise<SentProduct> {
  const title = row.title_override ?? listingTitle({
    designName: row.design_name,
    colour: row.colour,
    secondaryColour: row.secondary_colour,
  });

  const description = row.description_override ?? listingDescription({
    craftTechnique: row.craft_technique,
    textileMaterial: row.textile_material,
    fibreType: row.fibre_type,
    motif: row.motif,
    motifCategory: row.motif_category,
    borderHeight: row.border_height,
    borderStyle: row.border_style,
    palluDesign: row.pallu_design,
    blouseAvailable: row.blouse_available,
    blouseStyle: row.blouse_style,
    blouseMaterial: row.blouse_material,
  });

  const { locations } = await client.graphql<{ locations: { nodes: { id: string }[] } }>(
    `query { locations(first: 1) { nodes { id } } }`,
  );
  const location = locations.nodes[0];
  if (location === undefined) throw new Error("Shopify store has no locations.");

  const PRODUCT_SET = `
    mutation PublishConsignment($input: ProductSetInput!) {
      productSet(input: $input, synchronous: true) {
        product {
          id
          variants(first: 1) {
            nodes { id inventoryItem { id } }
          }
        }
        userErrors { field message }
      }
    }
  `;

  const result = await client.graphql<{
    productSet: {
      product: {
        id: string;
        variants: { nodes: { id: string; inventoryItem: { id: string } }[] };
      } | null;
      userErrors: { field: string[]; message: string }[];
    };
  }>(PRODUCT_SET, {
    input: {
      // Present only when updating — its absence is what tells productSet
      // to create rather than update.
      ...(existingProductId !== undefined && { id: existingProductId }),
      title,
      descriptionHtml: description,
      vendor: "Sree Lakshmi Kalamkari",
      status: "ACTIVE",
      // Shopify's own standard taxonomy — separate from tags/collections,
      // and left unset before this shipped an empty "Category:" on every
      // listing. Mapped from our own product_type via taxonomy.ts, found
      // by searching Shopify's real category tree rather than guessed.
      // Omitted entirely for a product type with no mapping yet, rather
      // than failing the whole publish over it.
      ...(shopifyCategoryFor(row.product_type) !== undefined && {
        category: shopifyCategoryFor(row.product_type),
      }),
      tags: [row.colour, row.craft_technique, row.textile_material ?? row.fibre_type, row.motif].filter(
        (t): t is string => t !== null,
      ),
      productOptions: [{ name: "Title", values: [{ name: "Default Title" }] }],
      variants: [
        {
          optionValues: [{ optionName: "Title", name: "Default Title" }],
          price: (retailMinor / 100).toFixed(2),
          sku: productCode,
          inventoryItem: {
            tracked: true,
            sku: productCode,
            ...(row.weight_grams !== null && {
              measurement: { weight: { value: row.weight_grams, unit: "GRAMS" } },
            }),
          },
          inventoryQuantities: [
            { locationId: location.id, name: "available", quantity: sellable },
          ],
        },
      ],
      files: photos.map((p) => ({
        originalSource: `${r2PublicBase}/${p.storage_key}`,
        alt: p.alt_override ?? listingAlt({ colour: row.colour, designName: row.design_name, slot: p.slot }),
        contentType: "IMAGE",
      })),
    },
  });

  if (result.productSet.userErrors.length > 0) {
    throw new Error(
      "Shopify refused it: " +
        result.productSet.userErrors.map((e) => `${e.field.join(".")}: ${e.message}`).join("; "),
    );
  }

  const product = result.productSet.product!;
  const variant = product.variants.nodes[0];

  if (variant === undefined) {
    throw new Error(`Shopify accepted the product but returned no variant. Product: ${product.id}`);
  }

  /*
    Active status alone does not make a product visible anywhere — Shopify
    treats "exists, for sale" and "published to a sales channel" as two
    separate facts. Found by actually checking the storefront: the product
    created fine, set inventory fine, and was still a 404 for a real
    customer until this ran. Online Store only — Point of Sale is a
    decision this codebase has not been asked to make.
  */
  const { publications } = await client.graphql<{
    publications: { nodes: { id: string; name: string }[] };
  }>(`query { publications(first: 10) { nodes { id name } } }`);

  const onlineStore = publications.nodes.find((p) => p.name === "Online Store");

  if (onlineStore !== undefined) {
    const PUBLISH = `
      mutation Publish($id: ID!, $input: [PublicationInput!]!) {
        publishablePublish(id: $id, input: $input) {
          userErrors { field message }
        }
      }
    `;

    const publishResult = await client.graphql<{
      publishablePublish: { userErrors: { field: string[]; message: string }[] };
    }>(PUBLISH, { id: product.id, input: [{ publicationId: onlineStore.id }] });

    if (publishResult.publishablePublish.userErrors.length > 0) {
      throw new Error(
        "Shopify accepted the product but refused publishing it: " +
          publishResult.publishablePublish.userErrors
            .map((e) => `${e.field.join(".")}: ${e.message}`)
            .join("; "),
      );
    }
  }

  return {
    productId: product.id,
    variantId: variant.id,
    inventoryItemId: variant.inventoryItem.id,
    title,
  };
}

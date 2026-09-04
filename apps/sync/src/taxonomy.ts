/**
 * Our own product_type labels, mapped to Shopify's standard taxonomy —
 * found by searching taxonomy.shopify.com's own categories via the Admin
 * API, not guessed. Lives here rather than in @slk/domain: this is a fact
 * about Shopify, not about the business.
 *
 * Only Saree matters functionally today — is_serialised gates everything
 * else out of channel_batch_sellable before a listing is possible — but
 * the mapping is real for the day a second product type gets there rather
 * than something to rebuild from scratch.
 */
const SHOPIFY_CATEGORY_BY_PRODUCT_TYPE: Record<string, string> = {
  // Apparel & Accessories > Clothing > Traditional & Ceremonial Clothing >
  // Saris & Lehengas > Saris
  Saree: "gid://shopify/TaxonomyCategory/aa-1-23-2-1",
  // Apparel & Accessories > Clothing Accessories > Traditional Clothing
  // Accessories > Dupattas
  Dupatta: "gid://shopify/TaxonomyCategory/aa-2-31-4",
  // Arts & Entertainment > Hobbies & Creative Arts > Arts & Crafts > Art &
  // Crafting Materials > Textiles > Fabric — the closest real category for
  // cloth sold by length; Shopify's taxonomy has nothing dedicated to
  // garment-making yardage under Apparel itself.
  Fabric: "gid://shopify/TaxonomyCategory/ae-2-1-2-14-2",
  // Home & Garden > Linens & Bedding > Bedding > Bed Sheets
  Bedsheets: "gid://shopify/TaxonomyCategory/hg-15-1-2",
  // Apparel & Accessories > Clothing Accessories > Scarves & Shawls —
  // Shopify's taxonomy does not distinguish a stole from a scarf, so both
  // of ours resolve to the same category.
  Scarves: "gid://shopify/TaxonomyCategory/aa-2-26",
  Stolls: "gid://shopify/TaxonomyCategory/aa-2-26",
};

/** Undefined for a product type with no mapping yet — the category field is simply omitted, not a hard failure. */
export function shopifyCategoryFor(productType: string | null): string | undefined {
  return productType === null ? undefined : SHOPIFY_CATEGORY_BY_PRODUCT_TYPE[productType];
}

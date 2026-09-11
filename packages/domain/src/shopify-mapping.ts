/**
 * The secondary path a listing's own facts travel — a CSV row, for a bulk
 * export or a spreadsheet reviewer wants outside the app. Never its own
 * storage format: everything here is built on the same `listing*` composers
 * every live Shopify push already uses, so a CSV export and a real listing
 * can never quietly say two different things about the same product.
 */

import { listingDescription, listingTags, listingTitle, type ListingDescriptionParts, type ListingTagParts, type ListingTitleParts } from "./listing.ts";

export interface ShopifyCsvRowParts {
  title: ListingTitleParts;
  description: ListingDescriptionParts;
  tags: ListingTagParts;
  vendor: string;
  /** null reads as "not priced" — the same rule every price field in this codebase follows. */
  priceMinor: number | null;
  sku: string | null;
}

/** The column order Shopify's own product-CSV importer expects for the fields this codebase actually has values for. */
export const SHOPIFY_CSV_COLUMNS = [
  "Handle",
  "Title",
  "Body (HTML)",
  "Vendor",
  "Tags",
  "Published",
  "Variant SKU",
  "Variant Price",
] as const;

export type ShopifyCsvRow = Record<(typeof SHOPIFY_CSV_COLUMNS)[number], string>;

/** Shopify's own handle rule: lowercase, word characters and hyphens only, no doubled or edge hyphens. */
export function shopifyHandle(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * One product's facts, in the shape Shopify's own CSV importer reads. The
 * handle falls back to the product code, then the title — a design with
 * neither is not a product a CSV row can name at all, so an empty string is
 * the honest answer there rather than inventing one.
 */
export function toShopifyCsvRow(parts: ShopifyCsvRowParts): ShopifyCsvRow {
  const title = listingTitle(parts.title);

  return {
    Handle: shopifyHandle(parts.title.productCode ?? title ?? ""),
    Title: title,
    "Body (HTML)": listingDescription(parts.description),
    Vendor: parts.vendor,
    Tags: listingTags(parts.tags).join(", "),
    Published: parts.priceMinor !== null ? "TRUE" : "FALSE",
    "Variant SKU": parts.sku ?? "",
    "Variant Price": parts.priceMinor !== null ? (parts.priceMinor / 100).toFixed(2) : "",
  };
}

/** RFC 4180: a field touching a comma, quote or newline is quoted, with `"` doubled inside it. Everything else passes through untouched. */
export function csvEscape(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** CRLF row endings, a header row first — the format a spreadsheet app expects without being told. */
export function toCsv(rows: ShopifyCsvRow[]): string {
  const lines = [SHOPIFY_CSV_COLUMNS.join(",")];

  for (const row of rows) {
    lines.push(SHOPIFY_CSV_COLUMNS.map((c) => csvEscape(row[c])).join(","));
  }

  return lines.join("\r\n");
}

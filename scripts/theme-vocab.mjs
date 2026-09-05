#!/usr/bin/env node
/**
 * Writes the aartisanz Shopify theme's `snippets/slk-vocab.liquid` from the
 * live Master Lists.
 *
 * The storefront filters on plain product tags (see `listingTags` in
 * @slk/domain). Shopify has no idea which tag is a colour and which is a
 * craft, so the theme carries a copy of the lists to group them again. This
 * is that copy. Re-run it whenever a value is added or renamed in Master
 * Lists, then upload the theme (or paste the snippet into the theme editor).
 *
 *   pnpm theme:vocab                      # prints the snippet
 *   pnpm theme:vocab path/to/theme        # writes <theme>/snippets/slk-vocab.liquid
 *
 * Reads DATABASE_URL (or DATABASE_URL_UNPOOLED) from the environment, or from
 * .env / .env.vercel-prod at the repo root. Read-only.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
// The driver lives in packages/db's dependency tree, not the root's.
const require = createRequire(path.join(root, "packages", "db", "package.json"));
const postgres = require("postgres");

function loadEnv(file) {
  if (!fs.existsSync(file)) return {};
  return Object.fromEntries(
    fs
      .readFileSync(file, "utf8")
      .split("\n")
      .filter((l) => l.includes("=") && !l.startsWith("#"))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")];
      }),
  );
}
const env = { ...loadEnv(path.join(root, ".env")), ...loadEnv(path.join(root, ".env.vercel-prod")), ...process.env };
const url = env.DATABASE_URL_UNPOOLED || env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

/** list code → the name the snippet exposes it under. Order is the sidebar's. */
const LISTS = [
  ["colour", "colour"],
  ["fibre_type", "fibres"],
  ["textile_material", "materials"],
  ["craft_technique", "crafts"],
  ["craft_sub_type", "craft_sub_types"],
  ["motif_category", "motif_categories"],
  ["motif", "motifs"],
  ["saree_style", "saree_styles"],
  ["production_method", "production_methods"],
  ["product_type", "product_types"],
];

const sql = postgres(url, { ssl: "require", max: 1 });
const rows = await sql`
  select l.code as list, v.label, v.meta
  from lookup_value v join lookup_list l on l.id = v.list_id
  where v.status = 'active' and l.is_enabled and l.code in ${sql(LISTS.map(([c]) => c))}
  order by l.code, v.sort_order, v.label`;
await sql.end();

const by = {};
for (const r of rows) (by[r.list] ??= []).push(r);

// The snippet splits on "," and "|"; a label carrying either would silently
// break every list after it, so refuse rather than write something wrong.
const bad = rows.filter((r) => /[,|"]/.test(r.label));
if (bad.length) {
  console.error("These labels contain , | or \" and cannot be exported:", bad.map((b) => `${b.list}: ${b.label}`));
  process.exit(1);
}

const csv = (code) => (by[code] ?? []).map((r) => r.label).join(",");
const colourPairs = (by.colour ?? []).map((r) => `${r.label}|${r.meta?.hex ?? "#cccccc"}`).join(",");
const today = new Date().toISOString().slice(0, 10);

const cases = [
  ["colour_pairs", colourPairs],
  ["colour_names", csv("colour")],
  ...LISTS.filter(([c]) => c !== "colour").map(([code, name]) => [name, csv(code)]),
];

const out = `{%- comment -%}
  SLK vocabulary — the product-attribute dropdown lists from the SLK inventory
  app (slk-core, Master Lists). GENERATED ${today} by \`pnpm theme:vocab\` in
  slk-core — do not edit by hand; re-run the command instead.

  The app publishes each attribute as a plain product tag (see listingTags in
  @slk/domain). The collection filters and the product page read these lists,
  so a tag is only ever treated as a "Colour" or a "Craft" if the app could
  have produced it. Two fixed tags are not lists: "Handicraft" (production
  method) and "With Blouse".

  Usage — outputs one comma-separated list, capture and split it:
    {% capture csv %}{% render 'slk-vocab', list: 'fibres' %}{% endcapture %}
    {% assign slk_fibres = csv | split: ',' %}
  Lists: ${cases.map(([n]) => n).join(", ")}
  Colour entries in colour_pairs are "Name|#hex".
{%- endcomment -%}
{%- case list -%}
${cases.map(([name, value]) => `{%- when '${name}' -%}${value}`).join("\n")}
{%- endcase -%}
`;

const target = process.argv[2];
if (target) {
  const file = path.join(target, "snippets", "slk-vocab.liquid");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, out);
  console.log(`wrote ${file}`);
} else {
  process.stdout.write(out);
}
console.error(Object.entries(by).map(([k, v]) => `${k}: ${v.length}`).join(", "));

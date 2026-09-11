import { strict as assert } from "node:assert";
import { test } from "node:test";

import { csvEscape, shopifyHandle, toCsv, toShopifyCsvRow } from "./shopify-mapping.ts";

test("shopifyHandle lowercases and hyphenates, dropping edge and doubled hyphens", () => {
  assert.equal(shopifyHandle("300015"), "300015");
  assert.equal(shopifyHandle("Kalamkari Cotton Saree"), "kalamkari-cotton-saree");
  assert.equal(shopifyHandle("  Teal / Black  "), "teal-black");
});

test("toShopifyCsvRow composes from the same listing* functions a real push uses", () => {
  const row = toShopifyCsvRow({
    title: { designName: "Kalamkari Cotton Saree", colour: "Teal", productCode: "300015" },
    description: { craftTechnique: "Kalamkari", textileMaterial: "Mul Mul" },
    tags: { colour: "Teal", craftTechnique: "Kalamkari" },
    vendor: "Sree Lakshmi Kalamkari",
    priceMinor: 349900,
    sku: "300015",
  });

  assert.equal(row.Handle, "300015");
  assert.equal(row.Title, "Kalamkari Cotton Saree — Teal");
  assert.equal(row["Body (HTML)"], "Kalamkari on Mul Mul.");
  assert.equal(row.Vendor, "Sree Lakshmi Kalamkari");
  assert.equal(row.Tags, "Teal, Kalamkari");
  assert.equal(row.Published, "TRUE");
  assert.equal(row["Variant SKU"], "300015");
  assert.equal(row["Variant Price"], "3499.00");
});

test("toShopifyCsvRow reads unpriced as Published FALSE and a blank price", () => {
  const row = toShopifyCsvRow({
    title: { designName: "Kalamkari Cotton Saree" },
    description: {},
    tags: {},
    vendor: "Sree Lakshmi Kalamkari",
    priceMinor: null,
    sku: null,
  });

  assert.equal(row.Handle, "kalamkari-cotton-saree");
  assert.equal(row.Published, "FALSE");
  assert.equal(row["Variant Price"], "");
  assert.equal(row["Variant SKU"], "");
});

test("csvEscape quotes only a field that touches a comma, quote or newline", () => {
  assert.equal(csvEscape("Teal"), "Teal");
  assert.equal(csvEscape("Teal, Cornflower"), '"Teal, Cornflower"');
  assert.equal(csvEscape('6" border'), '"6"" border"');
  assert.equal(csvEscape("line one\nline two"), '"line one\nline two"');
});

test("toCsv writes a header row and one row per record, CRLF-joined", () => {
  const rows = [
    toShopifyCsvRow({
      title: { designName: "Saree A", productCode: "300001" },
      description: {},
      tags: {},
      vendor: "V",
      priceMinor: 100000,
      sku: "300001",
    }),
    toShopifyCsvRow({
      title: { designName: "Saree B", productCode: "300002" },
      description: {},
      tags: {},
      vendor: "V",
      priceMinor: null,
      sku: null,
    }),
  ];

  const csv = toCsv(rows);
  const lines = csv.split("\r\n");

  assert.equal(lines.length, 3);
  assert.equal(lines[0], "Handle,Title,Body (HTML),Vendor,Tags,Published,Variant SKU,Variant Price");
  assert.equal(lines[1], "300001,Saree A,,V,,TRUE,300001,1000.00");
  assert.equal(lines[2], "300002,Saree B,,V,,FALSE,,");
});

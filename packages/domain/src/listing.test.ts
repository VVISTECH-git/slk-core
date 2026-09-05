import { strict as assert } from "node:assert";
import { test } from "node:test";

import { listingAlt, listingDescription, listingTags, listingTitle } from "./listing.ts";

test("listingTitle appends the colours it is given", () => {
  assert.equal(
    listingTitle({ designName: "Kalamkari Cotton Saree", colour: "Teal" }),
    "Kalamkari Cotton Saree — Teal",
  );
  assert.equal(
    listingTitle({
      designName: "Kalamkari Cotton Saree",
      colour: "Teal",
      secondaryColour: "Cornflower Blue",
    }),
    "Kalamkari Cotton Saree — Teal, Cornflower Blue",
  );
});

test("listingTitle is just the design name with no colour", () => {
  assert.equal(
    listingTitle({ designName: "Kalamkari Cotton Saree", colour: null }),
    "Kalamkari Cotton Saree",
  );
  assert.equal(
    listingTitle({ designName: "Kalamkari Cotton Saree" }),
    "Kalamkari Cotton Saree",
  );
});

test("listingDescription writes one sentence per fact it has", () => {
  const full = listingDescription({
    craftTechnique: "Kalamkari",
    textileMaterial: "Mul Mul",
    motif: "Lotus",
    borderHeight: "4 Inch",
    borderStyle: "Temple",
    palluDesign: "Contrast",
    blouseAvailable: "With Blouse",
    blouseStyle: "Contrast",
    blouseMaterial: "Cotton",
  });

  assert.equal(
    full,
    "Kalamkari on Mul Mul. Features a lotus motif. 4 Inch temple border. " +
      "The pallu is contrast. Comes with a contrast Cotton blouse piece.",
  );
});

test("listingDescription drops a sentence it has nothing for", () => {
  assert.equal(
    listingDescription({ craftTechnique: "Kalamkari", textileMaterial: "Mul Mul" }),
    "Kalamkari on Mul Mul.",
  );
  assert.equal(listingDescription({}), "");
});

test("listingDescription falls back through cloth and border in either order", () => {
  assert.equal(
    listingDescription({ craftTechnique: "Kalamkari" }),
    "Kalamkari work.",
  );
  assert.equal(
    listingDescription({ textileMaterial: "Mul Mul" }),
    "Woven in Mul Mul.",
  );
  assert.equal(listingDescription({ fibreType: "Cotton" }), "Woven in Cotton.");
  assert.equal(listingDescription({ borderHeight: "4 Inch" }), "4 Inch border.");
  assert.equal(listingDescription({ borderStyle: "Temple" }), "Temple border.");
});

test("listingDescription asks nothing of the blouse when there is none", () => {
  assert.equal(
    listingDescription({ craftTechnique: "Kalamkari", blouseAvailable: "Without Blouse" }),
    "Kalamkari work.",
  );
});

test("listingDescription leads with a handmade claim and folds in the new facts", () => {
  const full = listingDescription({
    productionMethod: "Handicraft",
    craftTechnique: "Kalamkari",
    craftSubType: "Hand Block",
    textileMaterial: "Mul Mul",
    weaveStructure: "Plain Weave",
    motif: "Lotus",
    sareeStyle: "All Over",
    palluMotif: "Peacock",
    borderHeight: "4 Inch",
    borderStyle: "Temple",
    palluDesign: "Contrast",
  });

  assert.equal(
    full,
    "Handcrafted, not machine-made. Hand Block Kalamkari on Mul Mul. Plain Weave structure. " +
      "All Over layout. Features a lotus motif. The pallu carries a peacock motif. " +
      "4 Inch temple border. The pallu is contrast.",
  );
});

test("listingDescription states machine production instead of claiming handmade", () => {
  assert.equal(
    listingDescription({ productionMethod: "Machine Made", textileMaterial: "Cotton" }),
    "Machine Made production. Woven in Cotton.",
  );
});

test("listingAlt leads with the colour and trails with the slot", () => {
  assert.equal(
    listingAlt({ colour: "Teal", designName: "Kalamkari Cotton Saree", slot: "Pallu" }),
    "Teal Kalamkari Cotton Saree, pallu",
  );
});

test("listingAlt degrades to just the name with nothing else", () => {
  assert.equal(
    listingAlt({ designName: "Kalamkari Cotton Saree" }),
    "Kalamkari Cotton Saree",
  );
});

test("listingTags sends one plain label per attribute, in sidebar order", () => {
  assert.deepEqual(
    listingTags({
      colour: "Black",
      fibreType: "Cotton",
      textileMaterial: "Mul Mul",
      craftTechnique: "Kalamkari",
      craftSubType: "Hand Block",
      motifCategory: "Fauna",
      motif: "Fish",
      sareeStyle: "All Over",
      productionMethod: "Handicraft",
      blouseAvailable: "Yes",
    }),
    ["Black", "Cotton", "Mul Mul", "Kalamkari", "Hand Block", "Fauna", "Fish", "All Over", "Handicraft", "With Blouse"],
  );
});

test("listingTags drops blank attributes and never tags a missing blouse", () => {
  assert.deepEqual(
    listingTags({ colour: "Teal", craftTechnique: "Kalamkari", blouseAvailable: "No", sareeStyle: " " }),
    ["Teal", "Kalamkari"],
  );
  assert.deepEqual(listingTags({}), []);
});

test("listingTags sends a label once even when two attributes share it", () => {
  // "Linen" is both a colour and a fibre in the Master Lists.
  assert.deepEqual(listingTags({ colour: "Linen", fibreType: "Linen" }), ["Linen"]);
});

test("listingTags still honours the older 'With Blouse' spelling", () => {
  assert.deepEqual(listingTags({ blouseAvailable: "With Blouse" }), ["With Blouse"]);
});

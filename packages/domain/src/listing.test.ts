import { strict as assert } from "node:assert";
import { test } from "node:test";

import { listingAlt, listingDescription, listingTitle } from "./listing.ts";

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

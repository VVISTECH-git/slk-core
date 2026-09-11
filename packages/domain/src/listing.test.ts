import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  AARTISANZ_TITLE_STYLE,
  listingAlt,
  listingDescription,
  listingTags,
  listingTitle,
  styledTitle,
  titleStyleFor,
  vendorFor,
} from "./listing.ts";

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

test("listingTitle in the aartisanz style joins with || and ends with the code", () => {
  assert.equal(
    listingTitle(
      { designName: "Kalamkari Cotton Saree", colour: "Black", productCode: "300015" },
      AARTISANZ_TITLE_STYLE,
    ),
    "Kalamkari Cotton Saree || Black || 300015",
  );
  assert.equal(
    listingTitle(
      {
        designName: "Kalamkari Cotton Saree",
        colour: "Teal",
        secondaryColour: "Cornflower Blue",
        productCode: "300016",
      },
      AARTISANZ_TITLE_STYLE,
    ),
    "Kalamkari Cotton Saree || Teal, Cornflower Blue || 300016",
  );
  // No colour: the code still follows the name, nothing doubled up.
  assert.equal(
    listingTitle({ designName: "Kalamkari Cotton Saree", productCode: "300017" }, AARTISANZ_TITLE_STYLE),
    "Kalamkari Cotton Saree || 300017",
  );
  // Same batch, default style: the code stays out of the title.
  assert.equal(
    listingTitle({ designName: "Kalamkari Cotton Saree", colour: "Black", productCode: "300015" }),
    "Kalamkari Cotton Saree — Black",
  );
});

test("titleStyleFor knows aartisanz and defaults everything else", () => {
  assert.equal(titleStyleFor("aartisanz").separator, " || ");
  assert.equal(titleStyleFor("aartisanz").withCode, true);
  assert.equal(titleStyleFor("some-other-store").withCode, false);
  assert.equal(titleStyleFor(undefined).separator, " — ");
});

test("styledTitle finishes a hand-written title the same way", () => {
  assert.equal(
    styledTitle("Festival Black Kalamkari", "300015", AARTISANZ_TITLE_STYLE),
    "Festival Black Kalamkari || 300015",
  );
  assert.equal(styledTitle("Festival Black Kalamkari", "300015", titleStyleFor("other")), "Festival Black Kalamkari");
  assert.equal(styledTitle("Festival Black Kalamkari", null, AARTISANZ_TITLE_STYLE), "Festival Black Kalamkari");
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

test("listingDescription writes one dimension sentence when both are known, otherwise falls back to the one it has", () => {
  assert.equal(
    listingDescription({ craftTechnique: "Bandhani", lengthCm: 214, widthCm: 60 }),
    "Bandhani work. 214 × 60 cm.",
  );
  assert.equal(listingDescription({ lengthCm: 214 }), "214 cm long.");
  assert.equal(listingDescription({ widthCm: 60 }), "60 cm wide.");
});

test("listingDescription writes a sentence per Fabric construction fact it has", () => {
  assert.equal(
    listingDescription({
      widthCm: 112,
      gsm: 140,
      yarnCount: "20 Single x 20 Single",
      shrinkage: "1-2%",
      transparency: "0%",
    }),
    "112 cm wide. 140 GSM. Yarn count 20 Single x 20 Single. Shrinkage 1-2%. Transparency 0%.",
  );
});

test("listingDescription describes a matched set piece by piece", () => {
  assert.equal(
    listingDescription({
      pieces: [
        { label: "Top", lengthCm: 250, widthCm: 117 },
        { label: "Bottom", lengthCm: 200, widthCm: 117 },
      ],
    }),
    "2-piece set: Top 250 × 117 cm, Bottom 200 × 117 cm.",
  );
  // A piece missing one dimension still lists by whichever it has.
  assert.equal(
    listingDescription({ pieces: [{ label: "Dupatta", lengthCm: 230, widthCm: null }] }),
    "1-piece set: Dupatta 230 cm.",
  );
  // A slot nobody filled in (no label) does not count as a piece.
  assert.equal(listingDescription({ pieces: [{ label: "", lengthCm: null, widthCm: null }] }), "");
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

test("vendorFor: aartisanz trades as Sai Sarees, everything else as the works", () => {
  assert.equal(vendorFor("aartisanz"), "Sai Sarees");
  assert.equal(vendorFor("slk"), "Sree Lakshmi Kalamkari");
  assert.equal(vendorFor(null), "Sree Lakshmi Kalamkari");
  assert.equal(vendorFor(undefined), "Sree Lakshmi Kalamkari");
});

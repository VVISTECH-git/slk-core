import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  AARTISANZ_TITLE_STYLE,
  composeStorySections,
  listingAlt,
  listingBody,
  listingDescription,
  listingMetafields,
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

test("listingMetafields writes one structured fact per field it has", () => {
  assert.deepEqual(
    listingMetafields({ lengthCm: 214, widthCm: 60 }),
    [
      { namespace: "slk", key: "length_cm", type: "number_decimal", value: "214" },
      { namespace: "slk", key: "width_cm", type: "number_decimal", value: "60" },
    ],
  );
  assert.deepEqual(
    listingMetafields({ gsm: 140, yarnCount: "20 Single x 20 Single", shrinkage: "1-2%", transparency: "0%" }),
    [
      { namespace: "slk", key: "gsm", type: "number_decimal", value: "140" },
      { namespace: "slk", key: "yarn_count", type: "single_line_text_field", value: "20 Single x 20 Single" },
      { namespace: "slk", key: "shrinkage", type: "single_line_text_field", value: "1-2%" },
      { namespace: "slk", key: "transparency", type: "single_line_text_field", value: "0%" },
    ],
  );
  assert.deepEqual(listingMetafields({}), []);
});

test("listingMetafields writes the matched set as one JSON metafield, dropping unlabelled slots", () => {
  assert.deepEqual(
    listingMetafields({
      pieces: [
        { label: "Top", lengthCm: 250, widthCm: 117 },
        { label: "", lengthCm: null, widthCm: null },
        { label: "Bottom", lengthCm: 200, widthCm: 117 },
      ],
    }),
    [
      {
        namespace: "slk",
        key: "pieces",
        type: "json",
        value: JSON.stringify([
          { label: "Top", lengthCm: 250, widthCm: 117 },
          { label: "Bottom", lengthCm: 200, widthCm: 117 },
        ]),
      },
    ],
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

test("vendorFor: aartisanz trades as Sai Sarees, everything else as the works", () => {
  assert.equal(vendorFor("aartisanz"), "Sai Sarees");
  assert.equal(vendorFor("slk"), "Sree Lakshmi Kalamkari");
  assert.equal(vendorFor(null), "Sree Lakshmi Kalamkari");
  assert.equal(vendorFor(undefined), "Sree Lakshmi Kalamkari");
});

test("listingBody with no story is exactly listingDescription's paragraph", () => {
  const description = { craftTechnique: "Kalamkari", textileMaterial: "Mul Mul" };
  assert.equal(
    listingBody({ description }),
    listingDescription(description),
  );
  assert.equal(listingBody({ description: {} }), "");
});

test("listingBody assembles every section it has, in order, blank lines between", () => {
  const body = listingBody({
    shortDescription: "A saree that starts every conversation.",
    whyLove: "Soft against the skin.",
    craftStory: "Hand block printed by artisans from Bagru.",
    stylingSuggestions: "Pair with silver jewellery for a festive look.",
    description: { craftTechnique: "Kalamkari", textileMaterial: "Mul Mul" },
    care: { washMethod: "Hand Wash", dryCleanRequired: false },
    customerNotes: "Comes with a matching potli bag.",
  });

  assert.equal(
    body,
    [
      "A saree that starts every conversation.",
      "Soft against the skin.",
      "Hand block printed by artisans from Bagru.",
      "Pair with silver jewellery for a festive look.",
      "Kalamkari on Mul Mul.",
      "Hand Wash.",
      "Comes with a matching potli bag.",
    ].join("\n\n"),
  );
});

test("listingBody drops a section it has nothing for", () => {
  assert.equal(
    listingBody({
      whyLove: "Soft against the skin.",
      description: {},
    }),
    "Soft against the skin.",
  );
});

test("careSummary facts fold into listingBody, one sentence per fact, blank when there are none", () => {
  const withCare = listingBody({
    description: {},
    care: {
      washMethod: "Hand Wash",
      waterTemp: "Cold",
      detergent: "Mild Liquid Detergent",
      drying: "Dry in Shade",
      ironing: "Low Heat",
      dryCleanRequired: false,
      colourBleedWarning: true,
      shrinkageWarning: false,
      storageNote: "Store away from direct sunlight",
    },
  });

  assert.equal(
    withCare,
    "Hand Wash. Water temperature: Cold. Use mild liquid detergent. Dry in Shade. Low Heat. " +
      "Colours may bleed on first wash. Store away from direct sunlight.",
  );

  assert.equal(listingBody({ description: {}, care: {} }), "");
  assert.equal(listingBody({ description: {}, care: null }), "");
});

test("composeStorySections turns answers into sentences, one per answer given", () => {
  const sections = composeStorySections(
    {
      qSpecial: "Hand-painted Kalamkari storytelling motifs.",
      qFeel: "Soft, lightweight cotton that drapes easily",
      qOccasions: "festive mornings and temple visits",
      qRecommendTo: "someone who loves traditional prints",
      qStyling: "Pair with a contrast blouse and minimal gold jewellery.",
      qIncluded: "one saree and one unstitched blouse piece",
      qBeforeBuying: "Colours may vary slightly from the photo",
      qWhyBuy: "each piece is hand block printed and never mass-produced",
    },
    { craftTechnique: "Kalamkari", artisanCluster: "Bagru", claims: ["Handmade", "Natural Dyed"] },
  );

  assert.equal(sections.shortDescription, "Hand-painted Kalamkari storytelling motifs.");
  assert.equal(
    sections.whyLove,
    "Soft, lightweight cotton that drapes easily. Perfect for someone who loves traditional prints. " +
      "Wear it for festive mornings and temple visits.",
  );
  assert.equal(
    sections.craftStory,
    "Made using Kalamkari. Crafted by artisans from Bagru. Handmade, Natural Dyed.",
  );
  assert.equal(sections.stylingSuggestions, "Pair with a contrast blouse and minimal gold jewellery.");
  assert.equal(
    sections.customerNotes,
    "What's included: one saree and one unstitched blouse piece. Colours may vary slightly from the photo. " +
      "each piece is hand block printed and never mass-produced.",
  );
});

test("composeStorySections leaves a section blank when nothing answers it", () => {
  const sections = composeStorySections({});
  assert.equal(sections.shortDescription, "");
  assert.equal(sections.whyLove, "");
  assert.equal(sections.craftStory, "");
  assert.equal(sections.stylingSuggestions, "");
  assert.equal(sections.customerNotes, "");
});

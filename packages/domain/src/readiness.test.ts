import { strict as assert } from "node:assert";
import { test } from "node:test";

import { assessReadiness, type ReadinessFacts } from "./readiness.ts";

const COMPLETE: ReadinessFacts = {
  hasIndustry: true,
  hasProductType: true,
  hasFibreType: true,
  hasColour: true,
  hasCraftTechnique: true,
  hasRetailPrice: true,
  imageCount: 4,
  hasShortDescription: true,
  hasWhyLove: true,
  hasStylingSuggestions: true,
  hasCareInstructions: true,
  isNew: false,
  hasOpeningStock: false,
};

test("assessReadiness reads 100% when every fact is true and nothing is missing", () => {
  const result = assessReadiness(COMPLETE);
  assert.equal(result.percent, 100);
  assert.deepEqual(result.missing, []);
});

test("assessReadiness drops the opening-stock item on an existing record", () => {
  const result = assessReadiness(COMPLETE);
  assert.ok(!result.items.some((i) => i.key === "openingStock"));
});

test("assessReadiness adds the opening-stock item while creating, and can fail it", () => {
  const result = assessReadiness({ ...COMPLETE, isNew: true, hasOpeningStock: false });
  const item = result.items.find((i) => i.key === "openingStock");
  assert.ok(item);
  assert.equal(item!.done, false);
  assert.ok(result.missing.some((i) => i.key === "openingStock"));
});

test("assessReadiness scores partial completeness and lists exactly what's missing", () => {
  const result = assessReadiness({
    ...COMPLETE,
    hasColour: false,
    imageCount: 0,
    hasCareInstructions: false,
  });

  assert.equal(result.missing.length, 3);
  assert.deepEqual(
    result.missing.map((i) => i.key).sort(),
    ["careInstructions", "colour", "images"],
  );
  // 11 items total on an existing record, 3 missing -> 8/11 rounded.
  assert.equal(result.percent, Math.round((8 / 11) * 100));
});

test("assessReadiness points each missing item at the tab that answers it", () => {
  const result = assessReadiness({ ...COMPLETE, hasWhyLove: false });
  const item = result.missing.find((i) => i.key === "whyLove");
  assert.equal(item?.tab, "story");
});

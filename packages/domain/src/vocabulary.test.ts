import assert from "node:assert/strict";
import { describe, it } from "node:test";

// Explicit extension: Node's type-stripping test runner resolves ESM
// specifiers literally, unlike the bundler that compiles the rest of this
// package. Test files are never bundled, so the two can differ.
import { compareLabels, findDuplicates } from "./vocabulary.ts";

/**
 * The cases are not invented. Every pair under "corrections already made" is a
 * row from the Correction Log in `Master Listing - New.xlsx` — a duplicate a
 * person found by eye in a spreadsheet. If the detector cannot rediscover
 * those, it is not worth showing anyone.
 *
 * The pairs under "distinct values" are all currently in the vocabulary and
 * must stay unflagged. Shirts / Skirts and Khadhi / Khadi are both one
 * character apart, which is why plain edit distance is not enough.
 */

describe("compareLabels", () => {
  const corrections: [string, string][] = [
    ["Kanchi", "Kanchipuram"],
    ["Khadhi", "Khadi"],
    ["Bandhini", "Bandhani"],
    ["Madhubhani", "Madhubani"],
    ["Thabala", "Tabla"],
    ["Swastik", "Swastika"],
    ["Nizami", "Nizam"],
    ["Kalamakri", "Kalamkari"],
    ["Palanquin ", "Palanquin"],
  ];

  for (const [a, b] of corrections) {
    it(`catches ${a} / ${b}`, () => {
      assert.notEqual(compareLabels(a, b), null, `${a} / ${b} went unflagged`);
    });
  }

  const distinct: [string, string][] = [
    ["Shirts", "Skirts"],
    ["Stitched", "UnStitched"],
    ["Cotton", "Silk"],
    ["Plain Weave", "Jacquard"],
    ["Zari Work", "Knot Work"],
    ["Table Mats", "Chair Covers"],
    ["dark blue", "dark green"],
    ["Runners", "Naphkin"],
    ["Kurthi", "Kurtha"],
  ];

  for (const [a, b] of distinct) {
    // Kurthi / Kurtha differs only in a final vowel, so it is flagged on
    // purpose — it is a real question for SLK, not a false positive.
    const expected = a === "Kurthi";

    it(`${expected ? "flags" : "leaves alone"} ${a} / ${b}`, () => {
      assert.equal(compareLabels(a, b) !== null, expected);
    });
  }

  it("ignores words too short to judge", () => {
    assert.equal(compareLabels("Gap", "Gaps"), null);
    assert.equal(compareLabels("Zari", "Zare"), null);
  });
});

describe("findDuplicates", () => {
  const entry = (id: string, label: string, listCode: string) => ({
    id,
    label,
    listCode,
  });

  it("never pairs values from different lists", () => {
    // Blouse Material reuses Cotton, Silk and Rayon from Fibre Type on
    // purpose — the Correction Log records it as intentional.
    const hints = findDuplicates([
      entry("1", "Cotton", "fibre_type"),
      entry("2", "Cotton", "blouse_material"),
    ]);

    assert.equal(hints.length, 0);
  });

  it("puts spelling variants before extensions", () => {
    const hints = findDuplicates([
      entry("1", "Kanchi", "regional_style"),
      entry("2", "Kanchipuram", "regional_style"),
      entry("3", "Khadhi", "regional_style"),
      entry("4", "Khadi", "regional_style"),
    ]);

    assert.equal(hints.length, 2);
    assert.equal(hints[0]?.kind, "spelling");
    assert.equal(hints[1]?.kind, "extension");
  });
});

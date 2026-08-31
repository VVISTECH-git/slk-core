/**
 * Finding the same value entered twice.
 *
 * Domain logic, not UI: the ops app shows these as suggestions, but the same
 * rule should guard an import and can warn on the mobile app. It depends on
 * nothing but the two words.
 */

export interface VocabularyEntry {
  id: string;
  label: string;
  listCode: string;
}

export interface DuplicateHint<T extends VocabularyEntry = VocabularyEntry> {
  a: T;
  b: T;
  kind: "spelling" | "extension";
  reason: string;
}

/**
 * The letters that vary when one word is transliterated twice.
 *
 * This is the whole trick. SLK's vocabulary is Telugu, Tamil, Hindi and Urdu
 * words written in Latin script, and the workbook's Correction Log shows
 * exactly where two spellings of one word disagree — the vowels, and the
 * aspirate `h`:
 *
 *   Khadhi / Khadi           an h
 *   Madhubhani / Madhubani   an h
 *   Bandhini / Bandhani      i against a
 *   Thabala / Tabla          an h and an a
 *   Swastik / Swastika       a trailing a
 *   Nizami / Nizam           a trailing i
 *
 * A difference in any other consonant is a different word, not a different
 * spelling. That single distinction separates Khadhi / Khadi, which is a
 * duplicate, from Shirts / Skirts, which is not — both are one character
 * apart, and plain edit distance cannot tell them apart.
 */
const SOFT_LETTERS = new Set(["a", "e", "i", "o", "u", "h"]);

/** Shortest word that can be compared. Below this, one letter changes meaning. */
const MIN_LENGTH = 5;

/** Most characters two spellings of one word may differ by. */
const MAX_RESIDUE = 2;

export function normaliseLabel(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * The characters left over on each side once the two words are matched up.
 * Returns null as soon as the total exceeds `cap`, so distant pairs bail early.
 */
function residue(a: string, b: string, cap: number): string[] | null {
  const counts = new Map<string, number>();

  for (const ch of a) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  for (const ch of b) counts.set(ch, (counts.get(ch) ?? 0) - 1);

  const left: string[] = [];

  for (const [ch, n] of counts) {
    for (let i = 0; i < Math.abs(n); i++) {
      left.push(ch);
      if (left.length > cap) return null;
    }
  }

  return left;
}

/**
 * Compares two labels already known to be in the same list.
 * Returns null when they are not plausibly the same value.
 */
export function compareLabels(
  labelA: string,
  labelB: string,
): Pick<DuplicateHint, "kind" | "reason"> | null {
  const a = normaliseLabel(labelA);
  const b = normaliseLabel(labelB);

  if (a === "" || b === "") return null;

  if (a === b) {
    return {
      kind: "spelling",
      reason: "Identical once case and spacing are ignored",
    };
  }

  if (Math.min(a.length, b.length) < MIN_LENGTH) return null;

  // Kanchi and Kanchipuram, Nizam and Nizami: one word carrying the other
  // whole. Almost always the same place written long and short.
  if (a.startsWith(b) || b.startsWith(a)) {
    return {
      kind: "extension",
      reason: "One is the other with more on the end",
    };
  }

  const left = residue(a, b, MAX_RESIDUE);

  if (left === null) return null;

  // Nothing left over, yet the words differ: the same letters in a different
  // order. Kalamakri for Kalamkari, Thabala for Thalaba. Transposition is the
  // commonest typo there is, and two unrelated words in one list being exact
  // anagrams of each other does not happen.
  if (left.length === 0) {
    return {
      kind: "spelling",
      reason: "The same letters in a different order",
    };
  }

  if (!left.every((ch) => SOFT_LETTERS.has(ch))) return null;

  return {
    kind: "spelling",
    reason:
      left.length === 1
        ? `Differ by one ${left[0] === "h" ? "h" : "vowel"}`
        : "Differ only in vowels and h",
  };
}

/**
 * Every plausible duplicate within each list.
 *
 * Only within a list. Values repeated across lists are deliberate here — the
 * Correction Log records that Blouse Material reuses Cotton / Silk / Rayon
 * from Fibre Type on purpose — so flagging those is all noise and no signal.
 * Search covers the cross-list case when someone wants it.
 */
export function findDuplicates<T extends VocabularyEntry>(
  entries: T[],
): DuplicateHint<T>[] {
  const hints: DuplicateHint<T>[] = [];

  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const a = entries[i];
      const b = entries[j];

      if (a === undefined || b === undefined) continue;
      if (a.listCode !== b.listCode) continue;

      const verdict = compareLabels(a.label, b.label);
      if (verdict === null) continue;

      hints.push({ a, b, ...verdict });
    }
  }

  return hints.sort((x, y) => {
    if (x.kind !== y.kind) return x.kind === "spelling" ? -1 : 1;
    return x.a.label.localeCompare(y.a.label);
  });
}

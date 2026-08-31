/**
 * How a design gets its code and its name.
 *
 * Both are generated once, at creation, and then stored. The code in
 * particular is printed on a QR label stuck to a saree, so it must never
 * follow a later rename of a taxonomy value — which is why it is a stored
 * string and not something derived on read.
 */

/**
 * Words that stay lower case inside a title.
 *
 * Without these, capitalising every word turns "Up to 3 inch" into "Up To 3
 * Inch" and "Half and Half" into "Half And Half" — which is what happened
 * when this function did exactly that.
 */
const MINOR_WORDS = new Set([
  "a", "an", "and", "as", "at", "but", "by", "for", "from", "in", "nor",
  "of", "on", "or", "per", "the", "to", "via", "vs", "with",
]);

/**
 * A word the writer has already cased deliberately.
 *
 * A capital anywhere but the first character means someone meant it: 3D,
 * UnStitched, McCall. Re-casing those is damage, not normalisation.
 */
function deliberatelyCased(word: string): boolean {
  return /[A-Z]/.test(word.slice(1));
}

/**
 * The one casing rule, applied when a value is written rather than when it is
 * read.
 *
 * Storing what should be read is what keeps a value from saying "Contrast" on
 * one screen and "contrast" on another. The invariant every stored label
 * holds is `titleCase(label) === label`, so re-saving an unchanged value is a
 * no-op and the editor never opens already dirty.
 *
 * Everything after the first letter of a word is left alone, so
 * "Sico (Silk-Cotton Blend)" survives unchanged.
 */
export function titleCase(value: string | null | undefined): string {
  if (!value) return "";

  // Split on the separators but keep them, so spacing and punctuation come
  // back exactly as they were.
  const parts = value.split(/([\s(/-]+)/);

  const wordIndices = parts
    .map((part, i) => (/^[\s(/-]+$/.test(part) || part === "" ? -1 : i))
    .filter((i) => i >= 0);

  const first = wordIndices[0];
  const last = wordIndices[wordIndices.length - 1];

  return parts
    .map((part, i) => {
      if (i !== first && i !== last && MINOR_WORDS.has(part.toLowerCase())) {
        return part.toLowerCase();
      }

      if (deliberatelyCased(part)) return part;

      return part.replace(/^[a-z]/, (letter) => letter.toUpperCase());
    })
    .join("");
}

/** First three letters, ignoring spaces and punctuation. */
export function abbr3(value: string | null | undefined, fallback = "GEN"): string {
  if (!value) return fallback;
  const letters = value.replace(/[^A-Za-z]/g, "");
  return letters === "" ? fallback : letters.slice(0, 3).toUpperCase();
}

/**
 * Three characters for a colour. Two-word colours take the first letter of
 * the first word and two of the second, so "bottle green" is BGR and does not
 * collide with "brown".
 */
export function colourToken(colour: string | null | undefined): string {
  if (!colour) return "GEN";

  const words = colour.replace(/[()]/g, "").split(/[\s-]+/).filter(Boolean);
  const first = words[0] ?? "";
  const second = words[1];

  return (second === undefined
    ? first.slice(0, 3)
    : first.slice(0, 1) + second.slice(0, 2)
  ).toUpperCase();
}

export interface DesignCodeParts {
  productType?: string | null;
  regionalStyle?: string | null;
  fibreType?: string | null;
  seq: number;
}

/** TYPE-REGION-FIBRE-SEQ, e.g. SAR-SRI-SIL-0001. */
export function designCode(parts: DesignCodeParts): string {
  return [
    abbr3(parts.productType),
    abbr3(parts.regionalStyle),
    abbr3(parts.fibreType),
    String(parts.seq).padStart(4, "0"),
  ].join("-");
}

/** SAR-SRI-SIL-0001-IND-003 — the design, its colour, and which piece. */
export function pieceCode(
  code: string,
  colour: string | null | undefined,
  serial: number,
): string {
  return `${code}-${colourToken(colour)}-${String(serial).padStart(3, "0")}`;
}

export interface DesignNameParts {
  descriptor?: string | null;
  craftTechnique?: string | null;
  regionalStyle?: string | null;
  silkSubFamily?: string | null;
  cottonSubFamily?: string | null;
  fibreType?: string | null;
  garmentType?: string | null;
  productType?: string | null;
}

/**
 * Builds the name people read: "Soft Kantha Work Kanchipuram Sico Saree".
 *
 * The order is deliberate — adjective, craft, place, material, thing — so the
 * names sort and scan sensibly next to each other. Regional style is dropped
 * when it duplicates the craft (Srikalahasti is both), and the parenthesised
 * half of a fibre like "Sico (Silk-Cotton Blend)" is left out of the name.
 */
export function designName(parts: DesignNameParts): string {
  const words: string[] = [];

  const push = (value: string | null | undefined) => {
    if (value) words.push(value);
  };

  if (parts.descriptor) {
    words.push(parts.descriptor.charAt(0).toUpperCase() + parts.descriptor.slice(1));
  }

  push(parts.craftTechnique);

  if (parts.regionalStyle && parts.regionalStyle !== parts.craftTechnique) {
    words.push(parts.regionalStyle);
  }

  push(parts.silkSubFamily);
  push(parts.cottonSubFamily);
  push(parts.fibreType?.replace(/\s*\(.*\)/, ""));
  push(parts.garmentType ?? parts.productType);

  return words.join(" ");
}

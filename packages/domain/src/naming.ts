/**
 * How a design gets its code and its name.
 *
 * Both are generated once, at creation, and then stored. The code in
 * particular is printed on a QR label stuck to a saree, so it must never
 * follow a later rename of a taxonomy value — which is why it is a stored
 * string and not something derived on read.
 */

/**
 * For display only.
 *
 * The workbook stores `colour` and `descriptor` in lower case and the
 * database keeps them that way, because that is what the source says. People
 * reading a catalogue should still see "Bottle Green", not "bottle green".
 * Everything else in the vocabulary is already cased as it should read, so
 * only the first letter of each word is touched and the rest is left alone —
 * "Sico (Silk-Cotton Blend)" survives unchanged.
 */
export function titleCase(value: string | null | undefined): string {
  if (!value) return "";

  return value.replace(
    /(^|[\s(/-])([a-z])/g,
    (_match, before: string, letter: string) => before + letter.toUpperCase(),
  );
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

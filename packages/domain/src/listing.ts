/**
 * What a shopper reads, composed from what the floor already recorded.
 *
 * A consignment is the thing Shopify lists, and every consignment needs a
 * title, a description and — per photograph — alt text. Asking somebody to
 * write those by hand, every batch, forever, is not realistic; SLK decided
 * against it on 3 Sep 2026 in favour of composing them from the taxonomy a
 * record already carries, with a free-text override on `batch` for the run
 * that earns one.
 *
 * Composed on read, never stored, the same choice `designName` made for the
 * design's own name: the taxonomy can be corrected — a mis-set motif fixed,
 * a border re-measured — and every listing that read it composes differently
 * from that moment on, with nothing to migrate.
 */

/** Trims to nothing, or returns the value. Every composer treats blank as absent. */
function present(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export interface ListingTitleParts {
  /** The design's own composed or custom name — "Kalamkari Cotton Saree". */
  designName: string;
  colour?: string | null;
  secondaryColour?: string | null;
}

/**
 * "Kalamkari Cotton Saree — Teal, Cornflower". The listing's own name, kept
 * apart from `designName` because a title reads the colour and the design
 * does not — two colourways of one design must not collide on Shopify.
 */
export function listingTitle(parts: ListingTitleParts): string {
  const colours = [present(parts.colour), present(parts.secondaryColour)].filter(
    (c): c is string => c !== null,
  );

  return colours.length === 0
    ? parts.designName
    : `${parts.designName} — ${colours.join(", ")}`;
}

export interface ListingDescriptionParts {
  /** "Handicraft" or "Machine Made". A trust claim, not a detail — see below. */
  productionMethod?: string | null;
  craftTechnique?: string | null;
  /** The branch of the technique — e.g. Hand Block, Hand Screen, of Kalamkari. */
  craftSubType?: string | null;
  textileMaterial?: string | null;
  fibreType?: string | null;
  /** Plain Weave, Jacquard. */
  weaveStructure?: string | null;
  motif?: string | null;
  motifCategory?: string | null;
  /** How the design sits on the cloth — All Over, Scattered Buta, Half and Half. */
  sareeStyle?: string | null;
  /** The motif on the pallu specifically, distinct from the body's `motif` above. */
  palluMotif?: string | null;
  borderHeight?: string | null;
  borderStyle?: string | null;
  palluDesign?: string | null;
  /** "With Blouse" or "Without Blouse" — Product Sub Type, for a saree. */
  blouseAvailable?: string | null;
  blouseStyle?: string | null;
  blouseMaterial?: string | null;
}

/**
 * A short paragraph, one sentence per fact the record actually has.
 *
 * Order follows how the saree is read by hand — the cloth first, then the
 * motif, then the border, then the pallu, then the blouse — so a shopper
 * skimming the first sentence gets what the piece fundamentally is before
 * the detail. Missing facts drop their sentence rather than leaving a gap or
 * a placeholder; a paragraph built from three true sentences reads better
 * than one built from three true sentences and two empty sets of words.
 */
export function listingDescription(parts: ListingDescriptionParts): string {
  const sentences: string[] = [];

  // Leads, ahead of what the piece even is: whether a hand made it is the
  // one fact a photograph cannot show, and the reason this whole function
  // exists rather than a paragraph typed once and left to go stale.
  const method = present(parts.productionMethod);
  if (method === "Handicraft") sentences.push("Handcrafted, not machine-made.");
  else if (method) sentences.push(`${method} production.`);

  const craft = present(parts.craftTechnique);
  const craftSubType = present(parts.craftSubType);
  // The branch folds into the technique's own sentence — "Hand Block
  // Kalamkari", not two half-sentences saying one thing.
  const craftLabel = craft && craftSubType ? `${craftSubType} ${craft}` : (craft ?? craftSubType);
  const cloth = present(parts.textileMaterial) ?? present(parts.fibreType);

  if (craftLabel && cloth) sentences.push(`${craftLabel} on ${cloth}.`);
  else if (craftLabel) sentences.push(`${craftLabel} work.`);
  else if (cloth) sentences.push(`Woven in ${cloth}.`);

  const weave = present(parts.weaveStructure);
  if (weave) sentences.push(`${weave} structure.`);

  const sareeStyle = present(parts.sareeStyle);
  if (sareeStyle) sentences.push(`${sareeStyle} layout.`);

  const motif = present(parts.motif) ?? present(parts.motifCategory);
  if (motif) sentences.push(`Features a ${motif.toLowerCase()} motif.`);

  // Distinct from the motif above on purpose: a pallu is allowed to carry a
  // different motif than the body, and this is the one sentence that can
  // say so instead of describing only whichever fact was queried first.
  const palluMotif = present(parts.palluMotif);
  if (palluMotif) sentences.push(`The pallu carries a ${palluMotif.toLowerCase()} motif.`);

  const height = present(parts.borderHeight);
  const style = present(parts.borderStyle);
  if (height && style) sentences.push(`${height} ${style.toLowerCase()} border.`);
  else if (style) sentences.push(`${style} border.`);
  else if (height) sentences.push(`${height} border.`);

  const pallu = present(parts.palluDesign);
  if (pallu) sentences.push(`The pallu is ${pallu.toLowerCase()}.`);

  if (present(parts.blouseAvailable) === "With Blouse") {
    const style = present(parts.blouseStyle);
    // Kept as stored, unlike style: a material name is a proper noun — Cotton,
    // Silk — the same reason "Mul Mul" is not lowercased in the cloth sentence
    // above, where "Contrast" and "Temple" are adjectives describing a choice.
    const material = present(parts.blouseMaterial);

    const blouse = [
      style ? style.toLowerCase() : null,
      material,
      "blouse piece",
    ]
      .filter((w): w is string => w !== null)
      .join(" ");

    sentences.push(`Comes with a ${blouse}.`);
  }

  return sentences.join(" ");
}

export interface ListingAltParts {
  colour?: string | null;
  designName: string;
  /** "Body", "Pallu", "Border", "Blouse" — the image slot's own label. */
  slot?: string | null;
}

/**
 * "Teal Kalamkari Cotton Saree, pallu" — what the photograph shows, for a
 * reader who cannot see it. Composed the same way a title is: colour first,
 * because that is the first thing anyone says about a saree out loud.
 */
export function listingAlt(parts: ListingAltParts): string {
  const colour = present(parts.colour);
  const slot = present(parts.slot);

  const subject = colour ? `${colour} ${parts.designName}` : parts.designName;

  return slot ? `${subject}, ${slot.toLowerCase()}` : subject;
}

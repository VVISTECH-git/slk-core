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
  /**
   * The piece code — 300015 — when the channel's style wants it in the title.
   * Left out otherwise; the SKU always carries it regardless.
   */
  productCode?: string | null;
}

/**
 * How one channel wants its titles to read.
 *
 * Two batches of one design in one colour — the same saree printed twice,
 * each batch its own consignment — compose the same title, and on the
 * aartisanz storefront that looked like a duplicate listing (6 Sep 2026).
 * The code is what tells them apart, and it is already the SKU and the QR
 * label on the cloth, so aartisanz asked for it in the title too, with "||"
 * between every part instead of the dash.
 */
export interface ListingTitleStyle {
  /** Between design name, colours and code — " — " by default, " || " for aartisanz. */
  separator: string;
  /** Whether the piece code closes the title. */
  withCode: boolean;
}

export const DEFAULT_TITLE_STYLE: ListingTitleStyle = { separator: " — ", withCode: false };
export const AARTISANZ_TITLE_STYLE: ListingTitleStyle = { separator: " || ", withCode: true };

/** The style a channel code maps to; anything unlisted reads the default. */
export function titleStyleFor(channelCode: string | null | undefined): ListingTitleStyle {
  return channelCode === "aartisanz" ? AARTISANZ_TITLE_STYLE : DEFAULT_TITLE_STYLE;
}

/**
 * The name a channel trades under — Shopify's `vendor`, the "By …" line on
 * a product page. aartisanz sells as Sai Sarees; everything else is the
 * works' own name. Per channel for the same reason the title style is: the
 * two shops must not read as one another.
 */
export const DEFAULT_VENDOR = "Sree Lakshmi Kalamkari";
export const AARTISANZ_VENDOR = "Sai Sarees";
export function vendorFor(channelCode: string | null | undefined): string {
  return channelCode === "aartisanz" ? AARTISANZ_VENDOR : DEFAULT_VENDOR;
}

/**
 * "Kalamkari Cotton Saree — Teal, Cornflower". The listing's own name, kept
 * apart from `designName` because a title reads the colour and the design
 * does not — two colourways of one design must not collide on Shopify.
 *
 * With the aartisanz style: "Kalamkari Cotton Saree || Teal, Cornflower ||
 * 300015" — the code last, so two batches of one colourway do not collide
 * either.
 */
export function listingTitle(
  parts: ListingTitleParts,
  style: ListingTitleStyle = DEFAULT_TITLE_STYLE,
): string {
  const colours = [present(parts.colour), present(parts.secondaryColour)].filter(
    (c): c is string => c !== null,
  );

  const segments = [parts.designName];
  if (colours.length > 0) segments.push(colours.join(", "));

  const code = present(parts.productCode);
  if (style.withCode && code !== null) segments.push(code);

  return segments.join(style.separator);
}

/**
 * A hand-written title, finished the way the channel's style finishes every
 * title — the code still goes on the end for aartisanz, or an override on
 * one batch would collide with the other batch of the same colourway all
 * over again.
 */
export function styledTitle(
  title: string,
  productCode: string | null | undefined,
  style: ListingTitleStyle,
): string {
  const code = present(productCode);
  return style.withCode && code !== null ? `${title}${style.separator}${code}` : title;
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
  /** Finished length, in centimetres — a dupatta, a stole, a bedsheet. */
  lengthCm?: number | null;
  /** Width, in centimetres — a finished piece, or a bolt of plain Fabric. */
  widthCm?: number | null;
  /** Grams per square metre — Fabric only. */
  gsm?: number | null;
  /** Free text: "20 Single x 20 Single" — Fabric only. */
  yarnCount?: string | null;
  /** Free text: itokri shows these as ranges ("1-2%") — Fabric only. */
  shrinkage?: string | null;
  /** Free text, same reasoning as shrinkage. */
  transparency?: string | null;
  /** A matched Fabric set's named components, each with its own length and width. */
  pieces?: { label: string; lengthCm: number | null; widthCm: number | null }[] | null;
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

  // Dimensions read as one sentence when both are known — "214 × 60 cm."
  // rather than two half-facts — and fall back to whichever one is not.
  if (parts.lengthCm != null && parts.widthCm != null) {
    sentences.push(`${parts.lengthCm} × ${parts.widthCm} cm.`);
  } else if (parts.lengthCm != null) {
    sentences.push(`${parts.lengthCm} cm long.`);
  } else if (parts.widthCm != null) {
    sentences.push(`${parts.widthCm} cm wide.`);
  }

  if (parts.gsm != null) sentences.push(`${parts.gsm} GSM.`);

  const yarnCount = present(parts.yarnCount);
  if (yarnCount) sentences.push(`Yarn count ${yarnCount}.`);

  const shrinkage = present(parts.shrinkage);
  if (shrinkage) sentences.push(`Shrinkage ${shrinkage}.`);

  const transparency = present(parts.transparency);
  if (transparency) sentences.push(`Transparency ${transparency}.`);

  // A matched set is described piece by piece instead of by one pair of
  // numbers for the whole thing — see DesignExtraPiece's own comment for why.
  const pieces = (parts.pieces ?? []).filter((p) => present(p.label) !== null);
  if (pieces.length > 0) {
    const listed = pieces
      .map((p) => {
        const dims =
          p.lengthCm != null && p.widthCm != null
            ? ` ${p.lengthCm} × ${p.widthCm} cm`
            : p.lengthCm != null
              ? ` ${p.lengthCm} cm`
              : p.widthCm != null
                ? ` ${p.widthCm} cm`
                : "";
        return `${p.label.trim()}${dims}`;
      })
      .join(", ");
    sentences.push(`${pieces.length}-piece set: ${listed}.`);
  }

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

export interface ListingMetafield {
  namespace: string;
  key: string;
  type: string;
  value: string;
}

export interface ListingMetafieldParts {
  lengthCm?: number | null;
  widthCm?: number | null;
  gsm?: number | null;
  yarnCount?: string | null;
  shrinkage?: string | null;
  transparency?: string | null;
  pieces?: { label: string; lengthCm: number | null; widthCm: number | null }[] | null;
}

/** The namespace every metafield this codebase writes lives under. */
export const SLK_METAFIELD_NAMESPACE = "slk";

/**
 * The dimension/construction facts as Shopify metafields, structured rather
 * than folded into one prose paragraph — so the theme can put "214 cm" in
 * its own Specifications row instead of asking a shopper to find it in a
 * sentence. `listingDescription` already says these facts in words; this is
 * the same facts again, in the one shape a theme can read without parsing
 * text: `product.metafields.slk.length_cm` and so on.
 *
 * Not sent as tags — see listingTags' own comment on why: a tag is a filter
 * option, and no shopper filters a collection by "214 cm" specifically. A
 * metafield carries the same fact without cluttering the filter sidebar.
 */
export function listingMetafields(parts: ListingMetafieldParts): ListingMetafield[] {
  const out: ListingMetafield[] = [];
  const num = (key: string, value: number | null | undefined) => {
    if (value != null) out.push({ namespace: SLK_METAFIELD_NAMESPACE, key, type: "number_decimal", value: String(value) });
  };
  const text = (key: string, value: string | null | undefined) => {
    const v = present(value);
    if (v !== null) out.push({ namespace: SLK_METAFIELD_NAMESPACE, key, type: "single_line_text_field", value: v });
  };

  num("length_cm", parts.lengthCm);
  num("width_cm", parts.widthCm);
  num("gsm", parts.gsm);
  text("yarn_count", parts.yarnCount);
  text("shrinkage", parts.shrinkage);
  text("transparency", parts.transparency);

  const pieces = (parts.pieces ?? []).filter((p) => present(p.label) !== null);
  if (pieces.length > 0) {
    out.push({
      namespace: SLK_METAFIELD_NAMESPACE,
      key: "pieces",
      type: "json",
      value: JSON.stringify(pieces.map((p) => ({ label: p.label.trim(), lengthCm: p.lengthCm, widthCm: p.widthCm }))),
    });
  }

  return out;
}

export interface ListingTagParts {
  colour?: string | null;
  fibreType?: string | null;
  textileMaterial?: string | null;
  craftTechnique?: string | null;
  /** Hand Block, Hand Screen — the branch of the technique. */
  craftSubType?: string | null;
  motif?: string | null;
  /** Floral, Fauna, Birds — the family the motif belongs to. */
  motifCategory?: string | null;
  /** All Over, Half and Half, Scattered Buta — how the design sits on a saree. */
  sareeStyle?: string | null;
  /** "Handicraft" or "Machine Made". */
  productionMethod?: string | null;
  /** "Yes" / "No" as the Blouse Availability list stores it. */
  blouseAvailable?: string | null;
}

/**
 * The tag the storefront uses to mean "comes with a blouse piece". A fixed
 * word rather than the list's own "Yes", because "Yes" on its own tells a
 * shopper nothing and would collide with any other yes/no attribute.
 */
export const WITH_BLOUSE_TAG = "With Blouse";

/**
 * The product tags a listing carries on Shopify — one plain label per
 * attribute, nothing prefixed, nothing invented.
 *
 * Tags are the only thing a storefront can filter on without an app, so this
 * list *is* the filter sidebar: the theme groups each tag back into its
 * attribute by matching it against the same Master Lists. Decided with SLK on
 * 5 Sep 2026 which attributes earn a tag — colour, cloth, craft and its
 * branch, motif and its family, saree layout, whether a hand made it, and
 * whether a blouse comes with it. Border, pallu and blouse detail stay in the
 * description: true, but too fine to filter on.
 *
 * Order is the sidebar's order. Blank attributes drop their tag rather than
 * leaving a placeholder, and a label that appears twice (a colour that is
 * also a fibre) is sent once.
 */
export function listingTags(parts: ListingTagParts): string[] {
  const tags: (string | null)[] = [
    present(parts.colour),
    present(parts.fibreType),
    present(parts.textileMaterial),
    present(parts.craftTechnique),
    present(parts.craftSubType),
    present(parts.motifCategory),
    present(parts.motif),
    present(parts.sareeStyle),
    present(parts.productionMethod),
    // The list stores Yes/No; an older row may still say "With Blouse".
    present(parts.blouseAvailable) === "Yes" || present(parts.blouseAvailable) === WITH_BLOUSE_TAG
      ? WITH_BLOUSE_TAG
      : null,
  ];

  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tags) {
    if (t === null || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

export interface ListingCareParts {
  washMethod?: string | null;
  waterTemp?: string | null;
  detergent?: string | null;
  drying?: string | null;
  ironing?: string | null;
  dryCleanRequired?: boolean | null;
  colourBleedWarning?: boolean | null;
  shrinkageWarning?: boolean | null;
  storageNote?: string | null;
}

/**
 * The Care tab's facts as a paragraph, one sentence per fact carried — same
 * "structure only, blank drops its sentence" rule as `listingDescription`.
 * `null` when nothing on the tab has been answered, so a caller can tell
 * "no care instructions" from "a paragraph of nothing."
 */
function careSummary(parts: ListingCareParts): string | null {
  const sentences: string[] = [];

  const wash = present(parts.washMethod);
  if (wash) sentences.push(`${wash}.`);

  const temp = present(parts.waterTemp);
  if (temp) sentences.push(`Water temperature: ${temp}.`);

  const detergent = present(parts.detergent);
  if (detergent) sentences.push(`Use ${detergent.toLowerCase()}.`);

  const drying = present(parts.drying);
  if (drying) sentences.push(`${drying}.`);

  const ironing = present(parts.ironing);
  if (ironing) sentences.push(`${ironing}.`);

  if (parts.dryCleanRequired) sentences.push("Dry clean only.");
  if (parts.colourBleedWarning) sentences.push("Colours may bleed on first wash.");
  if (parts.shrinkageWarning) sentences.push("Slight shrinkage is possible after the first wash.");

  const storage = present(parts.storageNote);
  if (storage) sentences.push(storage.endsWith(".") ? storage : `${storage}.`);

  return sentences.length > 0 ? sentences.join(" ") : null;
}

export interface ListingBodyParts {
  /** The four hand-written sections a "Generate" pass produces from the Sales Story Q&A — see `composeStorySections`. Each optional; a blank one drops out rather than leaving a gap. */
  shortDescription?: string | null;
  whyLove?: string | null;
  craftStory?: string | null;
  stylingSuggestions?: string | null;
  /**
   * The taxonomy facts `listingDescription` composes fresh from — never the
   * `colourway_story.product_details` column, even if one exists. Product
   * Details is "composed on read", the same choice every other listing text
   * in this file already made, so a taxonomy correction reaches it with
   * nothing to regenerate. The stored column is a preview only.
   */
  description: ListingDescriptionParts;
  /** The Care tab's facts, composed fresh the same way — never a stored column. */
  care?: ListingCareParts | null;
  customerNotes?: string | null;
}

/**
 * The full listing body: the Sales Story's hand-written sections, in order,
 * around the taxonomy-composed Product Details and Care paragraphs that
 * `listingDescription` and `careSummary` already produce. Blank sections
 * drop out rather than leaving an empty paragraph — a colourway with no
 * story at all produces exactly `listingDescription(parts.description)`,
 * unchanged from what every listing said before this function existed.
 */
export function listingBody(parts: ListingBodyParts): string {
  const sections: string[] = [];

  const short = present(parts.shortDescription);
  if (short) sections.push(short);

  const why = present(parts.whyLove);
  if (why) sections.push(why);

  const craft = present(parts.craftStory);
  if (craft) sections.push(craft);

  const styling = present(parts.stylingSuggestions);
  if (styling) sections.push(styling);

  const details = present(listingDescription(parts.description));
  if (details) sections.push(details);

  const care = parts.care ? careSummary(parts.care) : null;
  if (care) sections.push(care);

  const notes = present(parts.customerNotes);
  if (notes) sections.push(notes);

  return sections.join("\n\n");
}

export interface StoryAnswers {
  qSpecial?: string | null;
  qFeel?: string | null;
  qOccasions?: string | null;
  qRecommendTo?: string | null;
  qStyling?: string | null;
  qIncluded?: string | null;
  qBeforeBuying?: string | null;
  qWhyBuy?: string | null;
}

export interface StoryCraftParts {
  craftTechnique?: string | null;
  craftSubType?: string | null;
  artisanCluster?: string | null;
  /** Craft Claims — Handmade, Natural Dyed, and the rest. */
  claims?: string[] | null;
}

export interface GeneratedStorySections {
  shortDescription: string;
  whyLove: string;
  craftStory: string;
  stylingSuggestions: string;
  customerNotes: string;
}

/**
 * Turns the Sales Story's eight answers into the five hand-written sections
 * `listingBody` assembles — deterministic template composition, not an LLM
 * (confirmed with the stakeholder: instant, free, and always hand-editable
 * afterward, the same trade-off `listingDescription` already made).
 *
 * Craft Story is the one section that does not come from an answer at all —
 * there is no "tell us about the craft" question, because that fact already
 * lives on the taxonomy (Craft Technique, Artisan/Cluster, Craft Claims) the
 * same way Product Details does. Asking for it twice would risk the two
 * disagreeing; composing it from the same source as the label on the tin
 * cannot.
 *
 * Every field of the result is always a string, never null — "Generate"
 * fills a text box, and an empty box reads better than the literal word
 * "null" in it. A question left blank simply contributes no sentence.
 */
export function composeStorySections(
  answers: StoryAnswers,
  craft: StoryCraftParts = {},
): GeneratedStorySections {
  const shortDescription = present(answers.qSpecial) ?? "";

  const whySentences: string[] = [];
  const feel = present(answers.qFeel);
  if (feel) whySentences.push(feel.endsWith(".") ? feel : `${feel}.`);
  const recommend = present(answers.qRecommendTo);
  if (recommend) whySentences.push(`Perfect for ${recommend.charAt(0).toLowerCase()}${recommend.slice(1)}.`);
  const occasions = present(answers.qOccasions);
  if (occasions) whySentences.push(`Wear it for ${occasions.charAt(0).toLowerCase()}${occasions.slice(1)}.`);
  const whyLove = whySentences.join(" ");

  const craftSentences: string[] = [];
  const technique = present(craft.craftTechnique);
  const subType = present(craft.craftSubType);
  const techniqueLabel = technique && subType ? `${subType} ${technique}` : (technique ?? subType);
  if (techniqueLabel) craftSentences.push(`Made using ${techniqueLabel}.`);
  const cluster = present(craft.artisanCluster);
  if (cluster) craftSentences.push(`Crafted by artisans from ${cluster}.`);
  const claims = (craft.claims ?? []).map((c) => present(c)).filter((c): c is string => c !== null);
  if (claims.length > 0) craftSentences.push(`${claims.join(", ")}.`);
  const craftStory = craftSentences.join(" ");

  const stylingSuggestions = present(answers.qStyling) ?? "";

  const noteSentences: string[] = [];
  const included = present(answers.qIncluded);
  if (included) noteSentences.push(`What's included: ${included.charAt(0).toLowerCase()}${included.slice(1)}.`);
  const before = present(answers.qBeforeBuying);
  if (before) noteSentences.push(before.endsWith(".") ? before : `${before}.`);
  const why = present(answers.qWhyBuy);
  if (why) noteSentences.push(why.endsWith(".") ? why : `${why}.`);
  const customerNotes = noteSentences.join(" ");

  return { shortDescription, whyLove, craftStory, stylingSuggestions, customerNotes };
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

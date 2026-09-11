/**
 * Whether a record is actually ready to sell itself online — a completeness
 * score plus the specific facts still missing, not a validation error.
 *
 * Deliberately separate from `validate()` in `apps/web/src/app/records/
 * actions.ts`, which stays the authority on whether a *save* is allowed
 * (a DB-touching, server-only check — industry exists, price parses). This
 * module answers a softer question a draft is allowed to fail: does the
 * listing have enough of a story to show a customer? A record can save
 * cleanly at 40% ready — Basic and Prices filled in, nothing else — and
 * that is fine right up until someone tries to submit it for review.
 *
 * No DB import, the same rule `listing.ts` follows: every fact this module
 * needs arrives already resolved (a label, a count, a boolean), so it runs
 * identically in the browser, where the editor already holds labels via
 * `options`, and later in a Server Action's submit gate, once one exists.
 * One definition, two callers, never two opinions about what "ready" means.
 */

export interface ReadinessFacts {
  hasIndustry: boolean;
  hasProductType: boolean;
  hasFibreType: boolean;
  hasColour: boolean;
  hasCraftTechnique: boolean;
  hasRetailPrice: boolean;
  /** Photographs actually taken, not slots merely wanted. */
  imageCount: number;
  hasShortDescription: boolean;
  hasWhyLove: boolean;
  hasStylingSuggestions: boolean;
  hasCareInstructions: boolean;
  /** Only meaningful while creating — an existing record's stock is the ledger's business, not this form's. */
  isNew: boolean;
  hasOpeningStock: boolean;
}

export interface ReadinessItem {
  key: string;
  label: string;
  done: boolean;
  /** Which tab answers this item — a plain string, not the editor's own TabKey, so this module stays import-free of it. */
  tab: string;
}

export interface ReadinessResult {
  /** 0-100, rounded. 100 when there is nothing left to ask — an item list of length zero reads as fully ready, not as a division by zero. */
  percent: number;
  items: ReadinessItem[];
  /** `items` filtered to what is not yet done — the rail's checklist is this, not `items` itself. */
  missing: ReadinessItem[];
}

/**
 * The checklist a listing is scored against. Order is the order a shopper's
 * own questions would come up — what is it, how much, what does it look
 * like, why should I want it, how do I look after it — which is also the
 * order the tabs answering them appear in.
 */
export function assessReadiness(facts: ReadinessFacts): ReadinessResult {
  const items: ReadinessItem[] = [
    { key: "industry", label: "Industry is set", done: facts.hasIndustry, tab: "basic" },
    { key: "productType", label: "Product type is chosen", done: facts.hasProductType, tab: "basic" },
    { key: "fibreType", label: "Fiber type is chosen", done: facts.hasFibreType, tab: "basic" },
    { key: "colour", label: "Colour is chosen", done: facts.hasColour, tab: "craft" },
    { key: "craftTechnique", label: "Craft technique is chosen", done: facts.hasCraftTechnique, tab: "craft" },
    { key: "retailPrice", label: "A selling price is set", done: facts.hasRetailPrice, tab: "prices" },
    { key: "images", label: "At least one photo is uploaded", done: facts.imageCount > 0, tab: "images" },
    { key: "shortDescription", label: "Sales Story has a short description", done: facts.hasShortDescription, tab: "story" },
    { key: "whyLove", label: "Sales Story explains why to love it", done: facts.hasWhyLove, tab: "story" },
    { key: "stylingSuggestions", label: "Sales Story has styling suggestions", done: facts.hasStylingSuggestions, tab: "story" },
    { key: "careInstructions", label: "Care instructions are set", done: facts.hasCareInstructions, tab: "care" },
  ];

  if (facts.isNew) {
    items.push({ key: "openingStock", label: "Opening stock is recorded", done: facts.hasOpeningStock, tab: "basic" });
  }

  const missing = items.filter((i) => !i.done);
  const percent = items.length === 0 ? 100 : Math.round(((items.length - missing.length) / items.length) * 100);

  return { percent, items, missing };
}

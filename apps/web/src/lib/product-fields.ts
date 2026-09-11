/**
 * The category-specific field mechanism.
 *
 * Before this, a new product-type-specific question — Saree gets a length
 * and a width, a Bedsheet gets a bed size — meant a new `{flag &&
 * <Section>...}` block written straight into record-editor.tsx's "Additional
 * Product Details" tab, alongside the four that already exist there
 * (isSaree, isDupattaLike, isFabricPlain, isFabricSet). That pattern still
 * works and those four blocks are left exactly as they are — they are
 * proven, and rewriting working, tested code purely to fit a new mechanism
 * is not worth the risk it would add for no behaviour change.
 *
 * This module is that mechanism, used from here on for every *new*
 * category-specific field group (starting with Saree's own dimensions,
 * which today has none — see the 11 Sep investigation). A block becomes one
 * entry in CATEGORY_FIELD_GROUPS instead of one more inline JSX block, so
 * adding a category after this is a data change plus a lookup seed, not a
 * JSX edit.
 */

import type { AttributeKey, DesignExtra } from "./attributes";

/** One field within a category's group — either a lookup Combo or a free extra field. */
export type ProductFieldSpec =
  | {
      kind: "combo";
      /** The `attributes` key this writes to. */
      key: AttributeKey;
      label: string;
      list: string;
      required?: boolean;
      hint?: string;
      parentFilter?: AttributeKey;
      fallbackToUnparented?: boolean;
    }
  | {
      kind: "number";
      /** The `DesignExtra` key this reads/writes. */
      key: keyof DesignExtra & string;
      label: string;
      unit?: string;
      required?: boolean;
      hint?: string;
    }
  | {
      kind: "text";
      key: keyof DesignExtra & string;
      label: string;
      placeholder?: string;
      required?: boolean;
      hint?: string;
    }
  | {
      kind: "bool";
      key: keyof DesignExtra & string;
      label: string;
      hint?: string;
    };

/**
 * Everything gating a category's field group — the same facts
 * record-editor.tsx already computes by comparing a lookup value's frozen
 * `code` (never its label; see the two warnings inline there about why).
 * Kept minimal on purpose: only what a `when` predicate could plausibly
 * need, not the whole editor's state.
 */
export interface ProductFieldContext {
  /** `product_type`'s own `code` for whatever is chosen — "saree", "bedsheets", null if nothing is. */
  productTypeCode: string | null;
  /** `garment_type`'s own `code` for the chosen Product Sub Type, if any. */
  garmentTypeCode: string | null;
  /** `audience_type`'s own `code` — "kids", "men", "women". */
  audienceCode: string | null;
  isHome: boolean;
}

export interface ProductFieldGroup {
  /** Stable, not shown — for React keys and for tests. */
  id: string;
  title: string;
  cols?: 1 | 2 | 3;
  when: (ctx: ProductFieldContext) => boolean;
  fields: ProductFieldSpec[];
}

/**
 * Populated in Phase 5 (Saree dimensions first — the confirmed gap — then
 * Bedsheet, Kids garment, Scarf/Stole). Empty for now: the mechanism ships
 * ahead of the fields it will carry, so Phase 3's schema work has something
 * real to bind these `key`s to before any of them render.
 */
export const CATEGORY_FIELD_GROUPS: ProductFieldGroup[] = [];

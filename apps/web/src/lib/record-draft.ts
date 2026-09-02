import type { RecordDraft } from "@/app/records/actions";

import { ApiError } from "@/lib/api";
import {
  ATTRIBUTE_KEYS,
  type AttributeKey,
  type RecordDetail,
} from "@/lib/attributes";

/**
 * Turn a JSON body into the draft the record actions already validate.
 *
 * Structure only. Whether a saree may carry a Bedsheets product type, whether
 * a price is a price, whether the industry has been answered — all of that is
 * `validate()` in the actions, and it is not repeated here. Two validators
 * drift, and the one that drifts is always the one the phone talks to.
 *
 * What this does do is refuse to pass anything through that the action would
 * read as a different type than it is. The action was written against a form,
 * where every field arrives as a string; a JSON client will naturally send
 * 2500 where the form sent "2500", and `Number("2500") === Number(2500)` only
 * because nothing in between assumed `.trim()` exists.
 */

/** A price or a count, however the client chose to send it. Blank stays blank. */
function amount(value: unknown, field: string): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value.trim();

  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new ApiError(`${field} is not a number.`, 400);
    return String(value);
  }

  throw new ApiError(`${field} must be a number or a string.`, 400);
}

/** A lookup id, or null. Empty string and null mean the same thing: unanswered. */
function id(value: unknown, field: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new ApiError(`${field} must be an id.`, 400);

  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function ids(value: unknown, field: string): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new ApiError(`${field} must be a list.`, 400);

  return value.map((entry, index) => {
    const one = id(entry, `${field}[${index}]`);
    if (one === null) throw new ApiError(`${field}[${index}] is empty.`, 400);
    return one;
  });
}

function text(value: unknown, field: string): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") throw new ApiError(`${field} must be text.`, 400);
  return value;
}

/**
 * The record as it stands, expressed as the draft that would recreate it.
 *
 * The starting point for a partial update. `saveRecord` writes every column it
 * knows about — an attribute missing from the draft is written as null — so
 * "change one price" has to be expressed as "the whole record, with one price
 * different". Without this, a PATCH naming one field would blank the other
 * thirty-odd.
 */
export function draftFromRecord(record: RecordDetail): RecordDraft {
  /** Paise back to the rupee string the form speaks in. */
  const rupees = (minor: number | null): string =>
    minor === null ? "" : String(minor / 100);

  return {
    colourwayId: record.id,
    attributes: { ...record.attributes },
    descriptors: [...record.descriptors],
    colourId: record.colourId,
    secondaryColourId: record.secondaryColourId,
    prices: {
      cost: rupees(record.costMinor),
      making: rupees(record.makingMinor),
      wholesale: rupees(record.wholesaleMinor),
      retail: rupees(record.retailMinor),
      mrp: rupees(record.mrpMinor),
    },

    /*
      Blank, which means "leave the ledger alone".

      Quantity is not a column to be rewritten; a difference between it and the
      count on hand is appended to the movement ledger as a correction. Filling
      it in from the current count would work — the difference would be zero —
      but only by accident, and a rounding or a concurrent sale between the read
      and the write would append a correction nobody asked for.
    */
    quantity: "",

    // New records only. Stock that already exists is moved by a transfer.
    openingStock: [],

    /*
      Every slot the record already wants.

      Carried rather than left empty: `setImageSlots` replaces the set, so an
      empty list would take the record off its own shot list. A slot holding a
      photograph survives either way, but the empty ones — which are the shot
      list — would not.
    */
    imageSlots: record.images
      .map((image) => image.slotId)
      .filter((slotId): slotId is string => slotId !== null),

    notes: record.notes ?? "",
    name: record.nameIsCustom ? record.name : "",
    nameIsCustom: record.nameIsCustom,
  };
}

/**
 * Overlay a body onto an existing draft, changing only what it names.
 *
 * This is what makes PATCH mean what PATCH says. `toRecordDraft` reads a
 * missing field as "unset", which is right when creating — nothing is there to
 * keep. On an edit it is catastrophic: a request naming one price would arrive
 * at `saveRecord` as a draft with thirty-four empty attributes and blank them
 * all, on a design shared by every colour under it.
 *
 * So absence means "leave alone" here, and only an explicitly sent field is
 * touched. Sending `null` is still how a field is cleared — that is a stated
 * intention rather than a silence.
 */
export function applyToDraft(
  base: RecordDraft,
  fields: Record<string, unknown>,
): RecordDraft {
  const draft: RecordDraft = {
    ...base,
    attributes: { ...base.attributes },
    descriptors: [...base.descriptors],
    prices: { ...base.prices },
    imageSlots: [...base.imageSlots],
  };

  if ("attributes" in fields) {
    const raw = fields["attributes"];

    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      throw new ApiError("attributes must be an object.", 400);
    }

    const given = raw as Record<string, unknown>;

    for (const key of Object.keys(given)) {
      if (!(ATTRIBUTE_KEYS as string[]).includes(key)) {
        throw new ApiError(`"${key}" is not an attribute.`, 400);
      }
    }

    for (const key of ATTRIBUTE_KEYS) {
      if (key in given) draft.attributes[key] = id(given[key], `attributes.${key}`);
    }
  }

  if ("descriptors" in fields) {
    draft.descriptors = ids(fields["descriptors"], "descriptors");
  }

  if ("colourId" in fields) draft.colourId = id(fields["colourId"], "colourId");

  if ("secondaryColourId" in fields) {
    draft.secondaryColourId = id(fields["secondaryColourId"], "secondaryColourId");
  }

  if ("prices" in fields) {
    const prices = fields["prices"];

    if (typeof prices !== "object" || prices === null || Array.isArray(prices)) {
      throw new ApiError("prices must be an object.", 400);
    }

    // Per price, not wholesale: sending only `retail` must not blank the other
    // four, for the same reason as everything else here.
    for (const key of ["cost", "making", "wholesale", "retail", "mrp"] as const) {
      if (key in (prices as Record<string, unknown>)) {
        draft.prices[key] = amount(
          (prices as Record<string, unknown>)[key],
          `prices.${key}`,
        );
      }
    }
  }

  if ("quantity" in fields) draft.quantity = amount(fields["quantity"], "quantity");

  if ("imageSlots" in fields) {
    draft.imageSlots = ids(fields["imageSlots"], "imageSlots");
  }

  if ("notes" in fields) draft.notes = text(fields["notes"], "notes");

  if ("name" in fields) {
    draft.name = text(fields["name"], "name");
    // Typing a name is what makes it custom; clearing it hands the name back
    // to the taxonomy.
    draft.nameIsCustom = draft.name.trim() !== "";
  }

  if ("nameIsCustom" in fields) draft.nameIsCustom = fields["nameIsCustom"] === true;

  /*
    Opening stock is refused rather than ignored.

    It writes a `received` movement from Production, which on an existing
    record is not an edit but an invention of stock. Moving what is already
    here is a transfer; more arriving is a consignment. Silently dropping it
    would let a caller believe it had been recorded.
  */
  if ("openingStock" in fields) {
    throw new ApiError(
      "Opening stock is only for a new record. Use a transfer or a consignment.",
      400,
    );
  }

  return draft;
}

export function toRecordDraft(fields: Record<string, unknown>): RecordDraft {
  const raw = fields["attributes"];

  if (raw !== undefined && (typeof raw !== "object" || raw === null || Array.isArray(raw))) {
    throw new ApiError("attributes must be an object.", 400);
  }

  const given = (raw ?? {}) as Record<string, unknown>;

  /*
    Only the keys the attribute map knows.

    An unknown key is refused rather than ignored: `borderHight` silently
    dropped is a record saved without a border height and a person certain
    they set one. The map is also what stops a key naming a column that is not
    an attribute — the save builds SQL identifiers from it.
  */
  for (const key of Object.keys(given)) {
    if (!(ATTRIBUTE_KEYS as string[]).includes(key)) {
      throw new ApiError(`"${key}" is not an attribute.`, 400);
    }
  }

  const attributes: Partial<Record<AttributeKey, string | null>> = {};
  for (const key of ATTRIBUTE_KEYS) {
    if (key in given) attributes[key] = id(given[key], `attributes.${key}`);
  }

  const prices = (fields["prices"] ?? {}) as Record<string, unknown>;

  if (typeof prices !== "object" || prices === null || Array.isArray(prices)) {
    throw new ApiError("prices must be an object.", 400);
  }

  const opening = fields["openingStock"];
  if (opening !== undefined && !Array.isArray(opening)) {
    throw new ApiError("openingStock must be a list.", 400);
  }

  return {
    attributes,
    descriptors: ids(fields["descriptors"], "descriptors"),
    colourId: id(fields["colourId"], "colourId"),
    secondaryColourId: id(fields["secondaryColourId"], "secondaryColourId"),
    prices: {
      cost: amount(prices["cost"], "prices.cost"),
      making: amount(prices["making"], "prices.making"),
      wholesale: amount(prices["wholesale"], "prices.wholesale"),
      retail: amount(prices["retail"], "prices.retail"),
      mrp: amount(prices["mrp"], "prices.mrp"),
    },
    quantity: amount(fields["quantity"], "quantity"),
    openingStock: ((opening ?? []) as unknown[]).map((line, index) => {
      if (typeof line !== "object" || line === null || Array.isArray(line)) {
        throw new ApiError(`openingStock[${index}] must be an object.`, 400);
      }

      const entry = line as Record<string, unknown>;
      const locationId = id(entry["locationId"], `openingStock[${index}].locationId`);

      if (locationId === null) {
        throw new ApiError(`openingStock[${index}] needs a location.`, 400);
      }

      return { locationId, qty: amount(entry["qty"], `openingStock[${index}].qty`) };
    }),
    imageSlots: ids(fields["imageSlots"], "imageSlots"),
    notes: text(fields["notes"], "notes"),
    name: text(fields["name"], "name"),
    nameIsCustom: fields["nameIsCustom"] === true,
  };
}

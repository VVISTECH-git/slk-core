import type { BaleDraft } from "@/app/bales/actions";

import { ApiError } from "@/lib/api";

/**
 * Turn a JSON body into the draft `createBale` already validates.
 *
 * Same reasoning as `record-draft.ts`: `createBale`/`parseBaleFields` were
 * written against a form, where every field arrives as a string. This only
 * guards the shape — a client sending 500 where the form sends "500" — and
 * leaves what a valid bale actually looks like to the action itself.
 */

function text(value: unknown, field: string): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") throw new ApiError(`${field} must be text.`, 400);
  return value;
}

/** A quantity or a price, however the client chose to send it. Blank stays blank. */
function amount(value: unknown, field: string): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value.trim();

  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new ApiError(`${field} is not a number.`, 400);
    return String(value);
  }

  throw new ApiError(`${field} must be a number or a string.`, 400);
}

export function toBaleDraft(body: Record<string, unknown>): BaleDraft {
  return {
    supplierId: text(body.supplierId, "supplierId"),
    billEntryDate: text(body.billEntryDate, "billEntryDate"),
    transporter: text(body.transporter, "transporter"),
    invoiceNumber: text(body.invoiceNumber, "invoiceNumber"),
    invoiceDate: text(body.invoiceDate, "invoiceDate"),
    invoiceAmount: amount(body.invoiceAmount, "invoiceAmount"),
    type: text(body.type, "type"),
    metresReceived: amount(body.metresReceived, "metresReceived"),
    uom: text(body.uom, "uom"),
    itemId: text(body.itemId, "itemId"),
    gradeCode: text(body.gradeCode, "gradeCode"),
    baleCount: amount(body.baleCount, "baleCount"),
    notes: text(body.notes, "notes"),
  };
}

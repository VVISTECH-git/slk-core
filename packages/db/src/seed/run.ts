import { eq } from "drizzle-orm";

import type { Database } from "../client";
import { lookupList, lookupValue } from "../schema/lookup";
import { EMPTY_LISTS, MASTER_LISTING, type SeedList } from "./master-listing";

/**
 * Seeds the controlled vocabulary.
 *
 * Idempotent, and deliberately conservative: it inserts what is missing and
 * leaves everything else alone. Once the app can maintain these lists, a
 * re-seed must not undo a rename someone made on the Values screen — so
 * existing rows are never updated, only reported.
 *
 * Codes are derived from the workbook label once and then frozen. A later
 * rename changes `label`; `code` is what records and application logic hold
 * onto, so regenerating it would defeat the point of the whole design.
 */

export function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export interface SeedReport {
  listsInserted: number;
  listsExisting: number;
  valuesInserted: number;
  valuesExisting: number;
}

async function seedList(
  db: Database,
  spec: SeedList,
  report: SeedReport,
): Promise<void> {
  const existing = await db
    .select()
    .from(lookupList)
    .where(eq(lookupList.code, spec.code));

  let list = existing[0];

  if (list === undefined) {
    const inserted = await db
      .insert(lookupList)
      .values({
        code: spec.code,
        label: spec.label,
        description: spec.description,
        lowercaseValues: spec.lowercaseValues ?? false,
        isSystem: spec.isSystem ?? false,
      })
      .returning();

    list = inserted[0];
    report.listsInserted += 1;
  } else {
    report.listsExisting += 1;
  }

  if (list === undefined) {
    throw new Error(`could not create or find lookup list "${spec.code}"`);
  }

  // Parent labels resolve against a different list, which the ordering in
  // MASTER_LISTING guarantees has already been seeded.
  const parents = new Map<string, string>();

  if (spec.parentList !== undefined) {
    const parentList = (
      await db
        .select()
        .from(lookupList)
        .where(eq(lookupList.code, spec.parentList))
    )[0];

    if (parentList === undefined) {
      throw new Error(
        `list "${spec.code}" needs parent list "${spec.parentList}", which has not been seeded`,
      );
    }

    const parentValues = await db
      .select()
      .from(lookupValue)
      .where(eq(lookupValue.listId, parentList.id));

    for (const value of parentValues) {
      parents.set(value.label, value.id);
    }
  }

  const present = new Set(
    (
      await db
        .select({ code: lookupValue.code })
        .from(lookupValue)
        .where(eq(lookupValue.listId, list.id))
    ).map((row) => row.code),
  );

  for (const [index, value] of spec.values.entries()) {
    const code = slugify(value.label);

    if (present.has(code)) {
      report.valuesExisting += 1;
      continue;
    }

    let parentValueId: string | null = null;

    if (value.parent !== undefined) {
      const resolved = parents.get(value.parent);

      if (resolved === undefined) {
        throw new Error(
          `"${value.label}" in ${spec.code} points at "${value.parent}", which is not in ${spec.parentList ?? "(no parent list)"}`,
        );
      }

      parentValueId = resolved;
    }

    await db.insert(lookupValue).values({
      listId: list.id,
      code,
      label: value.label,
      sortOrder: index,
      parentValueId,
      isProposed: value.proposed ?? false,
      needsReview: value.needsReview ?? false,
      meta: value.meta ?? {},
    });

    report.valuesInserted += 1;
  }
}

export async function seedMasterListing(db: Database): Promise<SeedReport> {
  const report: SeedReport = {
    listsInserted: 0,
    listsExisting: 0,
    valuesInserted: 0,
    valuesExisting: 0,
  };

  for (const spec of [...MASTER_LISTING, ...EMPTY_LISTS]) {
    await seedList(db, spec, report);
  }

  return report;
}

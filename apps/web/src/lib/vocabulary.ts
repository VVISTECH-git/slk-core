import { asc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { lookupList, lookupValue } from "@slk/db";
import { findDuplicates, type DuplicateHint } from "@slk/domain";

import { db } from "@/lib/db";

export interface VocabValue {
  id: string;
  code: string;
  label: string;
  listCode: string;
  listLabel: string;
  lowercase: boolean;
  isActive: boolean;
  isDefault: boolean;
  isProposed: boolean;
  needsReview: boolean;
  parentLabel: string | null;
  hex: string | null;
}

export interface VocabList {
  id: string;
  code: string;
  label: string;
  count: number;
}

export type VocabDuplicate = DuplicateHint<VocabValue>;

export function duplicatesFor(values: VocabValue[]): VocabDuplicate[] {
  return findDuplicates(values);
}

export async function loadVocabulary(): Promise<{
  values: VocabValue[];
  lists: VocabList[];
}> {
  const parent = alias(lookupValue, "parent");

  const rows = await db
    .select({
      id: lookupValue.id,
      code: lookupValue.code,
      label: lookupValue.label,
      isActive: lookupValue.isActive,
      isDefault: lookupValue.isDefault,
      isProposed: lookupValue.isProposed,
      needsReview: lookupValue.needsReview,
      meta: lookupValue.meta,
      parentLabel: parent.label,
      listCode: lookupList.code,
      listLabel: lookupList.label,
      lowercase: lookupList.lowercaseValues,
    })
    .from(lookupValue)
    .innerJoin(lookupList, eq(lookupList.id, lookupValue.listId))
    .leftJoin(parent, eq(parent.id, lookupValue.parentValueId))
    .orderBy(asc(lookupList.label), asc(lookupValue.sortOrder));

  const values: VocabValue[] = rows.map((r) => ({
    id: r.id,
    code: r.code,
    label: r.label,
    listCode: r.listCode,
    listLabel: r.listLabel,
    lowercase: r.lowercase,
    isActive: r.isActive,
    isDefault: r.isDefault,
    isProposed: r.isProposed,
    needsReview: r.needsReview,
    parentLabel: r.parentLabel,
    hex:
      typeof r.meta === "object" &&
      r.meta !== null &&
      "hex" in r.meta &&
      typeof (r.meta as { hex: unknown }).hex === "string"
        ? (r.meta as { hex: string }).hex
        : null,
  }));

  const allLists = await db
    .select({
      id: lookupList.id,
      code: lookupList.code,
      label: lookupList.label,
    })
    .from(lookupList)
    .orderBy(asc(lookupList.label));

  const counts = new Map<string, number>();
  for (const v of values) {
    counts.set(v.listCode, (counts.get(v.listCode) ?? 0) + 1);
  }

  return {
    values,
    lists: allLists.map((l) => ({ ...l, count: counts.get(l.code) ?? 0 })),
  };
}

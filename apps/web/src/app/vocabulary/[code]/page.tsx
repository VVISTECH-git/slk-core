import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { lookupList, lookupValue } from "@slk/db";

import { db } from "@/lib/db";

import { ValueRows, AddValue } from "./value-editor";

export const dynamic = "force-dynamic";

export default async function ListPage({
  params,
}: PageProps<"/vocabulary/[code]">) {
  const { code } = await params;

  const lists = await db
    .select()
    .from(lookupList)
    .where(eq(lookupList.code, code));

  const list = lists[0];
  if (list === undefined) notFound();

  const parent = alias(lookupValue, "parent");

  const values = await db
    .select({
      id: lookupValue.id,
      code: lookupValue.code,
      label: lookupValue.label,
      isActive: lookupValue.isActive,
      isProposed: lookupValue.isProposed,
      needsReview: lookupValue.needsReview,
      meta: lookupValue.meta,
      parentLabel: parent.label,
    })
    .from(lookupValue)
    .leftJoin(parent, eq(parent.id, lookupValue.parentValueId))
    .where(eq(lookupValue.listId, list.id))
    .orderBy(asc(lookupValue.sortOrder));

  const flagged = values.filter((v) => v.isProposed || v.needsReview).length;
  const retired = values.filter((v) => !v.isActive).length;

  return (
    <div className="mx-auto max-w-4xl px-8 py-10">
      <Link
        href="/vocabulary"
        className="mb-5 inline-block font-mono text-[11px] uppercase tracking-[0.12em] text-muted hover:text-brick"
      >
        ← Categories &amp; Attributes
      </Link>

      <header className="mb-7">
        <div className="mb-2 flex flex-wrap items-baseline gap-3">
          <h1 className="text-[27px] font-semibold tracking-tight text-ink">
            {list.label}
          </h1>
          <span className="font-mono text-[12px] text-faint">{list.code}</span>
          {list.isSystem && (
            <span className="rounded-full border border-rule-2 px-2.5 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.1em] text-muted">
              system list
            </span>
          )}
        </div>

        {list.description && (
          <p className="max-w-[64ch] text-[15px] leading-relaxed text-ink-2">
            {list.description}
          </p>
        )}

        <p className="mt-3 font-mono text-[11.5px] text-faint">
          {values.length} value{values.length === 1 ? "" : "s"}
          {flagged > 0 && ` · ${flagged} unconfirmed`}
          {retired > 0 && ` · ${retired} retired`}
          {list.lowercaseValues && " · stored lower case"}
        </p>
      </header>

      {values.length === 0 ? (
        <div className="rounded-lg border border-dashed border-rule-2 bg-surface px-6 py-8 text-center">
          <p className="mb-1 text-[15px] font-medium text-ink">
            No values yet
          </p>
          <p className="mx-auto max-w-[52ch] text-[13.5px] leading-relaxed text-muted">
            The workbook defines this column but leaves it blank, so it is free
            text on the entry form. Add a value and it becomes a dropdown.
          </p>
        </div>
      ) : (
        <ValueRows listCode={list.code} values={values} />
      )}

      <AddValue listCode={list.code} lowercase={list.lowercaseValues} />

      <p className="mt-8 max-w-[64ch] border-t border-rule pt-4 text-[13px] leading-relaxed text-faint">
        Renaming a value updates every record that uses it, because records
        store a reference rather than the word. Design codes and QR labels are
        built from the code, not the label, and never change.
      </p>
    </div>
  );
}

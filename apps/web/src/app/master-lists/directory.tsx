"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import type { VocabList, VocabValue } from "@/lib/vocabulary";

import { HealthMark, Header, StatusPill, Swatch } from "./ui";

/**
 * The landing screen: which list do you want?
 *
 * This used to be 27 filter chips above a flat table of 229 rows — a list of
 * entities rendered as controls, which is why it read as a wall. A list is a
 * thing you open, so it gets a row.
 */
export function Directory({
  lists,
  values,
  attention,
}: {
  lists: VocabList[];
  values: VocabValue[];
  attention: number;
}) {
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();

  const matchedLists = useMemo(() => {
    if (q === "") return lists;
    return lists.filter(
      (l) =>
        l.label.toLowerCase().includes(q) ||
        l.code.toLowerCase().includes(q) ||
        (l.description ?? "").toLowerCase().includes(q),
    );
  }, [lists, q]);

  /**
   * Values matching the same box.
   *
   * The hierarchy costs one thing: you can no longer see across lists at a
   * glance. That matters here — typing "zari" turns up Zari (Border Style),
   * Zari Work (Craft Technique) and Zari Pallu (Pallu Design), and collisions
   * like that are most of what the Correction Log records. So the search
   * spans lists even though the structure does not.
   */
  const matchedValues = useMemo(() => {
    if (q.length < 2) return [];
    return values.filter((v) => v.label.toLowerCase().includes(q)).slice(0, 40);
  }, [values, q]);

  const crossList = new Set(matchedValues.map((v) => v.listCode)).size > 1;
  const totalValues = lists.reduce((sum, l) => sum + l.total, 0);

  /**
   * The fourteen empty lists sit in their own block at the bottom.
   *
   * They are the Garments and Home columns that arrived empty in the
   * workbook, and every one of them reads identically. Left in alphabetical
   * order they form an unbroken run of ten indistinguishable rows in the
   * middle of the page — exactly the wall this redesign set out to remove.
   * They are still real lists worth filling, so they are collected rather
   * than hidden.
   */
  const [filled, empty] = useMemo(
    () => [
      matchedLists.filter((l) => l.total > 0),
      matchedLists.filter((l) => l.total === 0),
    ],
    [matchedLists],
  );

  return (
    <div className="flex min-h-screen flex-col">
      <Header
        title="Master Lists"
        lede={`The controlled vocabulary every product record is built from. ${lists.length} lists, ${totalValues} values.`}
        actions={
          attention > 0 ? (
            <Link
              href="/master-lists/review"
              className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-[13px] font-medium transition-colors"
              style={{
                borderColor: "var(--warn)",
                background: "var(--warn-soft)",
                color: "var(--warn)",
              }}
            >
              {attention} to review
            </Link>
          ) : undefined
        }
      />

      <div className="flex-1 px-8 py-6">
        <div className="mx-auto max-w-4xl">
          <label className="block">
            <span className="sr-only">Search lists and values</span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search a list, or a value in any list"
              className="w-full rounded-lg border border-rule-2 bg-surface px-3.5 py-2.5 text-[13.5px] text-ink placeholder:text-faint focus:border-brick focus:outline-none"
            />
          </label>

          {matchedValues.length > 0 && (
            <section className="mt-5">
              <h2 className="mb-2 flex items-baseline gap-2 text-[12px] font-medium text-muted">
                Values
                {crossList && (
                  <span className="text-[11.5px] font-normal text-warn">
                    — matches in more than one list
                  </span>
                )}
              </h2>

              <ul className="overflow-hidden rounded-lg border border-rule bg-surface">
                {matchedValues.map((v) => (
                  <li key={v.id} className="border-b border-rule last:border-b-0">
                    <Link
                      href={`/master-lists/${v.listCode}?value=${v.id}`}
                      className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-2"
                    >
                      <Swatch value={v} />
                      <span className="min-w-0 flex-1 truncate text-[13.5px] text-ink">
                        {v.label}
                      </span>
                      <span className="flex-none text-[12px] text-muted">
                        {v.listLabel}
                      </span>
                      {v.status !== "active" && <StatusPill status={v.status} />}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="mt-5">
            {q !== "" && matchedLists.length > 0 && (
              <h2 className="mb-2 text-[12px] font-medium text-muted">
                Lists ({matchedLists.length})
              </h2>
            )}

            {matchedLists.length === 0 ? (
              // Silent when values matched. Searching "zari" is looking for a
              // value, and being told no *list* is called that is an answer to
              // a question nobody asked.
              matchedValues.length > 0 ? null : (
                <p className="rounded-lg border border-dashed border-rule-2 px-4 py-8 text-center text-[13px] text-muted">
                  Nothing matches “{query}” — no list, and no value in any list.
                </p>
              )
            ) : (
              <ul className="overflow-hidden rounded-lg border border-rule bg-surface">
                {filled.map((list) => (
                  <ListRow key={list.id} list={list} />
                ))}
              </ul>
            )}
          </section>

          {empty.length > 0 && (
            <section className="mt-6">
              <h2 className="mb-1 text-[13px] font-medium text-ink-2">
                Not yet filled
                <span className="ml-2 font-mono text-[12px] font-normal text-muted tabular-nums">
                  {empty.length}
                </span>
              </h2>
              <p className="mb-2 text-[12px] leading-relaxed text-muted">
                These arrived empty in the workbook. Until a list has values,
                the attribute is free text on a product record — anyone can type
                anything, and nothing catches a second spelling.
              </p>

              <ul className="overflow-hidden rounded-lg border border-dashed border-rule-2">
                {empty.map((list) => (
                  <li key={list.id} className="border-b border-rule last:border-b-0">
                    <Link
                      href={`/master-lists/${list.code}`}
                      className="flex items-center gap-3 px-4 py-2 transition-colors hover:bg-surface-2"
                    >
                      <span className="min-w-0 flex-1 truncate text-[13px] text-ink-2">
                        {list.label}
                      </span>
                      <span aria-hidden className="flex-none text-faint">›</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function ListRow({ list }: { list: VocabList }) {
  return (
    <li className="border-b border-rule last:border-b-0">
      <Link
        href={`/master-lists/${list.code}`}
        className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-surface-2"
      >
        <div className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-[14px] font-medium text-ink">
              {list.label}
            </span>
            {list.isSystem && (
              <span
                title="The application reads these values by code — they can be relabelled but not removed."
                className="flex-none rounded px-1.5 py-0.5 text-[10.5px] font-medium"
                style={{ background: "var(--surface-3)", color: "var(--muted)" }}
              >
                System
              </span>
            )}
          </span>
          <span className="mt-0.5 block truncate text-[12px] text-muted">
            {list.description ??
              (list.defaultLabel === null
                ? "No default set"
                : `Defaults to ${list.defaultLabel}`)}
          </span>
        </div>

        <span className="w-32 flex-none text-right font-mono text-[12px] text-muted tabular-nums">
          {list.active === list.total
            ? `${list.total} value${list.total === 1 ? "" : "s"}`
            : `${list.active} of ${list.total} active`}
        </span>

        <span className="w-28 flex-none">
          <HealthMark health={list.health} />
        </span>

        <span aria-hidden className="flex-none text-faint">›</span>
      </Link>
    </li>
  );
}

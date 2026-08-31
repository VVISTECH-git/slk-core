"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import type { VocabDuplicate, VocabValue } from "@/lib/vocabulary";

import {
  clearReview,
  mergeValues,
  setStatus,
  type ActionResult,
} from "../actions";
import { Button, Header, StatusPill, Swatch, ToastBar, useToast } from "../ui";

/**
 * Everything in the vocabulary that wants a decision, in one place.
 *
 * These used to be a filter — a tab called "Needs attention" that showed the
 * same table with fewer rows in it. A filter tells you something is wrong; it
 * does not help you finish. An item here states the question and carries the
 * answers, and leaves the list when it is answered.
 *
 * Three kinds, in the order they are worth doing:
 *
 *   Duplicates   Two values that look like one. Merging is destructive and
 *                repoints real records, so it is the decision worth making
 *                while the vocabulary is still small.
 *   Proposals    The Correction Log's suggestions, awaiting a yes or no.
 *   Review       Flagged to check against real stock — the slowest to answer,
 *                because answering means going and looking at sarees.
 */
export function Inbox({
  duplicates,
  proposals,
  review,
}: {
  duplicates: VocabDuplicate[];
  proposals: VocabValue[];
  review: VocabValue[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [toast, showToast] = useToast();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  function run(action: () => Promise<ActionResult>) {
    start(async () => {
      const result = await action();
      showToast(result);
      if (result.ok) router.refresh();
    });
  }

  const openDuplicates = duplicates.filter(
    (d) => !dismissed.has(`${d.a.id}:${d.b.id}`),
  );

  const total = openDuplicates.length + proposals.length + review.length;

  return (
    <div className="flex min-h-screen flex-col">
      <Header
        crumbs={[{ label: "Master Lists", href: "/master-lists" }, { label: "Review" }]}
        title="Review"
        lede={
          total === 0
            ? "Nothing is waiting on a decision."
            : `${total} thing${total === 1 ? "" : "s"} in the vocabulary want a decision.`
        }
      />

      <div className="flex-1 px-8 py-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-8">
          {total === 0 && (
            <div className="rounded-lg border border-dashed border-rule-2 px-6 py-16 text-center">
              <p className="text-[14px] text-ink-2">All clear.</p>
              <p className="mx-auto mt-1.5 max-w-md text-[12.5px] leading-relaxed text-muted">
                No possible duplicates, no proposals awaiting confirmation, and
                nothing flagged for checking against stock.
              </p>
              <Link
                href="/master-lists"
                className="mt-4 inline-block text-[13px] text-brick hover:underline"
              >
                Back to Master Lists
              </Link>
            </div>
          )}

          {openDuplicates.length > 0 && (
            <Section
              title="Possible duplicates"
              lede="Two values in the same list that look like one word spelled twice. Merging repoints every record onto the survivor and removes the other — it cannot be undone."
              count={openDuplicates.length}
            >
              {openDuplicates.map((pair) => (
                <li
                  key={`${pair.a.id}:${pair.b.id}`}
                  className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-rule px-4 py-3 last:border-b-0"
                >
                  <div className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2 text-[13.5px] text-ink">
                      <Value value={pair.a} />
                      <span className="text-faint">vs</span>
                      <Value value={pair.b} />
                    </span>
                    <span className="mt-0.5 block text-[12px] text-muted">
                      {pair.a.listLabel} — {pair.reason}
                    </span>
                  </div>

                  <div className="flex flex-none items-center gap-1.5">
                    <Button
                      disabled={pending}
                      title={`Keep "${pair.a.label}"`}
                      onClick={() => run(() => mergeValues(pair.a.id, [pair.b.id]))}
                    >
                      Keep {pair.a.label}
                    </Button>
                    <Button
                      disabled={pending}
                      title={`Keep "${pair.b.label}"`}
                      onClick={() => run(() => mergeValues(pair.b.id, [pair.a.id]))}
                    >
                      Keep {pair.b.label}
                    </Button>
                    <button
                      type="button"
                      onClick={() =>
                        setDismissed((prev) =>
                          new Set(prev).add(`${pair.a.id}:${pair.b.id}`),
                        )
                      }
                      // Hidden for this sitting only, not stored. A pair that
                      // is genuinely two different words should be worth
                      // seeing again next time rather than silently gone.
                      title="Hide until the page is reloaded"
                      className="px-1.5 text-[12.5px] text-muted hover:text-ink hover:underline"
                    >
                      Different
                    </button>
                  </div>
                </li>
              ))}
            </Section>
          )}

          {proposals.length > 0 && (
            <Section
              title="Awaiting confirmation"
              lede="The workbook's Correction Log proposed these. Until one is confirmed it is not offered on a new record."
              count={proposals.length}
            >
              {proposals.map((v) => (
                <Item
                  key={v.id}
                  value={v}
                  pending={pending}
                  actions={
                    <>
                      <Button
                        disabled={pending}
                        onClick={() => run(() => setStatus([v.id], "active"))}
                      >
                        Confirm
                      </Button>
                      <Button
                        tone="danger"
                        disabled={pending}
                        onClick={() => run(() => setStatus([v.id], "retired"))}
                      >
                        Reject
                      </Button>
                    </>
                  }
                />
              ))}
            </Section>
          )}

          {review.length > 0 && (
            <Section
              title="Check against stock"
              lede="Flagged in the workbook as needing checking against what SLK actually makes. Clearing the flag does not change the value — it records that someone looked."
              count={review.length}
              bulk={
                <Button
                  disabled={pending}
                  onClick={() => run(() => clearReview(review.map((v) => v.id)))}
                >
                  Mark all checked
                </Button>
              }
            >
              {review.map((v) => (
                <Item
                  key={v.id}
                  value={v}
                  pending={pending}
                  actions={
                    <Button
                      disabled={pending}
                      onClick={() => run(() => clearReview([v.id]))}
                    >
                      Checked
                    </Button>
                  }
                />
              ))}
            </Section>
          )}
        </div>
      </div>

      <ToastBar toast={toast} onDismiss={() => showToast(null)} />
    </div>
  );
}

function Section({
  title,
  lede,
  count,
  bulk,
  children,
}: {
  title: string;
  lede: string;
  count: number;
  bulk?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-2.5 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-[14px] font-semibold text-ink">
            {title}
            <span className="ml-2 font-mono text-[12px] font-normal text-muted tabular-nums">
              {count}
            </span>
          </h2>
          <p className="mt-0.5 max-w-2xl text-[12px] leading-relaxed text-muted">
            {lede}
          </p>
        </div>
        {bulk !== undefined && <div className="flex-none">{bulk}</div>}
      </div>

      <ul className="overflow-hidden rounded-lg border border-rule bg-surface">
        {children}
      </ul>
    </section>
  );
}

function Value({ value }: { value: VocabValue }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Swatch value={value} />
      <span className="font-medium">{value.label}</span>
    </span>
  );
}

function Item({
  value: v,
  actions,
}: {
  value: VocabValue;
  pending: boolean;
  actions: React.ReactNode;
}) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-rule px-4 py-3 last:border-b-0">
      <div className="min-w-0 flex-1">
        <Link
          href={`/master-lists/${v.listCode}?value=${v.id}`}
          className="flex items-center gap-2 text-[13.5px] text-ink hover:underline"
        >
          <Swatch value={v} />
          {v.label}
        </Link>
        <span className="mt-0.5 flex items-center gap-2 text-[12px] text-muted">
          {v.listLabel}
          {v.status !== "active" && <StatusPill status={v.status} />}
        </span>
      </div>

      <div className="flex flex-none items-center gap-1.5">{actions}</div>
    </li>
  );
}

import Link from "next/link";
import { sql } from "drizzle-orm";

import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// A type alias, not an interface: `db.execute<T>` constrains T to
// Record<string, unknown>, and only aliases get an implicit index signature.
type ListRow = {
  code: string;
  label: string;
  description: string | null;
  total: number;
  active: number;
  flagged: number;
};

async function loadLists(): Promise<ListRow[]> {
  return db.execute<ListRow>(sql`
    select
      l.code,
      l.label,
      l.description,
      count(v.id)::int                                                as total,
      count(v.id) filter (where v.is_active)::int                     as active,
      count(v.id) filter (where v.is_proposed or v.needs_review)::int as flagged
    from lookup_list l
    left join lookup_value v on v.list_id = l.id
    group by l.id, l.code, l.label, l.description
    order by count(v.id) = 0, l.label
  `);
}

export default async function VocabularyPage() {
  const lists = await loadLists();
  const populated = lists.filter((l) => l.total > 0);
  const empty = lists.filter((l) => l.total === 0);
  const values = populated.reduce((sum, l) => sum + l.total, 0);
  const flagged = populated.reduce((sum, l) => sum + l.flagged, 0);

  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
      <header className="mb-8">
        <p className="mb-2 font-mono text-[10.5px] uppercase tracking-[0.16em] text-faint">
          Lookup master
        </p>
        <h1 className="mb-2 text-[27px] font-semibold tracking-tight text-ink">
          Categories &amp; Attributes
        </h1>
        <p className="max-w-[62ch] text-[15px] leading-relaxed text-ink-2">
          The vocabulary every product record draws on. Records store a
          reference to a value, never the word itself, so renaming one here
          updates it everywhere at once.
        </p>
      </header>

      <dl className="mb-8 flex flex-wrap gap-x-10 gap-y-3 border-y border-rule py-4">
        <Stat label="Lists" value={populated.length} />
        <Stat label="Values" value={values} />
        <Stat label="Unconfirmed" value={flagged} tone={flagged ? "warn" : undefined} />
        <Stat label="Empty lists" value={empty.length} />
      </dl>

      <ul className="overflow-hidden rounded-lg border border-rule bg-surface">
        {populated.map((list, i) => (
          <li key={list.code} className={i > 0 ? "border-t border-rule" : ""}>
            <Link
              href={`/vocabulary/${list.code}`}
              className="flex items-baseline gap-4 px-5 py-4 hover:bg-surface-2"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-medium text-ink">
                  {list.label}
                </span>
                {list.description && (
                  <span className="mt-0.5 block text-[13px] leading-snug text-muted">
                    {list.description}
                  </span>
                )}
              </span>

              {list.flagged > 0 && (
                <span className="flex-none rounded-full bg-warn-soft px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-warn">
                  {list.flagged} unconfirmed
                </span>
              )}

              <span className="w-14 flex-none text-right font-mono text-[13px] tabular-nums text-ink-2">
                {list.total}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      {empty.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-2 text-[15px] font-semibold text-ink">
            Empty lists
          </h2>
          <p className="mb-4 max-w-[62ch] text-[13.5px] leading-relaxed text-muted">
            Columns the workbook defines but leaves blank. Each is free text on
            the entry form until it has values — add one and the field becomes a
            dropdown, with no code change.
          </p>
          <ul className="flex flex-wrap gap-2">
            {empty.map((list) => (
              <li key={list.code}>
                <Link
                  href={`/vocabulary/${list.code}`}
                  className="inline-block rounded-md border border-rule-2 bg-surface px-3 py-1.5 text-[13px] text-ink-2 hover:border-brick hover:text-brick"
                >
                  {list.label}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "warn";
}) {
  return (
    <div>
      <dt className="font-mono text-[10px] uppercase tracking-[0.13em] text-faint">
        {label}
      </dt>
      <dd
        className={`text-[22px] font-semibold tabular-nums ${
          tone === "warn" ? "text-warn" : "text-ink"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

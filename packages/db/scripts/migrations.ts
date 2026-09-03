import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Checks the migration journal before anything trusts it.
 *
 *   pnpm db:check          say whether the journal is sound
 *   pnpm db:check --fix    repair the ordering, then say
 *
 * Runs ahead of `drizzle-kit migrate`, which means it runs on every production
 * deploy, because the failures it catches are all silent ones. Three have
 * happened here already:
 *
 *   · The journal named migrations the repository did not contain. drizzle-kit
 *     exited 1 and every deploy was blocked until somebody read the build log.
 *
 *   · A migration file existed and had no journal entry. It was never applied,
 *     nothing said so, and the column it added was missing for a day.
 *
 *   · A hand-written entry carried a timestamp in the future. The next
 *     generated migration got a smaller one and was skipped — not applied, not
 *     recorded, no error. That one is worth understanding, because it is not
 *     obvious from the outside:
 *
 *         if (!lastDbMigration || Number(lastDbMigration.created_at) < migration.folderMillis)
 *
 *     drizzle-orm/pg-core/dialect.js. A migration runs only when its journal
 *     `when` is greater than the highest already recorded. The hash is stored
 *     and never compared, so "have I run this one" is not the question being
 *     asked — "is it newer than everything I have run" is. One entry out of
 *     order and everything after it disappears without a word.
 *
 * So the invariant is simply that `when` increases with `idx`, and this refuses
 * to migrate until it does.
 */

const HERE = resolve(import.meta.dirname, "../migrations");
const JOURNAL = resolve(HERE, "meta/_journal.json");

interface Entry {
  idx: number;
  version: string;
  when: number;
  tag: string;
  breakpoints: boolean;
}

interface Journal {
  version: string;
  dialect: string;
  entries: Entry[];
}

const fix = process.argv.includes("--fix");

const journal: Journal = JSON.parse(readFileSync(JOURNAL, "utf8"));
const entries = [...journal.entries].sort((a, b) => a.idx - b.idx);

const problems: string[] = [];
const notes: string[] = [];

/*
  Ordering first, and repaired before it is judged when --fix is on.

  Only the last entry is moved, and only upwards. Everything before it may
  already have been applied somewhere — production records `created_at` as the
  journal's `when` at the moment it ran — and lowering one of those would make
  a history that has happened disagree with the file that describes it.
*/
if (fix) {
  for (let i = 1; i < entries.length; i++) {
    const previous = entries[i - 1]!;
    const entry = entries[i]!;

    if (entry.when <= previous.when) {
      const was = entry.when;
      entry.when = previous.when + 1000;
      notes.push(
        `moved ${entry.tag} from ${was} to ${entry.when}, past ${previous.tag}`,
      );
    }
  }

  if (notes.length > 0) {
    journal.entries = entries;
    writeFileSync(JOURNAL, `${JSON.stringify(journal, null, 2)}\n`);
  }
}

for (let i = 0; i < entries.length; i++) {
  const entry = entries[i]!;

  if (entry.idx !== i) {
    problems.push(`entry ${i} is numbered ${entry.idx} — the sequence has a hole`);
  }

  if (i > 0) {
    const previous = entries[i - 1]!;
    if (entry.when <= previous.when) {
      problems.push(
        `${entry.tag} is timestamped ${entry.when}, not after ${previous.tag} at ${previous.when} — ` +
          `it would be skipped in silence. Run pnpm db:check --fix.`,
      );
    }
  }
}

/*
  The journal and the folder have to describe the same set. Either direction
  being wrong is its own kind of quiet: a named file that is missing stops the
  deploy, and an unnamed file that exists never runs at all.
*/
const onDisk = readdirSync(HERE)
  .filter((name) => name.endsWith(".sql"))
  .map((name) => name.replace(/\.sql$/, ""));

const named = new Set(entries.map((e) => e.tag));

for (const entry of entries) {
  if (!onDisk.includes(entry.tag)) {
    problems.push(`${entry.tag}.sql is named in the journal and not in the folder`);
  }
}

for (const file of onDisk) {
  if (!named.has(file)) {
    problems.push(`${file}.sql is in the folder and not in the journal — it will never run`);
  }
}

/*
  Advisory. A timestamp well ahead of the clock is not itself a fault — only
  the ordering decides what runs — but every migration generated until the
  clock catches up will need repairing, so it is worth knowing you are in that
  window rather than rediscovering it each time.
*/
const last = entries.at(-1);
const ahead = last === undefined ? 0 : last.when - Date.now();

if (ahead > 0) {
  const hours = (ahead / 3_600_000).toFixed(1);
  notes.push(
    `${last!.tag} is timestamped ${hours}h ahead of the clock. Until then, ` +
      `drizzle-kit generate will produce an entry that needs --fix.`,
  );
}

for (const note of notes) console.log(`  · ${note}`);

if (problems.length > 0) {
  console.error(`\n  The migration journal is not sound:\n`);
  for (const problem of problems) console.error(`    ${problem}`);
  console.error("");
  process.exit(1);
}

console.log(
  `  ${entries.length} migrations, in order, all present.` +
    (last === undefined ? "" : ` Latest: ${last.tag}.`),
);

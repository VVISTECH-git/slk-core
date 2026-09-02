import { createInterface } from "node:readline";
import { resolve } from "node:path";
import { Writable } from "node:stream";

import { config } from "dotenv";
import postgres from "postgres";

import { hashSecret } from "@slk/domain";

config({ path: resolve(process.cwd(), "../../.env") });

/**
 * Create an actor, or set an existing one's PIN.
 *
 *   pnpm db:actor --list
 *   pnpm db:actor <code> "<name>" [floor|office|owner]
 *
 * The PIN is asked for here and never passed as an argument. An argument is
 * kept in shell history, shown in `ps` to everyone on the machine, and lands
 * in whatever log wraps the build — none of which is where a credential that
 * signs into a stock ledger should end up.
 *
 * Run against the real database on purpose: this is how the first owner comes
 * to exist, and there is no screen that creates one. Unlike db:clean there is
 * no localhost guard, because creating an account on production is the point.
 */

const url = process.env["DIRECT_URL"] ?? process.env["DATABASE_URL"] ?? "";

if (url === "") {
  console.error("\n  DATABASE_URL is not set.\n");
  process.exit(1);
}

const sql = postgres(url);

const [code, name, role = "floor"] = process.argv.slice(2);

if (code === "--list") {
  const actors = await sql`
    select a.code, a.name, a.role, a.is_active as "active",
           count(t.id) filter (
             where t.revoked_at is null and t.expires_at > now()
           )::int as "signedIn"
    from actor a
    left join actor_token t on t.actor_id = a.id
    group by a.id
    order by a.code
  `;

  if (actors.length === 0) console.log("\nNo actors yet.\n");
  else console.table(actors);

  await sql.end();
  process.exit(0);
}

if (code === undefined || name === undefined) {
  console.error(
    "\n  Usage: pnpm db:actor <code> \"<name>\" [floor|office|owner]\n" +
      "         pnpm db:actor --list\n",
  );
  process.exit(1);
}

if (!["floor", "office", "owner"].includes(role)) {
  console.error(`\n  "${role}" is not a role. Use floor, office or owner.\n`);
  process.exit(1);
}

/** Ask without echoing — a PIN typed on a shared screen is a PIN shared. */
function askHidden(question: string): Promise<string> {
  let muted = false;

  const output = new Writable({
    write(chunk, encoding, done) {
      if (!muted) process.stdout.write(chunk, encoding as BufferEncoding);
      done();
    },
  });

  const rl = createInterface({ input: process.stdin, output, terminal: true });

  return new Promise((done) => {
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write("\n");
      done(answer.trim());
    });
    muted = true;
  });
}

/**
 * Six, not four.
 *
 * Four digits is ten thousand possibilities — about eight minutes of guessing
 * against this hashing cost, or twenty-five seconds with a few requests in
 * flight. Six is a million, for one more keypress. The login's lockout is the
 * other half of the same fix; neither is enough alone.
 *
 * Kept in step with MIN_PIN_LENGTH in apps/web/src/lib/auth.ts by hand — this
 * script may not import from the app.
 */
const MIN_PIN_LENGTH = 6;

const pin = await askHidden(`PIN for ${name} (${code}), ${MIN_PIN_LENGTH}+ digits: `);

if (pin.length < MIN_PIN_LENGTH) {
  console.error(`\n  A PIN needs at least ${MIN_PIN_LENGTH} characters.\n`);
  await sql.end();
  process.exit(1);
}

if (/^(\d)\1*$/.test(pin) || "0123456789".includes(pin) || "9876543210".includes(pin)) {
  // 111111, 123456 and 654321 are the first things anybody tries, and a
  // six-digit space does not help if the PIN is one of the ten obvious ones.
  console.error("\n  That PIN is too easy to guess. Pick another.\n");
  await sql.end();
  process.exit(1);
}

if (await askHidden("Again: ") !== pin) {
  console.error("\n  Those did not match.\n");
  await sql.end();
  process.exit(1);
}

const secretHash = await hashSecret(pin);

const [saved] = await sql`
  insert into actor (code, name, role, secret_hash)
  values (${code}, ${name}, ${role}, ${secretHash})
  on conflict (code) do update
    set name = excluded.name,
        role = excluded.role,
        secret_hash = excluded.secret_hash,
        is_active = true,
        updated_at = now()
  returning code, name, role, (xmax = 0) as "created"
`;

console.log(
  `\n  ${saved!["created"] ? "Created" : "Updated"} ${saved!["name"]} ` +
    `(${saved!["code"]}, ${saved!["role"]}).\n`,
);

/*
  Every existing sign-in on this account is ended.

  Setting a PIN is either a new account, which has none, or a response to the
  old one being known by someone it should not be — and in the second case
  leaving the phones that used it signed in defeats the point of changing it.
*/
const ended = await sql`
  update actor_token set revoked_at = now()
  where actor_id = (select id from actor where code = ${code})
    and revoked_at is null and expires_at > now()
  returning id
`;

if (ended.length > 0) {
  console.log(`  ${ended.length} existing sign-in(s) ended — they must sign in again.\n`);
}

await sql.end();

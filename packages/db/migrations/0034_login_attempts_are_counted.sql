-- Failed sign-ins, counted, so the login stops accepting unlimited guesses.
--
-- Measured on this machine: one PIN check costs 49ms of scrypt. Ten thousand
-- four-digit PINs is therefore eight minutes serially, or twenty-five seconds
-- with twenty requests in flight. The scrypt cost buys time, not safety.
--
-- Two things close it. PINs became six digits — a million possibilities
-- instead of ten thousand — and this table refuses a code after five
-- consecutive failures, for a doubling interval.
--
-- Keyed by the code as TYPED, not by an actor id, so codes that belong to
-- nobody are counted too. Keying on the actor would leave unknown codes
-- unlimited, which is both a way to map who works here (watch which codes can
-- be locked) and a way to make the server burn scrypt for free.
--
-- The first generated migration since 0003: the snapshot baseline was rebuilt
-- in 0033, so drizzle-kit can diff against the real schema again.

CREATE TABLE "login_attempt" (
	"code" text PRIMARY KEY NOT NULL,
	"failures" integer DEFAULT 0 NOT NULL,
	"last_failure_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_until" timestamp with time zone
);

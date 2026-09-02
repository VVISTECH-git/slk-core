import Link from "next/link";

import { isRole } from "@/lib/auth";
import { requirePage } from "@/lib/session";

export const dynamic = "force-dynamic";

/** What each role is for, in the words the Staff screen uses. */
const WHAT: Record<string, string> = {
  floor: "counting, moving and photographing stock",
  office: "pricing, the catalogue and Master Lists",
  owner: "managing who can sign in",
};

export default async function DeniedPage({
  searchParams,
}: {
  searchParams: Promise<{ needs?: string }>;
}) {
  // Signed in, just not far enough up — so this page has a door too, and
  // someone signed out is sent to sign in rather than told what they lack.
  const who = await requirePage();

  const asked = (await searchParams).needs ?? "";
  const needs = isRole(asked) ? asked : null;

  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="max-w-md">
        <h1 className="text-[19px] leading-tight font-semibold tracking-tight text-ink">
          Not for your account
        </h1>

        <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
          {needs === null
            ? "That screen is not open to your account."
            : `That screen is for ${needs} accounts — ${WHAT[needs]}. You are signed in as ${who.name}, which is ${who.role}.`}
        </p>

        <p className="mt-3 text-[13.5px] leading-relaxed text-muted">
          An owner can change what your account is allowed to do, on the Staff
          screen.
        </p>

        <Link
          href="/records"
          className="mt-6 inline-block rounded-md bg-brick px-3 py-2 text-[13.5px] font-medium text-on-brick transition-colors hover:bg-brick-2"
        >
          Back to Product Management
        </Link>
      </div>
    </div>
  );
}

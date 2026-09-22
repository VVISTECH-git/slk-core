import Link from "next/link";
import { redirect } from "next/navigation";

import { currentActor, homeFor } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Signed in, but that screen isn't theirs. This page asks for nothing
 * beyond being signed in — it used to require Admin like every other page,
 * which sent a Handler here from `/` and then here again from here.
 * `needs` is the comma-separated list of job roles the page wanted, or the
 * old Role word from a page that hasn't been given a job role of its own.
 */
export default async function DeniedPage({
  searchParams,
}: {
  searchParams: Promise<{ needs?: string }>;
}) {
  const who = await currentActor();
  if (who === null) redirect("/login");

  const asked = (await searchParams).needs ?? "";
  const roles = asked
    .split(",")
    .map((r) => decodeURIComponent(r).trim())
    .filter((r) => r !== "" && r !== "floor" && r !== "office" && r !== "owner");
  const home = homeFor(who);

  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="max-w-md">
        <h1 className="text-[19px] leading-tight font-semibold tracking-tight text-ink">
          Not for your account
        </h1>

        <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
          {roles.length === 0
            ? "That screen needs the Admin job role."
            : `That screen is for ${roles.join(" or ")}.`}{" "}
          You are signed in as {who.name}
          {who.jobRoles.length > 0 ? ` (${who.jobRoles.join(", ")})` : " with no job role yet"}.
        </p>

        <p className="mt-3 text-[13.5px] leading-relaxed text-muted">
          An Admin can change your job roles on the Staff screen.
        </p>

        {home !== "/denied" && (
          <Link
            href={home}
            className="mt-6 inline-block rounded-md bg-brick px-3 py-2 text-[13.5px] font-medium text-on-brick transition-colors hover:bg-brick-2"
          >
            Go to your page
          </Link>
        )}
      </div>
    </div>
  );
}

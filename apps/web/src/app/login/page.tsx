import { redirect } from "next/navigation";

import { currentActor } from "@/lib/session";

import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  // Already signed in — showing the form would invite someone to sign in
  // again and mint a second token for the same browser.
  if ((await currentActor()) !== null) redirect("/records");

  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-7">
          <h1 className="text-[19px] leading-tight font-semibold tracking-tight text-ink">
            Sree Lakshmi Kalamkari
          </h1>
          <p className="mt-1 text-[13px] text-muted">
            Stock, catalogue and channels
          </p>
        </div>

        <div className="rounded-xl border border-rule bg-surface p-6 shadow-sm">
          <LoginForm />
        </div>

        <p className="mt-5 text-[12.5px] leading-relaxed text-muted">
          The same code and PIN you use on the phone. If you have forgotten it,
          the owner can set a new one — there is no way to recover the old one,
          and that is deliberate.
        </p>
      </div>
    </div>
  );
}

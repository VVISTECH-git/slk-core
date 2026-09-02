"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";

import { inputClass } from "@/components/ui";

import { signIn, type SignInResult } from "./actions";

/**
 * The sign-in form.
 *
 * A code and a PIN, because that is what staff have — `actor.code` is "a short
 * code, not an email", chosen because this is typed on a shop floor by someone
 * holding a saree, and SLK's staff do not each have an email address. The same
 * two things sign in the phone.
 *
 * No "forgot your PIN" link. There is nowhere for it to send anything, and a
 * link that opens a screen saying "ask the owner" is a worse way of saying it
 * than the sentence underneath.
 */
export function LoginForm() {
  const router = useRouter();

  const [result, act, pending] = useActionState<SignInResult | null, FormData>(
    async (previous, form) => {
      const answer = await signIn(previous, form);

      if (answer.ok) {
        /*
          Replace, then refresh.

          Replace so Back does not return to a login form for a session that
          now exists. Refresh because signing in changes what the *layout*
          renders — the sidebar appears, built from the actor — and a
          navigation alone reuses the shell that was rendered for a visitor
          with no cookie.
        */
        router.replace("/records");
        router.refresh();
      }

      return answer;
    },
    null,
  );

  return (
    <form action={act} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-[12.5px] font-medium text-ink-2">Code</span>
        <input
          name="code"
          autoFocus
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          className={inputClass}
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-[12.5px] font-medium text-ink-2">PIN</span>
        <input
          name="pin"
          type="password"
          autoComplete="current-password"
          // Numeric, because it is a PIN and a phone should offer digits —
          // but not `type=number`, which brings spinners and drops leading
          // zeros on a value where a leading zero is a character.
          inputMode="numeric"
          required
          className={inputClass}
        />
      </label>

      {result?.ok === false && result.message !== undefined && (
        <p
          role="alert"
          className="rounded-md border border-brick bg-brick-soft px-3 py-2 text-[13px] leading-relaxed text-brick"
        >
          {result.message}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="mt-1 rounded-md bg-brick px-3 py-2 text-[13.5px] font-medium text-on-brick transition-colors hover:bg-brick-2 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

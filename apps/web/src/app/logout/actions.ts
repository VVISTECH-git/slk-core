"use server";

import { redirect } from "next/navigation";

import { endSession } from "@/lib/session";

/**
 * Sign out.
 *
 * Revokes the row as well as dropping the cookie — see `endSession`. Its own
 * file rather than a member of some screen's actions, because it belongs to
 * the shell and every screen has the button.
 */
export async function signOut(): Promise<void> {
  await endSession();
  redirect("/login");
}

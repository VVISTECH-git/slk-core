import Link from "next/link";

import { Legal } from "@/components/legal";

export const metadata = { title: "Delete your account — SLK Mobile" };

/**
 * The account-deletion page Google Play's data safety form links to. Public,
 * like the privacy policy, and honest about how it works here: accounts are
 * the business's, so its administrator closes them — there is no button in
 * the app that deletes an account, and this page does not pretend otherwise.
 */
export default function DeleteAccountPage() {
  return (
    <Legal title="Delete your account" updated="24 September 2026">
      <p>
        SLK Mobile accounts are created by Sree Lakshmi Kalamkari for its staff, so they are closed by the business as
        well. You do not need to be signed in, and you do not need the app installed, to ask.
      </p>

      <h2>How to ask</h2>
      <ol>
        <li>
          Tell the business&apos;s administrator you want your account closed, in person or in writing, giving the name
          and sign-in code the account uses. If you cannot reach the administrator, email{" "}
          <a href="mailto:admin@vvistech.com" className="text-brick underline">admin@vvistech.com</a> with the same
          details and the app&apos;s name.
        </li>
        <li>
          The administrator deactivates the account from the Staff screen and ends its sessions. This is done within
          seven days of the request, and usually the same day.
        </li>
        <li>You will no longer be able to sign in on any device, and nothing about you remains on the phone once the app is removed.</li>
      </ol>

      <h2>What is removed</h2>
      <ul>
        <li>Your ability to sign in: the sign-in code stops working and the PIN hash is no longer usable.</li>
        <li>Every active session on every device.</li>
        <li>Any scans that were still waiting on your phone, once the app is uninstalled.</li>
      </ul>

      <h2>What is retained, and why</h2>
      <p>
        The stock actions you carried out while working — which bale was cut, what was sent to which vendor, what came
        back, what went on a shelf — stay in the business&apos;s records with your name against them. These are the
        business&apos;s own accounting records of its stock and of what it owes its vendors, and they are kept for as
        long as the business needs them for its accounts. They are not shared with anyone outside the business.
      </p>
      <p>
        Product photographs you took are photographs of the business&apos;s products, not of you, and remain in its
        catalogue.
      </p>

      <p className="mt-6 text-[13px] text-muted">
        See also the{" "}
        <Link href="/privacy" className="text-brick underline">
          privacy policy
        </Link>
        .
      </p>
    </Legal>
  );
}

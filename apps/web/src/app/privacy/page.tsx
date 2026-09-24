import Link from "next/link";

import { Legal } from "@/components/legal";

export const metadata = { title: "Privacy policy — SLK Mobile" };

/**
 * The privacy policy Google Play and the App Store link to. Public: no
 * sign-in, because the store's checker and a prospective user both arrive
 * with none. Written for what the app actually does — a staff tool for one
 * business, no advertising, no analytics — and kept in step with it: if the
 * app starts collecting something new, this page changes in the same commit.
 */
export default function PrivacyPage() {
  return (
    <Legal title="Privacy policy" updated="24 September 2026">
      <p>
        SLK Mobile is the stock and production app of Sree Lakshmi Kalamkari, used by its own staff and by nobody
        else. It is not offered to the public, shows no advertising, and contains no analytics or tracking software.
        This page says what the app records, why, where it is kept and how to have it removed.
      </p>

      <h2>Who can use the app</h2>
      <p>
        Accounts are created by the business for its staff. There is no self sign-up. Each account is a name, a short
        sign-in code and a PIN chosen by the business; the PIN is stored only as a one-way hash and cannot be read back
        by anyone.
      </p>

      <h2>What the app records</h2>
      <ul>
        <li>
          <strong>Who did what, and when.</strong> Every stock action taken in the app — cutting a bale, sending or
          receiving cloth, putting stock on a shelf, taking a product photograph — is written to the business&apos;s
          records together with the account that did it and the time. This is the app&apos;s purpose: it is the
          business&apos;s ledger of its own stock.
        </li>
        <li>
          <strong>Sign-in sessions.</strong> A session token is kept on the phone so you stay signed in. The business
          can end any session from its administration screen.
        </li>
        <li>
          <strong>Photographs of products.</strong> The camera is used to scan QR labels on cloth and to photograph
          products for the catalogue. Those photographs are of cloth and garments, not of people, and are uploaded to
          the business&apos;s image store. QR scanning happens on the phone; no video leaves it.
        </li>
        <li>
          <strong>Scans in progress.</strong> Labels scanned but not yet submitted are kept on the phone only, so a
          closed app does not lose them. They are removed once submitted or cleared.
        </li>
      </ul>

      <h2>What the app does not do</h2>
      <ul>
        <li>It does not read your contacts, messages, location or files.</li>
        <li>It does not use the camera for anything but scanning labels and product photographs you take.</li>
        <li>It does not share or sell any information to third parties, and shows no advertising.</li>
      </ul>

      <h2>Where information is kept</h2>
      <p>
        Records are stored in the business&apos;s database and served by its own web service. Product photographs are
        stored in an object store. All of these are hosted by cloud providers acting on the business&apos;s
        instructions, and all traffic between the app and the service is encrypted.
      </p>

      <h2>How long it is kept</h2>
      <p>
        Stock records are business records and are kept for as long as the business needs them for its accounts.
        Sign-in sessions end when you sign out, when the business ends them, or when they expire. Nothing is kept on
        the phone after you sign out except the app itself.
      </p>

      <h2>Your account and its removal</h2>
      <p>
        Because accounts belong to the business, an account is closed by the business&apos;s administrator. See the{" "}
        <Link href="/delete-account" className="text-brick underline">
          account deletion page
        </Link>{" "}
        for the steps and for exactly what is removed and what is retained.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about this policy or about your information can be sent to the business&apos;s administrator, or to
        the app&apos;s developer at <a href="mailto:admin@vvistech.com" className="text-brick underline">admin@vvistech.com</a>.
      </p>
    </Legal>
  );
}

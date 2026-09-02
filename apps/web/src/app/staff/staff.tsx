"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  Button,
  Drawer,
  Field,
  Header,
  ToastBar,
  inputClass,
  useToast,
} from "@/components/ui";
import type { StaffRow } from "@/lib/staff";

import {
  createStaff,
  revokeSessions,
  setActive,
  setPin,
  setRole,
  type Result,
} from "./actions";

/**
 * Who can sign in.
 *
 * The portal and the phone share one set of accounts, so this is the only
 * screen either of them has for people. Everything on it was previously
 * `pnpm db:actor` on somebody's laptop pointed at the production database.
 *
 * Deliberately plain. It is used a handful of times a year — a new person, a
 * forgotten PIN, a handset left somewhere — and a screen for that should be
 * legible on the day rather than clever.
 */

const ROLES = [
  {
    key: "floor",
    label: "Floor",
    what: "Count, move and photograph stock. Receive a delivery.",
  },
  {
    key: "office",
    label: "Office",
    what: "Everything floor can, plus pricing, the catalogue and Master Lists.",
  },
  {
    key: "owner",
    label: "Owner",
    what: "Everything, including this screen.",
  },
] as const;

export function Staff({ rows, minPin }: { rows: StaffRow[]; minPin: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [toast, showToast] = useToast();

  const [adding, setAdding] = useState(false);
  const [pinFor, setPinFor] = useState<StaffRow | null>(null);

  function run(action: () => Promise<Result>, onOk?: () => void) {
    start(async () => {
      const result = await action();
      showToast(result);
      if (result.ok) {
        onOk?.();
        router.refresh();
      }
    });
  }

  const active = rows.filter((r) => r.isActive).length;

  return (
    <div className="flex min-h-screen flex-col">
      <Header
        title="Staff"
        lede={`Who can sign in, on the phone and here — the same code and PIN for both. ${active} active of ${rows.length}.`}
        actions={
          <Button tone="primary" onClick={() => setAdding(true)}>
            Add person
          </Button>
        }
      />

      <div className="flex-1 px-8 py-6">
        <div className="overflow-x-auto rounded-lg border border-rule bg-surface">
          <table className="w-full border-collapse text-[13.5px]">
            <thead>
              <tr className="border-b border-rule text-left text-[12px] font-medium text-muted">
                <th className="px-4 py-2.5">Name</th>
                <th className="px-3 py-2.5">Code</th>
                <th className="px-3 py-2.5">Role</th>
                <th className="px-3 py-2.5 text-right">Signed in</th>
                <th className="px-3 py-2.5">Last seen</th>
                <th className="px-3 py-2.5 text-right">Movements</th>
                <th className="px-3 py-2.5 text-right">Actions</th>
              </tr>
            </thead>

            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-16 text-center">
                    <p className="mb-1 text-[15px] font-medium text-ink">
                      Nobody yet
                    </p>
                    <p className="mx-auto max-w-md text-[13.5px] leading-relaxed text-muted">
                      The first owner is created with{" "}
                      <code className="font-mono text-[12.5px]">pnpm db:actor</code>,
                      because there has to be somebody before there is a screen.
                      Everyone after that is added here.
                    </p>
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr
                    key={row.id}
                    className={`h-12 border-b border-rule last:border-b-0 ${
                      row.isActive ? "" : "opacity-55"
                    }`}
                  >
                    <td className="px-4 text-ink">
                      {row.name}
                      {!row.isActive && (
                        <span className="ml-2 text-[11.5px] text-muted">
                          switched off
                        </span>
                      )}
                    </td>

                    <td className="px-3 font-mono text-[12.5px] text-ink-2">
                      {row.code}
                    </td>

                    <td className="px-3">
                      <select
                        value={row.role}
                        disabled={pending}
                        onChange={(e) => run(() => setRole(row.id, e.target.value))}
                        aria-label={`Role for ${row.name}`}
                        className="rounded-md border border-rule-2 bg-surface px-2 py-1 text-[12.5px] text-ink"
                      >
                        {ROLES.map((r) => (
                          <option key={r.key} value={r.key}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                    </td>

                    <td className="px-3 text-right font-mono text-[12.5px] tabular-nums text-ink-2">
                      {row.sessions === 0 ? "—" : row.sessions}
                    </td>

                    <td className="px-3 text-[12.5px] text-muted">
                      {row.lastSeen ?? "never"}
                    </td>

                    <td className="px-3 text-right font-mono text-[12.5px] tabular-nums text-muted">
                      {row.movements === 0 ? "—" : row.movements}
                    </td>

                    <td className="px-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          disabled={pending}
                          onClick={() => setPinFor(row)}
                          title={
                            row.hasPin
                              ? `Set a new PIN for ${row.name}`
                              : `${row.name} has no PIN — set one so they can sign in`
                          }
                        >
                          {row.hasPin ? "New PIN" : "Set PIN"}
                        </Button>

                        <Button
                          disabled={pending || row.sessions === 0}
                          onClick={() => run(() => revokeSessions(row.id))}
                          title={
                            row.sessions === 0
                              ? "Not signed in anywhere"
                              : `Sign ${row.name} out of every device`
                          }
                        >
                          Sign out
                        </Button>

                        <Button
                          tone={row.isActive ? "danger" : "quiet"}
                          disabled={pending}
                          onClick={() => run(() => setActive(row.id, !row.isActive))}
                        >
                          {row.isActive ? "Switch off" : "Switch on"}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <p className="mt-4 max-w-2xl text-[12.5px] leading-relaxed text-muted">
          A PIN cannot be read back — only replaced. Setting a new one signs that
          person out of everything, because a PIN is replaced when the old one is
          not trusted. Switching somebody off does the same, at once, rather than
          waiting for their token to expire.
        </p>
      </div>

      {adding && (
        <AddDrawer
          minPin={minPin}
          pending={pending}
          onClose={() => setAdding(false)}
          onRun={run}
        />
      )}

      {pinFor !== null && (
        <PinDrawer
          row={pinFor}
          minPin={minPin}
          pending={pending}
          onClose={() => setPinFor(null)}
          onRun={run}
        />
      )}

      <ToastBar toast={toast} onDismiss={() => showToast(null)} />
    </div>
  );
}

function AddDrawer({
  minPin,
  pending,
  onClose,
  onRun,
}: {
  minPin: number;
  pending: boolean;
  onClose: () => void;
  onRun: (action: () => Promise<Result>, onOk?: () => void) => void;
}) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<string>("floor");
  const [pin, setPin] = useState("");

  const chosen = ROLES.find((r) => r.key === role);

  return (
    <Drawer
      open
      title="Add person"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            tone="primary"
            disabled={pending || code.trim() === "" || name.trim() === ""}
            onClick={() =>
              onRun(() => createStaff(code, name, role, pin), onClose)
            }
          >
            Add
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field
          label="Name"
          hint="How they are known. Shown beside what they record."
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            className={inputClass}
          />
        </Field>

        <Field
          label="Code"
          hint="What they type to sign in — short, no spaces. Not an email: this is typed on a phone by somebody holding a saree."
        >
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoCapitalize="none"
            spellCheck={false}
            className={`${inputClass} font-mono`}
          />
        </Field>

        <Field label="Role" hint={chosen?.what ?? ""}>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className={inputClass}
          >
            {ROLES.map((r) => (
              <option key={r.key} value={r.key}>
                {r.label}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label="PIN"
          hint={`At least ${minPin} digits, and not a run or a repeat. Tell them in person — it cannot be read back from here afterwards.`}
        >
          <input
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            type="password"
            inputMode="numeric"
            className={inputClass}
          />
        </Field>
      </div>
    </Drawer>
  );
}

function PinDrawer({
  row,
  minPin,
  pending,
  onClose,
  onRun,
}: {
  row: StaffRow;
  minPin: number;
  pending: boolean;
  onClose: () => void;
  onRun: (action: () => Promise<Result>, onOk?: () => void) => void;
}) {
  const [pin, setPin] = useState("");

  return (
    <Drawer
      open
      title={`New PIN for ${row.name}`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            tone="primary"
            disabled={pending || pin === ""}
            onClick={() => onRun(() => setPin2(row.id, pin), onClose)}
          >
            Set PIN
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field
          label="PIN"
          hint={`At least ${minPin} digits, and not a run or a repeat.`}
        >
          <input
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            type="password"
            inputMode="numeric"
            autoFocus
            className={inputClass}
          />
        </Field>

        {row.sessions > 0 && (
          <p className="text-[12.5px] leading-relaxed text-muted">
            {row.name} is signed in on {row.sessions} device
            {row.sessions === 1 ? "" : "s"}. Setting a new PIN ends{" "}
            {row.sessions === 1 ? "it" : "all of them"} — a PIN is replaced when
            the old one is not trusted, so leaving those sign-ins alive would
            defeat the point.
          </p>
        )}
      </div>
    </Drawer>
  );
}

/** Aliased because the drawer has a `setPin` of its own for the input. */
const setPin2 = setPin;

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button, Drawer, Field, Header, ToastBar, inputClass, useToast } from "@/components/ui";
import type { SupplierRow } from "@/lib/bales";

import { createSupplier, type ActionResult } from "./actions";

/**
 * Who kora cloth is bought from. Its own screen, same reasoning as Bale
 * Intake: this belongs to Kora to Shelf, not to the catalogue's own
 * vocabulary, which Master Lists already manages for a different set of
 * questions.
 */
export function Suppliers({ rows }: { rows: SupplierRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [toast, showToast] = useToast();
  const [adding, setAdding] = useState(false);

  function run(action: () => Promise<ActionResult>, onOk?: () => void) {
    start(async () => {
      const result = await action();
      showToast(result);
      if (result.ok) {
        onOk?.();
        router.refresh();
      }
    });
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header
        title="Suppliers"
        lede={`Who kora cloth is bought from. ${rows.length} supplier${rows.length === 1 ? "" : "s"} on file.`}
        actions={
          <Button tone="primary" onClick={() => setAdding(true)}>
            Add supplier
          </Button>
        }
      />

      <div className="flex-1 px-8 py-6">
        <div className="mx-auto max-w-2xl">
          {rows.length === 0 ? (
            <p className="rounded-lg border border-dashed border-rule-2 px-4 py-10 text-center text-[13px] text-muted">
              No suppliers yet. Add the first one — Bale Intake needs at least
              one before a bale can be recorded.
            </p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-rule bg-surface">
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr className="border-b border-rule bg-surface-2 text-left">
                    <th scope="col" className="px-4 py-2 text-[11.5px] font-medium text-muted">
                      Supplier
                    </th>
                    <th scope="col" className="w-24 px-3 py-2 text-[11.5px] font-medium text-muted">
                      Code
                    </th>
                    <th scope="col" className="w-28 px-3 py-2 text-right text-[11.5px] font-medium text-muted">
                      Bales
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="h-11 border-b border-rule last:border-b-0 hover:bg-surface-2">
                      <td className="px-4 text-ink">{r.name}</td>
                      <td className="px-3 font-mono text-[12.5px] text-ink-2">{r.codePrefix}</td>
                      <td className="px-3 text-right font-mono text-[12.5px] text-ink-2 tabular-nums">
                        {r.baleCount}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {adding && (
        <AddDrawer pending={pending} onClose={() => setAdding(false)} onRun={run} />
      )}

      <ToastBar toast={toast} onDismiss={() => showToast(null)} />
    </div>
  );
}

function AddDrawer({
  pending,
  onClose,
  onRun,
}: {
  pending: boolean;
  onClose: () => void;
  onRun: (action: () => Promise<ActionResult>, onOk?: () => void) => void;
}) {
  const [name, setName] = useState("");
  const [codePrefix, setCodePrefix] = useState("");

  const valid = name.trim() !== "" && /^[A-Za-z]{1,4}$/.test(codePrefix.trim());

  return (
    <Drawer
      open
      title="New supplier"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            tone="primary"
            disabled={pending || !valid}
            onClick={() => onRun(() => createSupplier(name, codePrefix), onClose)}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <Field label="Name">
          <input
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </Field>

        <Field
          label="Code"
          hint="1 to 4 letters. Every bale from this supplier is numbered under this letter — A1, A2, A3."
        >
          <input
            className={inputClass}
            value={codePrefix}
            onChange={(e) => setCodePrefix(e.target.value.toUpperCase())}
            maxLength={4}
            style={{ textTransform: "uppercase" }}
          />
        </Field>
      </div>
    </Drawer>
  );
}

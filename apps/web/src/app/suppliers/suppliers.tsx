"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Pager } from "@/components/grid";
import { Button, Drawer, Field, Header, ToastBar, inputClass, useToast } from "@/components/ui";
import type { SupplierRow } from "@/lib/bales";

import { createSupplier, updateSupplier, type ActionResult, type SupplierDraft } from "./actions";

const PER_PAGE = 50;

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
  const [editing, setEditing] = useState<SupplierRow | null>(null);
  const [page, setPage] = useState(1);

  const pages = Math.max(1, Math.ceil(rows.length / PER_PAGE));
  const currentPage = Math.min(page, pages);
  const pageFrom = (currentPage - 1) * PER_PAGE;
  const pageRows = rows.slice(pageFrom, pageFrom + PER_PAGE);

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
        <div className="mx-auto max-w-4xl">
          {rows.length === 0 ? (
            <p className="rounded-lg border border-dashed border-rule-2 px-4 py-10 text-center text-[13px] text-muted">
              No suppliers yet. Add the first one — Bale Intake needs at least
              one before a bale can be recorded.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-rule bg-surface">
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr className="border-b border-rule bg-surface-2 text-left">
                    <th scope="col" className="px-4 py-2 text-[11.5px] font-medium text-muted">
                      Supplier
                    </th>
                    <th scope="col" className="w-20 px-3 py-2 text-[11.5px] font-medium text-muted">
                      Code
                    </th>
                    <th scope="col" className="px-3 py-2 text-[11.5px] font-medium text-muted">
                      Phone
                    </th>
                    <th scope="col" className="px-3 py-2 text-[11.5px] font-medium text-muted">
                      GSTIN
                    </th>
                    <th scope="col" className="px-3 py-2 text-[11.5px] font-medium text-muted">
                      Contact person
                    </th>
                    <th scope="col" className="w-20 px-3 py-2 text-right text-[11.5px] font-medium text-muted">
                      Bales
                    </th>
                    <th scope="col" className="w-24 px-3 py-2 text-[11.5px] font-medium text-muted">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((r) => (
                    <tr
                      key={r.id}
                      onClick={() => setEditing(r)}
                      className={`h-11 cursor-pointer border-b border-rule last:border-b-0 hover:bg-surface-2 ${
                        r.status === "inactive" ? "opacity-60" : ""
                      }`}
                    >
                      <td className="px-4 text-ink" title={r.address ?? ""}>
                        {r.name}
                      </td>
                      <td className="px-3 font-mono text-[12.5px] text-ink-2">{r.codePrefix}</td>
                      <td className="px-3 font-mono text-[12.5px] text-ink-2">{r.phone ?? "—"}</td>
                      <td className="px-3 font-mono text-[12.5px] text-ink-2">{r.gstin ?? "—"}</td>
                      <td className="px-3 text-ink-2">{r.contactPerson ?? "—"}</td>
                      <td className="px-3 text-right font-mono text-[12.5px] text-ink-2 tabular-nums">
                        {r.baleCount}
                      </td>
                      <td className="px-3">
                        <span
                          className="rounded px-1.5 py-0.5 text-[11px] font-medium"
                          style={
                            r.status === "active"
                              ? { background: "var(--ok-soft)", color: "var(--ok)" }
                              : { background: "var(--surface-3)", color: "var(--muted)" }
                          }
                        >
                          {r.status === "active" ? "Active" : "Inactive"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <Pager total={rows.length} page={currentPage} perPage={PER_PAGE} onPage={setPage} />
            </div>
          )}
        </div>
      </div>

      {adding && (
        <AddDrawer pending={pending} onClose={() => setAdding(false)} onRun={run} />
      )}

      {editing !== null && (
        <EditDrawer
          supplier={editing}
          pending={pending}
          onClose={() => setEditing(null)}
          onRun={run}
        />
      )}

      <ToastBar toast={toast} onDismiss={() => showToast(null)} />
    </div>
  );
}

function SupplierFields({
  draft,
  set,
}: {
  draft: SupplierDraft;
  set: <K extends keyof SupplierDraft>(key: K, value: SupplierDraft[K]) => void;
}) {
  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Name">
          <input
            className={inputClass}
            value={draft.name}
            onChange={(e) => set("name", e.target.value)}
            autoFocus
          />
        </Field>

        <Field
          label="Code"
          hint="1 to 4 letters. A short reference for this supplier — bales are numbered separately."
        >
          <input
            className={inputClass}
            value={draft.codePrefix}
            onChange={(e) => set("codePrefix", e.target.value.toUpperCase())}
            maxLength={4}
            style={{ textTransform: "uppercase" }}
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Phone" hint="Who to call about a bale issue or return.">
          <input
            className={inputClass}
            value={draft.phone}
            onChange={(e) => set("phone", e.target.value)}
          />
        </Field>

        <Field label="GSTIN" hint="Optional — not every supplier is GST-registered.">
          <input
            className={inputClass}
            value={draft.gstin}
            onChange={(e) => set("gstin", e.target.value.toUpperCase())}
          />
        </Field>
      </div>

      <Field label="Contact person" hint="When the supplier is a firm rather than an individual.">
        <input
          className={inputClass}
          value={draft.contactPerson}
          onChange={(e) => set("contactPerson", e.target.value)}
        />
      </Field>

      <Field label="Address">
        <textarea
          className={inputClass}
          rows={2}
          value={draft.address}
          onChange={(e) => set("address", e.target.value)}
        />
      </Field>
    </>
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
  const [draft, setDraft] = useState<SupplierDraft>({
    name: "",
    codePrefix: "",
    phone: "",
    gstin: "",
    address: "",
    contactPerson: "",
    status: "active",
  });

  const set = <K extends keyof SupplierDraft>(key: K, value: SupplierDraft[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  const valid = draft.name.trim() !== "" && /^[A-Za-z]{1,4}$/.test(draft.codePrefix.trim());

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
            onClick={() => onRun(() => createSupplier(draft), onClose)}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <SupplierFields draft={draft} set={set} />
      </div>
    </Drawer>
  );
}

function EditDrawer({
  supplier,
  pending,
  onClose,
  onRun,
}: {
  supplier: SupplierRow;
  pending: boolean;
  onClose: () => void;
  onRun: (action: () => Promise<ActionResult>, onOk?: () => void) => void;
}) {
  const [draft, setDraft] = useState<SupplierDraft>({
    name: supplier.name,
    codePrefix: supplier.codePrefix,
    phone: supplier.phone ?? "",
    gstin: supplier.gstin ?? "",
    address: supplier.address ?? "",
    contactPerson: supplier.contactPerson ?? "",
    status: supplier.status,
  });

  const set = <K extends keyof SupplierDraft>(key: K, value: SupplierDraft[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  const valid = draft.name.trim() !== "" && /^[A-Za-z]{1,4}$/.test(draft.codePrefix.trim());

  return (
    <Drawer
      open
      title={`Edit ${supplier.name}`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            tone="primary"
            disabled={pending || !valid}
            onClick={() => onRun(() => updateSupplier(supplier.id, draft), onClose)}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <SupplierFields draft={draft} set={set} />

        <label className="flex items-center gap-2 text-[13px] text-ink-2">
          <input
            type="checkbox"
            checked={draft.status === "active"}
            onChange={(e) => set("status", e.target.checked ? "active" : "inactive")}
          />
          Active — offered when recording a new bale
        </label>
      </div>
    </Drawer>
  );
}

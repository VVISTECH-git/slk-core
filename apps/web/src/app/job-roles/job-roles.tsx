"use client";

import { usePreferences } from "@/components/preferences-provider";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Pager } from "@/components/grid";
import { Button, Drawer, Field, Header, ToastBar, inputClass, useToast } from "@/components/ui";
import type { JobRoleRow } from "@/lib/job-roles";

import { createJobRole, type ActionResult } from "./actions";

/**
 * Job functions — "Bale Custodian" is the first. Assigning people to
 * these happens on the Staff screen; this is just where the list itself
 * is kept. See `packages/db/src/schema/access.ts` for why this is
 * separate from an actor's access level.
 */
export function JobRoles({ rows }: { rows: JobRoleRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [toast, showToast] = useToast();
  const [adding, setAdding] = useState(false);
  const [page, setPage] = useState(1);

  const { preferences } = usePreferences();
  const PER_PAGE = preferences.pageSize;

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
        title="Job Roles"
        lede={`Who's responsible for what. ${rows.length} role${rows.length === 1 ? "" : "s"} on file.`}
        actions={
          <Button tone="primary" onClick={() => setAdding(true)}>
            Add role
          </Button>
        }
      />

      <div className="flex-1 px-8 py-6">
        <div className="mx-auto max-w-2xl">
          {rows.length === 0 ? (
            <p className="rounded-lg border border-dashed border-rule-2 px-4 py-10 text-center text-[13px] text-muted">
              No job roles yet. Add the first one — &ldquo;Bale
              Custodian&rdquo; is a good start.
            </p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-rule bg-surface">
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr className="border-b border-rule bg-surface-2 text-left">
                    <th scope="col" className="px-4 py-2 text-[11.5px] font-medium text-muted">
                      Role
                    </th>
                    <th scope="col" className="w-28 px-3 py-2 text-right text-[11.5px] font-medium text-muted">
                      Staff
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((r) => (
                    <tr key={r.id} className="h-11 border-b border-rule last:border-b-0 hover:bg-surface-2">
                      <td className="px-4 text-ink">{r.name}</td>
                      <td className="px-3 text-right font-mono text-[12.5px] text-ink-2 tabular-nums">
                        {r.actorCount}
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

  return (
    <Drawer
      open
      title="New job role"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            tone="primary"
            disabled={pending || name.trim() === ""}
            onClick={() => onRun(() => createJobRole(name), onClose)}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <Field label="Name" hint="What the job is called — 'Bale Custodian', for example.">
          <input
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            placeholder="Bale Custodian"
          />
        </Field>
      </div>
    </Drawer>
  );
}

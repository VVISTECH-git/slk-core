"use client";

import { useState, useTransition } from "react";

import { Button, inputClass } from "@/components/ui";
import type { StageTargetRow } from "@/lib/control-tower";

import { saveStageTargets } from "./actions";

export function StandardsForm({ initial }: { initial: StageTargetRow[] }) {
  const [rows, setRows] = useState(() =>
    initial.map((r) => ({ stage: r.stage, outDays: String(r.outDays), waitDays: String(r.waitDays), saved: r.saved })),
  );
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const set = (i: number, key: "outDays" | "waitDays", value: string) =>
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, [key]: value } : r)));

  const save = () =>
    start(async () => {
      const result = await saveStageTargets(rows.map(({ stage, outDays, waitDays }) => ({ stage, outDays, waitDays })));
      setMessage({ ok: result.ok, text: result.message });
      if (result.ok) setRows((prev) => prev.map((r) => ({ ...r, saved: true })));
    });

  return (
    <div className="max-w-3xl">
      <div className="overflow-x-auto rounded-lg border border-rule bg-surface">
        <table className="w-full text-[13.5px] tabular-nums">
          <thead>
            <tr className="border-b border-rule text-left text-[12px] text-muted">
              <th className="px-4 py-2.5 font-medium">Stage</th>
              <th className="px-4 py-2.5 font-medium">Days out before overdue</th>
              <th className="px-4 py-2.5 font-medium">Days waiting before idle</th>
              <th className="px-4 py-2.5 font-medium" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.stage} className="border-b border-rule last:border-b-0">
                <td className="px-4 py-2 text-ink">
                  <span className="text-muted">{i + 1}.</span> {r.stage}
                </td>
                <td className="px-4 py-2">
                  <input
                    className={`${inputClass} w-28`}
                    inputMode="decimal"
                    value={r.outDays}
                    disabled={pending}
                    onChange={(e) => set(i, "outDays", e.target.value)}
                    aria-label={`${r.stage}: days out before overdue`}
                  />
                </td>
                <td className="px-4 py-2">
                  <input
                    className={`${inputClass} w-28`}
                    inputMode="decimal"
                    value={r.waitDays}
                    disabled={pending}
                    onChange={(e) => set(i, "waitDays", e.target.value)}
                    aria-label={`${r.stage}: days waiting before idle`}
                  />
                </td>
                <td className="px-4 py-2 text-[12px] text-muted">{r.saved ? "" : "Default"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button tone="primary" disabled={pending} onClick={save}>
          {pending ? "Saving…" : "Save standards"}
        </Button>
        {message && <span className={`text-[13px] ${message.ok ? "text-ok" : "text-brick"}`}>{message.text}</span>}
      </div>
      <p className="mt-4 text-[12.5px] leading-relaxed text-muted">
        Days may be fractions: 0.5 is twelve hours. &ldquo;Default&rdquo; marks a stage still on its starting value
        rather than one someone has set.
      </p>
    </div>
  );
}

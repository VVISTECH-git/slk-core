"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Button, Field, Header, ToastBar, inputClass, useToast } from "@/components/ui";
import type { ColourOption, PileEventRow, PileRow, PileThaan } from "@/lib/piles";

import { PilePhoto, pileStatusLabel, pileStatusStyle } from "../piles";
import { assignThaansToPile, createPile, updatePile, type ActionResult } from "../actions";

/** The "Move ticked to…" choice that means a pile that doesn't exist yet. */
const NEW_PILE = "__new__";

/** Where a Thaan is right now, in the same words the Thaans screen uses. */
function whereNow(t: PileThaan): string {
  if (t.voidedAt !== null) return "Voided";
  if (t.openStage !== null) return `Out for ${t.openStage}`;
  return `${t.completedStages} stage${t.completedStages === 1 ? "" : "s"} done`;
}

function str(detail: Record<string, unknown>, key: string): string | null {
  const v = detail[key];
  return typeof v === "string" && v !== "" ? v : null;
}

/**
 * One history line, in plain words. `detail` is free-form (see
 * `pile_event.detail`), so each kind reads out only the keys it knows it
 * wrote — anything else is left alone rather than dumped as JSON.
 */
function describe(e: PileEventRow, colourLabel: (id: string | null) => string | null): string {
  switch (e.kind) {
    case "created": {
      const name = str(e.detail, "name");
      return name === null ? "Pile made" : `Pile made as “${name}”`;
    }
    case "added":
      return `${e.thaanCode ?? "A Thaan"} added`;
    case "moved": {
      const from = str(e.detail, "from");
      return `${e.thaanCode ?? "A Thaan"} moved in${from === null ? "" : ` from ${from}`}`;
    }
    case "detail_set": {
      const name = str(e.detail, "name");
      const colour = colourLabel(str(e.detail, "mainColourId"));
      const parts = [name === null ? null : `name “${name}”`, colour === null ? null : `colour ${colour}`].filter(
        (p): p is string => p !== null,
      );
      return parts.length === 0 ? "Details changed" : `Details set: ${parts.join(", ")}`;
    }
    case "photo_set":
      return "Photo added";
    case "split":
      return "Pile split";
    default:
      return e.kind;
  }
}

/**
 * One pile, and the two ways it gets put right after the door: its name or
 * colour corrected, or a Thaan that was sorted into the wrong pile ticked
 * and moved to the right one (or to a fresh pile, when the right one
 * doesn't exist yet). Everything else about a pile — the motif, the
 * border, the price — is Phase 2's, and filled in stage by stage.
 */
export function Pile({
  pile,
  colours,
  others,
  canEdit,
}: {
  pile: PileRow & { thaans: PileThaan[]; events: PileEventRow[] };
  colours: ColourOption[];
  /** Every other pile, for the move target list. */
  others: PileRow[];
  /** Whether this reader may change anything — managers read, the door edits. */
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [toast, showToast] = useToast();

  const [name, setName] = useState(pile.name);
  const [mainColourId, setMainColourId] = useState(pile.mainColourId);
  const dirty = name.trim() !== pile.name || mainColourId !== pile.mainColourId;

  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [target, setTarget] = useState("");
  const [newName, setNewName] = useState("");

  const colourLabel = (id: string | null) => (id === null ? null : (colours.find((c) => c.id === id)?.label ?? null));

  const live = pile.thaans.filter((t) => t.voidedAt === null);
  const allTicked = live.length > 0 && live.every((t) => ticked.has(t.id));

  function toggle(id: string) {
    setTicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

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

  /**
   * Move the ticked Thaans. The action answers with counts; the refusals
   * carry a reason each, and those are the part worth reading — "T00002053:
   * not back from Print yet" says what to do, "1 refused" doesn't.
   */
  function move() {
    const ids = [...ticked];
    start(async () => {
      let pileId = target;
      if (target === NEW_PILE) {
        const made = await createPile({ name: newName, mainColourId: null, photoKey: null }, pile.createdStage);
        if (!made.ok || made.pile === undefined) {
          showToast(made);
          return;
        }
        pileId = made.pile.id;
      }

      const result = await assignThaansToPile(pileId, ids, null);
      const refused = result.outcome?.refused ?? [];
      showToast({
        ok: result.ok,
        message:
          refused.length === 0
            ? result.message
            : `${result.message} Refused: ${refused.map((r) => `${r.code} (${r.why})`).join(", ")}.`,
      });
      // Even a partly refused move changed something — refresh whenever
      // any Thaan actually went.
      if ((result.outcome?.added ?? 0) + (result.outcome?.moved ?? 0) > 0 || target === NEW_PILE) {
        setTicked(new Set());
        setTarget("");
        setNewName("");
        router.refresh();
      }
    });
  }

  const canMove =
    ticked.size > 0 && (target === NEW_PILE ? newName.trim() !== "" : target !== "");

  return (
    <div className="flex min-h-screen flex-col">
      <Header
        crumbs={[{ label: "Piles", href: "/piles" }, { label: pile.code }]}
        title={`${pile.code} · ${pile.name}`}
        lede={`Made at ${pile.createdStage} receive${pile.createdByName !== null ? ` by ${pile.createdByName}` : ""}, ${pile.createdAt}. ${pile.thaanCount} Thaan${pile.thaanCount === 1 ? "" : "s"} from ${pile.baleCodes.length === 0 ? "no bale yet" : `bale ${pile.baleCodes.join(", ")}`}.`}
        actions={
          <span className="rounded px-2 py-1 text-[12px] font-medium" style={pileStatusStyle(pile.status)}>
            {pileStatusLabel(pile.status)}
          </span>
        }
      />

      <div className="flex-1 px-8 py-6">
        <div className="mx-auto flex max-w-5xl flex-col gap-6">
          {/* The photo and the two facts fixed at the door, side by side. */}
          <section className="flex flex-wrap gap-6 rounded-lg border border-rule bg-surface p-5">
            <PilePhoto url={pile.photoUrl} alt={`${pile.code} ${pile.name}`} size="large" />

            <div className="flex min-w-64 flex-1 flex-col gap-3.5">
              <Field label="Name" hint="What the floor calls it — the design's name, or whatever they recognise it by.">
                <input
                  className={inputClass}
                  value={name}
                  disabled={!canEdit || pending}
                  onChange={(e) => setName(e.target.value)}
                />
              </Field>

              <Field label="Main colour">
                <select
                  className={inputClass}
                  value={mainColourId ?? ""}
                  disabled={!canEdit || pending}
                  onChange={(e) => setMainColourId(e.target.value === "" ? null : e.target.value)}
                >
                  <option value="">Not set</option>
                  {colours.map((c) => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </select>
              </Field>

              {canEdit && (
                <div className="flex justify-end gap-2">
                  <Button
                    disabled={!dirty || pending}
                    onClick={() => {
                      setName(pile.name);
                      setMainColourId(pile.mainColourId);
                    }}
                  >
                    Revert
                  </Button>
                  <Button
                    tone="primary"
                    disabled={!dirty || pending || name.trim() === ""}
                    onClick={() => run(() => updatePile(pile.id, { name, mainColourId }))}
                  >
                    Save
                  </Button>
                </div>
              )}
            </div>
          </section>

          {/* The Thaans, with the tick column that moves a wrongly sorted one. */}
          <section className="overflow-hidden rounded-lg border border-rule bg-surface">
            <div className="flex flex-wrap items-center gap-3 border-b border-rule bg-surface-2 px-4 py-2.5">
              <h2 className="text-[13px] font-medium text-ink">
                Thaans <span className="font-mono text-[12px] text-muted">{pile.thaans.length}</span>
              </h2>

              {canEdit && pile.thaans.length > 0 && (
                <div className="ml-auto flex flex-wrap items-center gap-2 text-[12.5px] text-ink-2">
                  <span className="text-muted">{ticked.size} ticked</span>
                  <label className="flex items-center gap-1.5">
                    Move ticked to
                    <select
                      className={inputClass}
                      value={target}
                      disabled={pending}
                      onChange={(e) => setTarget(e.target.value)}
                      aria-label="Move ticked Thaans to"
                    >
                      <option value="">Choose a pile</option>
                      {others.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.code} · {p.name}
                        </option>
                      ))}
                      <option value={NEW_PILE}>New pile…</option>
                    </select>
                  </label>
                  {target === NEW_PILE && (
                    <input
                      className={inputClass}
                      value={newName}
                      disabled={pending}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="Name for the new pile"
                      aria-label="Name for the new pile"
                      autoFocus
                    />
                  )}
                  <Button tone="primary" disabled={!canMove || pending} onClick={move}>
                    Move
                  </Button>
                </div>
              )}
            </div>

            {pile.thaans.length === 0 ? (
              <p className="px-4 py-8 text-center text-[13px] text-muted">
                Nothing in this pile — every Thaan that was here has been moved to another.
              </p>
            ) : (
              <table className="w-full border-collapse whitespace-nowrap text-[13px]">
                <thead>
                  <tr className="border-b border-rule text-left">
                    {canEdit && (
                      <th scope="col" className="w-10 px-4 py-2">
                        <input
                          type="checkbox"
                          aria-label="Tick every Thaan"
                          checked={allTicked}
                          disabled={live.length === 0 || pending}
                          onChange={(e) => setTicked(e.target.checked ? new Set(live.map((t) => t.id)) : new Set())}
                        />
                      </th>
                    )}
                    <th scope="col" className="px-3 py-2 text-[11.5px] font-medium text-muted">Code</th>
                    <th scope="col" className="px-3 py-2 text-[11.5px] font-medium text-muted">Bale</th>
                    <th scope="col" className="px-3 py-2 text-[11.5px] font-medium text-muted">Where it is now</th>
                  </tr>
                </thead>
                <tbody>
                  {pile.thaans.map((t) => (
                    <tr
                      key={t.id}
                      className={`h-10 border-b border-rule last:border-b-0 hover:bg-surface-2 ${
                        t.voidedAt !== null ? "opacity-60" : ""
                      }`}
                    >
                      {canEdit && (
                        <td className="px-4">
                          <input
                            type="checkbox"
                            aria-label={`Tick ${t.code ?? "this Thaan"}`}
                            checked={ticked.has(t.id)}
                            // A voided Thaan can't go anywhere — the action refuses it.
                            disabled={t.voidedAt !== null || pending}
                            onChange={() => toggle(t.id)}
                          />
                        </td>
                      )}
                      <td className="px-3 font-mono text-[12.5px] text-ink">{t.code ?? "—"}</td>
                      <td className="px-3 font-mono text-[12.5px] text-ink-2">{t.baleCode}</td>
                      <td className="px-3 text-ink-2" title={t.voidedAt !== null ? `Voided ${t.voidedAt}` : undefined}>
                        {whereNow(t)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          {/* Everything that ever happened to it, newest first. */}
          <section className="rounded-lg border border-rule bg-surface">
            <h2 className="border-b border-rule bg-surface-2 px-4 py-2.5 text-[13px] font-medium text-ink">History</h2>
            {pile.events.length === 0 ? (
              <p className="px-4 py-6 text-center text-[13px] text-muted">Nothing recorded yet.</p>
            ) : (
              <ol className="divide-y divide-rule">
                {pile.events.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-4 py-2.5 text-[13px]">
                    <span className="text-ink">{describe(e, colourLabel)}</span>
                    {e.stage !== null && <span className="text-[12px] text-muted">at {e.stage}</span>}
                    <span className="ml-auto text-[12px] text-muted">
                      {e.actorName ?? "Unknown"} · {e.at}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <p className="text-[12.5px] text-muted">
            <Link href="/piles" className="text-brick underline">Back to Piles</Link>
          </p>
        </div>
      </div>

      <ToastBar toast={toast} onDismiss={() => showToast(null)} />
    </div>
  );
}

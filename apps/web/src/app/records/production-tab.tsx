"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, useTransition } from "react";

import { Button, Field, inputClass } from "@/components/ui";
import type { PipelineSummary } from "@/lib/pipeline-fields";
import type { PipelineThaan, RecordShelf } from "@/lib/pipeline-records";

import { moveThaansToRecord, shelveRecord } from "./pipeline-actions";

/**
 * The production side of a record made at the door: the Thaans sorted into
 * it and where each is, a way to move one that was sorted wrong to the
 * record it belongs to, and the shelf — prices, a location, and the button
 * that turns the Thaans back from Ironing into stock pieces.
 *
 * Loaded on its own, not with the record: the Thaan list and the shelf are
 * only wanted here, and both change under the editor as Thaans come back,
 * so they are fetched when the tab opens and again after anything is done.
 */

/** A row of `GET /api/v1/records/pipeline` — enough to pick a record to move Thaans to. */
interface PipelineMatch {
  id: string;
  code: string;
  name: string;
  colour: string | null;
  motif: string | null;
  thaanCount: number;
  stage: string | null;
}

/** The prices behind "More prices", in the order the Prices tab shows them. Retail stands on its own. */
const MORE_PRICES: { key: keyof RecordShelf["prices"]; label: string }[] = [
  { key: "cost", label: "Cost" },
  { key: "making", label: "Making" },
  { key: "wholesale", label: "Wholesale" },
  { key: "mrp", label: "MRP" },
];

/** Every API route answers `{ ok: true, data }` or `{ ok: false, error }`. */
async function api<T>(path: string): Promise<T> {
  const response = await fetch(path);
  const json = (await response.json().catch(() => null)) as
    | { ok: true; data: T }
    | { ok: false; error?: string }
    | null;
  if (json === null) throw new Error("Could not load.");
  if (!json.ok) throw new Error(json.error ?? "Could not load.");
  return json.data;
}

/** Where a Thaan is right now, in the same words the Thaans screen uses. */
function whereNow(t: PipelineThaan): string {
  if (t.voidedAt !== null) return "Voided";
  return t.openStage ?? (t.pieceCode !== null ? "On shelf" : "Ready for next stage");
}

function Tile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-rule bg-surface-2 px-3 py-2">
      <div className="text-[11px] font-medium text-muted">{label}</div>
      <div className="text-[18px] font-semibold tabular-nums text-ink">{value}</div>
    </div>
  );
}

function Section({
  title,
  aside,
  children,
}: {
  title: React.ReactNode;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-rule bg-surface">
      <div className="flex flex-wrap items-center gap-3 border-b border-rule bg-surface-2 px-4 py-2.5">
        <h3 className="text-[13px] font-medium text-ink">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

const TH = "px-3 py-2 text-[11.5px] font-medium text-muted";

export function ProductionTab({
  colourwayId,
  recordCode,
  pipeline,
  onChanged,
}: {
  colourwayId: string;
  /** The design code — what Stock Records is searched by to show this record's Thaans. */
  recordCode: string;
  /** The record's own summary — the needs chips read from it, so they refresh with the record. */
  pipeline: PipelineSummary;
  /** Something was done that changed the record: the row re-fetches it and shows the message. Never closes the editor. */
  onChanged: (message: string) => void;
}) {
  const [thaans, setThaans] = useState<PipelineThaan[] | null>(null);
  const [shelf, setShelf] = useState<RecordShelf | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [notice, setNotice] = useState<{ ok: boolean; message: string } | null>(null);

  // The shelf form: rupees as typed, and where the stock goes. Filled from
  // the shelf the first time it loads; a reload after shelving keeps what
  // was typed, which is what was just saved anyway.
  const [prices, setPrices] = useState<RecordShelf["prices"] | null>(null);
  const [locationId, setLocationId] = useState("");
  const [morePrices, setMorePrices] = useState(false);

  // The tick column and the move target.
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [targetQuery, setTargetQuery] = useState("");
  /** The last search answered, with the query it answered — shown only while the box still says that. */
  const [search, setSearch] = useState<{ q: string; rows: PipelineMatch[]; error: string | null } | null>(null);
  const [target, setTarget] = useState<PipelineMatch | null>(null);

  const fetchAll = useCallback(
    () =>
      Promise.all([
        api<PipelineThaan[]>(`/api/v1/records/${colourwayId}/thaans`),
        api<RecordShelf>(`/api/v1/records/${colourwayId}/shelf`),
      ]),
    [colourwayId],
  );

  const apply = useCallback(([t, s]: [PipelineThaan[], RecordShelf]) => {
    setThaans(t);
    setShelf(s);
    setLoadError(null);
    setPrices((prev) => prev ?? s.prices);
    setLocationId((prev) => (prev !== "" ? prev : (s.locations[0]?.id ?? "")));
  }, []);

  const reload = useCallback(async () => {
    try {
      apply(await fetchAll());
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Could not load.");
    }
  }, [apply, fetchAll]);

  useEffect(() => {
    let live = true;
    fetchAll()
      .then((data) => {
        if (live) apply(data);
      })
      .catch((error: unknown) => {
        if (live) setLoadError(error instanceof Error ? error.message : "Could not load.");
      });
    return () => {
      live = false;
    };
  }, [apply, fetchAll]);

  // The move target: typing waits a beat, then asks for records in the
  // pipeline that match a code, a name, a colour, a motif or a Thaan code.
  useEffect(() => {
    const q = targetQuery.trim();
    if (q === "") return;
    let live = true;
    const timer = setTimeout(() => {
      api<PipelineMatch[]>(`/api/v1/records/pipeline?q=${encodeURIComponent(q)}`)
        .then((rows) => {
          if (live) setSearch({ q, rows: rows.filter((r) => r.id !== colourwayId), error: null });
        })
        .catch((error: unknown) => {
          if (live) setSearch({ q, rows: [], error: error instanceof Error ? error.message : "Could not search." });
        });
    }, 250);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [targetQuery, colourwayId]);

  const q = targetQuery.trim();
  const shown = target === null && q !== "" && search !== null && search.q === q ? search : null;

  const live = (thaans ?? []).filter((t) => t.voidedAt === null);
  const allTicked = live.length > 0 && live.every((t) => ticked.has(t.id));

  function toggle(id: string) {
    setTicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /**
   * Move the ticked Thaans. The action answers with counts; the refusals
   * carry a reason each, and those are the part worth reading — "T00002053:
   * not back from Print yet" says what to do, "1 refused" doesn't.
   */
  function move() {
    if (target === null) return;
    const ids = [...ticked];
    start(async () => {
      const result = await moveThaansToRecord(target.id, ids);
      const refused = result.outcome?.refused ?? [];
      const message =
        refused.length === 0
          ? result.message
          : `${result.message} Refused: ${refused.map((r) => `${r.code} (${r.why})`).join(", ")}.`;
      setNotice({ ok: result.ok, message });
      // Even a partly refused move changed something — refresh whenever any Thaan actually went.
      if ((result.outcome?.added ?? 0) + (result.outcome?.moved ?? 0) > 0) {
        setTicked(new Set());
        setTarget(null);
        setTargetQuery("");
        await reload();
        onChanged(message);
      }
    });
  }

  function shelve() {
    if (shelf === null || prices === null) return;
    start(async () => {
      const result = await shelveRecord(colourwayId, { prices, locationId });
      setNotice({
        ok: result.ok,
        message:
          result.productCode === undefined ? result.message : `${result.message} Product code ${result.productCode}.`,
      });
      if (result.ok) {
        await reload();
        onChanged(result.message);
      }
    });
  }

  const finishedCount = shelf?.finished.length ?? pipeline.finishedCount;
  const shelvedCount = shelf?.shelved.length ?? pipeline.shelvedCount;
  const inPipeline = shelf?.inPipeline ?? Math.max(0, pipeline.thaanCount - finishedCount - shelvedCount);
  const blockers = shelf?.blockers ?? [];
  const canShelve =
    shelf !== null &&
    prices !== null &&
    blockers.length === 0 &&
    finishedCount > 0 &&
    prices.retail.trim() !== "" &&
    locationId !== "";

  return (
    <div className="flex flex-col gap-5">
      {pipeline.needs.length > 0 && (
        <div className="rounded-md border border-warn bg-warn-soft px-4 py-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {pipeline.needs.map((n) => (
              <span key={n} className="rounded-full border border-warn px-2 py-0.5 text-[11px] font-medium text-warn">
                Needs {n}
              </span>
            ))}
          </div>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-warn">
            Fill these in on the Basic and Craft &amp; Design tabs — the record can&apos;t go on the shelf until
            they&apos;re set.
          </p>
        </div>
      )}

      {notice !== null && (
        <p
          role="status"
          className={`rounded-md border px-4 py-2.5 text-[13px] leading-relaxed ${
            notice.ok ? "border-ok bg-ok-soft text-ok" : "border-brick bg-brick-soft text-brick"
          }`}
        >
          {notice.message}
        </p>
      )}

      {loadError !== null && (
        <p className="rounded-md border border-brick bg-brick-soft px-4 py-2.5 text-[13px] text-brick">
          {loadError}{" "}
          <button type="button" className="underline" onClick={() => void reload()}>
            Try again
          </button>
        </p>
      )}

      {/* From record to shelf: what's finished, what it'll sell for, and where it goes. */}
      <Section
        title="Shelf"
        aside={
          shelf !== null && finishedCount > 0 ? (
            <span className="text-[12px] text-muted">
              Going on next:{" "}
              <span className="font-mono text-[12px] text-ink">{shelf.finished.map((t) => t.code).join(", ")}</span>
            </span>
          ) : undefined
        }
      >
        <div className="flex flex-col gap-4 p-4">
          <div className="grid grid-cols-3 gap-3">
            <Tile label="Back from Ironing" value={finishedCount} />
            <Tile label="On shelf" value={shelvedCount} />
            <Tile label="In pipeline" value={inPipeline} />
          </div>

          {/* The chain, in one line: which bales the Thaans were cut from and the product code they carry. */}
          {shelf !== null && (shelf.bales.length > 0 || shelf.productCode !== null) && (
            <p className="text-[12.5px] leading-relaxed text-muted">
              {shelf.bales.length > 0 && (
                <>
                  From {shelf.bales.length === 1 ? "bale" : "bales"}{" "}
                  {shelf.bales.map((b, i) => (
                    <span key={b.id}>
                      {i > 0 && ", "}
                      <Link href={`/bales#bale-${b.code}`} className="font-mono text-ink underline">
                        {b.code}
                      </Link>{" "}
                      ({b.count})
                    </span>
                  ))}
                  .{" "}
                </>
              )}
              {shelf.productCode !== null && (
                <>
                  Product code <span className="font-mono text-ink">{shelf.productCode}</span> — opened at Print, lands on the shelf with these
                  Thaans.
                </>
              )}
            </p>
          )}

          {shelf === null || prices === null ? (
            loadError === null && <p className="text-[13px] text-muted">Loading…</p>
          ) : (
            <>
              <div className="grid gap-3.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
                <Field label="Retail *" hint="What it sells for — the one price the shelf needs.">
                  <input
                    className={`${inputClass} text-[15px] font-semibold`}
                    inputMode="decimal"
                    value={prices.retail}
                    disabled={pending}
                    onChange={(e) => setPrices((prev) => (prev === null ? prev : { ...prev, retail: e.target.value }))}
                    placeholder="₹"
                  />
                </Field>
                <Field label="Location" hint="Where the pieces are going.">
                  <select
                    className={inputClass}
                    value={locationId}
                    disabled={pending}
                    onChange={(e) => setLocationId(e.target.value)}
                  >
                    {shelf.locations.length === 0 && <option value="">No locations set up</option>}
                    {shelf.locations.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name} · {l.code}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              <div>
                <button
                  type="button"
                  className="text-[12.5px] text-brick underline"
                  aria-expanded={morePrices}
                  onClick={() => setMorePrices((v) => !v)}
                >
                  {morePrices ? "Fewer prices" : "More prices"}
                </button>
                {morePrices && (
                  <div className="mt-3 grid gap-3.5 sm:grid-cols-2 md:grid-cols-4">
                    {MORE_PRICES.map((p) => (
                      <Field key={p.key} label={p.label}>
                        <input
                          className={inputClass}
                          inputMode="decimal"
                          value={prices[p.key]}
                          disabled={pending}
                          onChange={(e) =>
                            setPrices((prev) => (prev === null ? prev : { ...prev, [p.key]: e.target.value }))
                          }
                          placeholder="₹"
                        />
                      </Field>
                    ))}
                  </div>
                )}
              </div>

              {blockers.length > 0 && (
                <ul className="list-disc pl-5 text-[12.5px] leading-relaxed text-warn">
                  {blockers.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              )}

              <div className="flex flex-wrap items-center gap-3">
                <Button tone="primary" disabled={!canShelve || pending} onClick={shelve}>
                  Put {finishedCount} on the shelf
                </Button>
                <span className="text-[11.5px] leading-relaxed text-muted">
                  Each Thaan becomes a piece with its own code — the QR label already on it is the shelf label.
                </span>
              </div>
            </>
          )}
        </div>
      </Section>

      {/* The Thaans, with the tick column that moves a wrongly sorted one. */}
      <Section
        title={
          <>
            Thaans <span className="font-mono text-[12px] text-muted">{thaans?.length ?? pipeline.thaanCount}</span>
          </>
        }
        aside={
          <span className="ml-auto flex items-center gap-3 text-[12px] text-muted">
            {live.length > 0 && <span>{ticked.size} ticked</span>}
            {/* The same Thaans, one row each with their bale, item and shelf state. */}
            <Link href={`/thaans?q=${encodeURIComponent(recordCode)}`} className="text-accent hover:underline">
              Open in Stock Records
            </Link>
          </span>
        }
      >
        {ticked.size > 0 && (
          <div className="flex flex-col gap-2 border-b border-rule px-4 py-3">
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-56 flex-1">
                <Field
                  label="Move to record…"
                  hint="A record code, name, colour, motif or Thaan code — records still in the pipeline."
                >
                  <input
                    className={inputClass}
                    value={target === null ? targetQuery : `${target.code} · ${target.name}`}
                    disabled={pending}
                    onChange={(e) => {
                      setTarget(null);
                      setTargetQuery(e.target.value);
                    }}
                    placeholder="Search records"
                    aria-label="Move ticked Thaans to record"
                  />
                </Field>
              </div>
              <Button tone="primary" disabled={target === null || pending} onClick={move}>
                Move {ticked.size} to {target?.code ?? "…"}
              </Button>
            </div>

            {shown !== null &&
              (shown.error !== null ? (
                <p className="text-[12.5px] text-brick">{shown.error}</p>
              ) : shown.rows.length === 0 ? (
                <p className="text-[12.5px] text-muted">No record in the pipeline matches.</p>
              ) : (
                <ul className="max-h-48 divide-y divide-rule overflow-y-auto rounded-md border border-rule">
                  {shown.rows.slice(0, 12).map((m) => (
                    <li key={m.id}>
                      <button
                        type="button"
                        className="flex w-full flex-wrap items-baseline gap-x-2 px-3 py-1.5 text-left text-[12.5px] hover:bg-surface-2"
                        onClick={() => setTarget(m)}
                      >
                        <span className="font-mono text-ink">{m.code}</span>
                        <span className="text-ink-2">{m.name}</span>
                        <span className="ml-auto text-[11.5px] text-muted">
                          {[m.colour, m.motif, m.stage].filter((v) => v !== null && v !== "").join(" · ")}
                          {" · "}
                          {m.thaanCount} Thaan{m.thaanCount === 1 ? "" : "s"}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ))}
          </div>
        )}

        {thaans === null ? (
          <p className="px-4 py-6 text-center text-[13px] text-muted">
            {loadError === null ? "Loading…" : "Not loaded."}
          </p>
        ) : thaans.length === 0 ? (
          <p className="px-4 py-6 text-center text-[13px] text-muted">No Thaans in this record.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse whitespace-nowrap text-[13px]">
              <thead>
                <tr className="border-b border-rule text-left">
                  <th scope="col" className="w-10 px-4 py-2">
                    <input
                      type="checkbox"
                      aria-label="Tick every Thaan"
                      checked={allTicked}
                      disabled={live.length === 0 || pending}
                      onChange={(e) => setTicked(e.target.checked ? new Set(live.map((t) => t.id)) : new Set())}
                    />
                  </th>
                  <th scope="col" className={TH}>Code</th>
                  <th scope="col" className={TH}>Bale</th>
                  <th scope="col" className={TH}>Where it is now</th>
                  <th scope="col" className={TH}>Piece</th>
                  <th scope="col" className={TH}>Location</th>
                  <th scope="col" className={TH}>Held</th>
                </tr>
              </thead>
              <tbody>
                {thaans.map((t) => (
                  <tr
                    key={t.id}
                    className={`h-10 border-b border-rule last:border-b-0 hover:bg-surface-2 ${
                      t.voidedAt !== null ? "opacity-60" : ""
                    }`}
                  >
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
                    <td className="px-3 font-mono text-[12.5px] text-ink">{t.code ?? "—"}</td>
                    <td className="px-3 font-mono text-[12.5px] text-ink-2">{t.baleCode}</td>
                    <td className="px-3 text-ink-2" title={t.voidedAt !== null ? `Voided ${t.voidedAt}` : undefined}>
                      {whereNow(t)}
                    </td>
                    {/* The piece code is the Thaan's own — set only once it's stock. */}
                    <td className="px-3 font-mono text-[12.5px] text-ink-2">{t.pieceCode ?? "—"}</td>
                    <td className="px-3 text-ink-2">{t.locationName ?? "—"}</td>
                    <td className="px-3 text-ink-2">{t.isHeld === true ? "Held" : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}

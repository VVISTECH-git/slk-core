"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import type { ChannelSellableRow } from "@/lib/channels";
import { publishBatchToChannel } from "@/app/records/publish-actions";
import type { ActionResult } from "@/app/records/actions";
import { Header } from "@/components/ui";

/**
 * Every channel, every consignment it could sell, and whether each one is
 * listed there yet.
 *
 * This began as a read-only proof of the sellable numbers (step 4 of the
 * 3 Sep design) and still is that — the counts are `channel_batch_sellable`
 * verbatim. It now also holds the publish buttons, because the only other
 * place they existed was behind a toggle on a consignment row inside one
 * record's editor, and "which of my sarees are actually on the store?" is a
 * question about all of them at once.
 *
 * Republish-all runs here in the browser, one consignment at a time, rather
 * than in a single server action: each publish is a round trip to Shopify,
 * and a serverless function that loops over a hundred of them times out
 * with nothing to show for it. Done this way, the owner watches the count
 * climb and a failure names the consignment that failed.
 */
export function Channels({ rows }: { rows: ChannelSellableRow[] }) {
  const channels = [...new Map(rows.map((r) => [r.channelId, r])).values()];

  return (
    <div className="flex min-h-screen flex-col">
      <Header
        title="Channels"
        lede={
          channels.length === 0
            ? "No channel exists yet — pnpm db:channel creates the first one."
            : "What each channel could sell right now, and which consignments are listed on it. Publish sends a listing to Shopify; Republish refreshes one that is already there."
        }
      />

      <div className="flex-1 px-8 py-6">
        <div className="mx-auto flex max-w-5xl flex-col gap-7">
          {channels.length === 0 ? (
            <p className="rounded-lg border border-dashed border-rule-2 px-4 py-6 text-center text-[13px] text-muted">
              Nothing to show until a channel row exists.
            </p>
          ) : (
            channels.map((c) => (
              <ChannelSection
                key={c.channelId}
                name={c.channelName}
                code={c.channelCode}
                rows={rows.filter((r) => r.channelId === c.channelId)}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

type RowOutcome = { batchId: string; outcome: ActionResult };

function ChannelSection({
  name,
  code,
  rows,
}: {
  name: string;
  code: string;
  rows: ChannelSellableRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [outcomes, setOutcomes] = useState<Record<string, ActionResult>>({});
  const [bulk, setBulk] = useState<{ done: number; total: number; failed: number } | null>(null);

  const pooled = rows.filter((r) => !r.isSerialised);
  const listable = rows.filter((r) => r.isSerialised);
  const listed = listable.filter((r) => r.shopifyProductId !== null);

  const publishOne = (batchId: string) => {
    setBusy(batchId);
    startTransition(async () => {
      const outcome = await publishBatchToChannel(batchId, code);
      setOutcomes((prev) => ({ ...prev, [batchId]: outcome }));
      setBusy(null);
      if (outcome.ok) router.refresh();
    });
  };

  const republishAll = () => {
    if (listed.length === 0) return;
    setBulk({ done: 0, total: listed.length, failed: 0 });
    startTransition(async () => {
      const results: RowOutcome[] = [];
      for (const r of listed) {
        setBusy(r.batchId);
        const outcome = await publishBatchToChannel(r.batchId, code);
        results.push({ batchId: r.batchId, outcome });
        setOutcomes((prev) => ({ ...prev, [r.batchId]: outcome }));
        setBulk({
          done: results.length,
          total: listed.length,
          failed: results.filter((x) => !x.outcome.ok).length,
        });
      }
      setBusy(null);
      router.refresh();
    });
  };

  return (
    <section>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <h2 className="text-[14px] font-semibold text-ink">
            {name}
            <span className="ml-2 font-mono text-[12px] font-normal text-muted">{code}</span>
          </h2>
          <p className="mt-0.5 max-w-2xl text-[12px] leading-relaxed text-muted">
            {listed.length} of {listable.length} consignment{listable.length === 1 ? "" : "s"} listed.
            {pooled.length > 0 &&
              ` ${pooled.length} more ${pooled.length === 1 ? "is" : "are"} pooled, not serialised — no per-batch number exists for those yet.`}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          {bulk !== null && (
            <span className={`text-[12.5px] ${bulk.failed > 0 ? "text-brick" : "text-muted"}`}>
              {bulk.done < bulk.total
                ? `Republishing ${bulk.done + 1} of ${bulk.total}…`
                : bulk.failed === 0
                  ? `Republished all ${bulk.total}.`
                  : `${bulk.total - bulk.failed} republished, ${bulk.failed} failed — see the rows.`}
            </span>
          )}
          <button
            type="button"
            onClick={republishAll}
            disabled={pending || listed.length === 0}
            title="Send the current title, description, tags, price and photos to every listing already on this channel. Use it after a change that touches all of them — a new tag, a renamed value."
            className="rounded-md border border-rule-2 px-3 py-1.5 text-[12.5px] font-medium text-ink-2 hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Republish all listed ({listed.length})
          </button>
        </div>
      </div>

      {listable.length === 0 ? (
        <p className="mt-3 rounded-lg border border-dashed border-rule-2 px-4 py-6 text-center text-[13px] text-muted">
          Nothing serialised and active for this channel to sell.
        </p>
      ) : (
        <div className="mt-3 overflow-hidden rounded-lg border border-rule-2">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-rule-2 bg-surface-2 text-left text-[11px] font-medium text-muted uppercase">
                <th className="px-3 py-2">Consignment</th>
                <th className="px-3 py-2">Design</th>
                <th className="px-3 py-2">Colour</th>
                <th className="px-3 py-2 text-right">Sellable</th>
                <th className="px-3 py-2 text-right">Price</th>
                <th className="px-3 py-2 text-right">Photos</th>
                <th className="px-3 py-2">Listed</th>
                <th className="px-3 py-2 text-right"></th>
              </tr>
            </thead>
            <tbody>
              {listable.map((r) => {
                const live = r.shopifyProductId !== null;
                const outcome = outcomes[r.batchId];
                const isBusy = busy === r.batchId;
                // What would go up looking wrong, said before the button is pressed.
                const caveat =
                  r.retailMinor === null
                    ? "no retail price — Shopify will refuse it"
                    : r.photos === 0
                      ? "no photographs"
                      : null;
                return (
                  <tr key={r.batchId} className="border-b border-rule align-top last:border-b-0">
                    <td className="px-3 py-2 font-mono text-ink-2">{r.productCode}</td>
                    <td className="px-3 py-2 text-ink">{r.designName}</td>
                    <td className="px-3 py-2 text-ink-2">{r.colour ?? "—"}</td>
                    <td className="px-3 py-2 text-right font-medium tabular-nums text-ink">{r.sellable ?? "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-ink-2">
                      {r.retailMinor === null ? <span className="text-brick">none</span> : `₹${(r.retailMinor / 100).toLocaleString("en-IN")}`}
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums ${r.photos === 0 ? "text-brick" : "text-ink-2"}`}>{r.photos}</td>
                    <td className="px-3 py-2">
                      {live ? (
                        <span className="text-ok">
                          Listed
                          {r.listedAt !== null && (
                            <span className="ml-1 text-[11.5px] text-muted">
                              {new Date(r.listedAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-muted">Not published</span>
                      )}
                      {outcome !== undefined && (
                        <p className={`mt-0.5 text-[11.5px] ${outcome.ok ? "text-ok" : "text-brick"}`}>{outcome.message}</p>
                      )}
                      {outcome === undefined && caveat !== null && (
                        <p className="mt-0.5 text-[11.5px] text-brick">{caveat}</p>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => publishOne(r.batchId)}
                        disabled={pending}
                        className="rounded-md border border-rule-2 px-3 py-1.5 text-[12.5px] font-medium text-ink-2 hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isBusy ? "Publishing…" : live ? "Republish" : "Publish"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

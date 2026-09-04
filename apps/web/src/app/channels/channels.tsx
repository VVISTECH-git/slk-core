"use client";

import type { ChannelSellableRow } from "@/lib/channels";
import { Header } from "@/components/ui";

/**
 * What `channel_batch_sellable` says right now — read only, and no Shopify
 * call anywhere near it.
 *
 * Step 4 of the 3 Sep design: prove the numbers in the ops app before the
 * bridge ever sends one to Shopify. Nothing here writes anything; it exists
 * so a sellable count can be checked against what somebody on the floor knows
 * to be true before that count is trusted with a live storefront.
 */
export function Channels({ rows }: { rows: ChannelSellableRow[] }) {
  const channels = [...new Map(rows.map((r) => [r.channelId, r])).values()];

  return (
    <div className="flex min-h-screen flex-col">
      <Header
        title="Channels"
        lede={
          channels.length === 0
            ? "No channel exists yet — pnpm db:channel creates the first one. Nothing here reaches Shopify."
            : `What each channel could sell right now, straight from channel_batch_sellable. Nothing here reaches Shopify.`
        }
      />

      <div className="flex-1 px-8 py-6">
        <div className="mx-auto flex max-w-4xl flex-col gap-7">
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

function ChannelSection({
  name,
  code,
  rows,
}: {
  name: string;
  code: string;
  rows: ChannelSellableRow[];
}) {
  const pooled = rows.filter((r) => !r.isSerialised);
  const listable = rows.filter((r) => r.isSerialised);

  return (
    <section>
      <h2 className="text-[14px] font-semibold text-ink">
        {name}
        <span className="ml-2 font-mono text-[12px] font-normal text-muted">
          {code}
        </span>
      </h2>
      <p className="mt-0.5 mb-2.5 max-w-2xl text-[12px] leading-relaxed text-muted">
        {listable.length} consignment{listable.length === 1 ? "" : "s"} can be
        given an honest sellable count.
        {pooled.length > 0 &&
          ` ${pooled.length} more ${pooled.length === 1 ? "is" : "are"} pooled, not serialised — no per-batch number exists for those yet.`}
      </p>

      {listable.length === 0 ? (
        <p className="rounded-lg border border-dashed border-rule-2 px-4 py-6 text-center text-[13px] text-muted">
          Nothing serialised and active for this channel to sell.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-rule-2">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-rule-2 bg-surface-2 text-left text-[11px] font-medium text-muted uppercase">
                <th className="px-3 py-2">Consignment</th>
                <th className="px-3 py-2">Design</th>
                <th className="px-3 py-2">Colour</th>
                <th className="px-3 py-2 text-right">On hand</th>
                <th className="px-3 py-2 text-right">Reserved</th>
                <th className="px-3 py-2 text-right">Sellable</th>
              </tr>
            </thead>
            <tbody>
              {listable.map((r) => (
                <tr key={r.batchId} className="border-b border-rule last:border-b-0">
                  <td className="px-3 py-2 font-mono text-ink-2">{r.productCode}</td>
                  <td className="px-3 py-2 text-ink">{r.designName}</td>
                  <td className="px-3 py-2 text-ink-2">{r.colour ?? "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-ink-2">
                    {r.onHand}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-ink-2">
                    {r.reserved}
                  </td>
                  <td className="px-3 py-2 text-right font-medium tabular-nums text-ink">
                    {r.sellable}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

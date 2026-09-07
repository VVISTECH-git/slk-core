import { requirePage } from "@/lib/session";
import { loadChannels, loadChannelSellable } from "@/lib/channels";

import { Channels } from "./channels";

export const dynamic = "force-dynamic";

export default async function ChannelsPage() {
  // Owner, same as Staff: which storefronts exist and what the bridge would
  // tell them is set-up, not a floor question.
  await requirePage("owner");

  const [channels, rows] = await Promise.all([
    loadChannels(),
    loadChannelSellable(),
  ]);

  return <Channels channels={channels} rows={rows} />;
}

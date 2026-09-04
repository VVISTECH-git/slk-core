import { requirePage } from "@/lib/session";
import { loadChannelSellable } from "@/lib/channels";

import { Channels } from "./channels";

export const dynamic = "force-dynamic";

export default async function ChannelsPage() {
  // Owner, same as Staff: which storefronts exist and what the bridge would
  // tell them is set-up, not a floor question.
  await requirePage("owner");

  return <Channels rows={await loadChannelSellable()} />;
}

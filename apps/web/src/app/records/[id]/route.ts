import { NextResponse } from "next/server";

import { loadRecord } from "@/lib/editor";

/**
 * One record, fetched when the editor opens.
 *
 * Not shipped with the table: each record carries a stock summary, a location
 * breakdown and its recent movements, and doing that for every row would put
 * the whole ledger in the page for the sake of the one row someone clicks.
 */
export async function GET(
  _request: Request,
  context: RouteContext<"/records/[id]">,
) {
  const { id } = await context.params;

  // The route also catches non-uuid paths, which would otherwise reach
  // Postgres and come back as a type error rather than a 404.
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "Not a record id" }, { status: 400 });
  }

  const record = await loadRecord(id);

  if (record === null) {
    return NextResponse.json({ error: "No such record" }, { status: 404 });
  }

  return NextResponse.json(record);
}

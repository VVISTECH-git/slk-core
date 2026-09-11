import { sql } from "drizzle-orm";

import { shopifyClient } from "@slk/sync/shopify-client";

import { db } from "@/lib/db";

/**
 * TEMPORARY. Deletes test products from Shopify, a few per request.
 *
 * The catalogue on production was built entirely for testing and is being
 * emptied. Every consignment in it was pushed to both stores, and nothing
 * outside this deployment holds Shopify's client secret, so the take-down
 * has to run from here — the same reason `publish-one` exists.
 *
 * Each call deletes up to `?limit=` products, newest link first, and removes
 * the `channel_link` row once Shopify confirms (or says the product is
 * already gone). A failure is recorded on the row and skipped on later calls
 * unless `?retry=1`. Drive it in a loop until it reports zero remaining.
 *
 * Gated by WIPE_TASK_SECRET, set for this job only. Remove this file and
 * the variable once the catalogue is empty.
 */
export const maxDuration = 60;

const PRODUCT_DELETE = `
  mutation Delete($input: ProductDeleteInput!) {
    productDelete(input: $input) {
      deletedProductId
      userErrors { field message }
    }
  }
`;

export async function GET(request: Request): Promise<Response> {
  // Trimmed: a value piped into `vercel env add` arrives with the shell's
  // trailing newline attached, and a Bearer token never has one.
  const secret = (process.env["WIPE_TASK_SECRET"] ?? "").trim();
  if (secret === "") {
    return new Response("Not configured.", { status: 503 });
  }

  const auth = (request.headers.get("authorization") ?? "").trim();
  if (auth !== `Bearer ${secret}`) {
    return new Response("Unauthorized.", { status: 401 });
  }

  const url = new URL(request.url);
  const limit = Math.max(1, Math.min(50, Number(url.searchParams.get("limit") ?? "20")));
  const retry = url.searchParams.get("retry") === "1";

  const rows = await db.execute<{ id: string; channelCode: string; productId: string }>(sql`
    select cl.id, ch.code as "channelCode", cl.shopify_product_id as "productId"
    from channel_link cl
    join channel ch on ch.id = cl.channel_id
    where cl.shopify_product_id is not null
      and (${retry} or cl.last_push_error is null)
    order by cl.created_at desc
    limit ${limit}
  `);

  let deleted = 0;
  const failures: string[] = [];

  for (const row of rows) {
    try {
      const client = await shopifyClient(row.channelCode);
      const result = await client.graphql<{
        productDelete: {
          deletedProductId: string | null;
          userErrors: { field: string[]; message: string }[];
        };
      }>(PRODUCT_DELETE, { input: { id: row.productId } });

      const errors = result.productDelete.userErrors;
      const gone =
        result.productDelete.deletedProductId !== null ||
        errors.some((e) => /does not exist|not found|could not find/i.test(e.message));

      if (!gone) {
        throw new Error(errors.map((e) => e.message).join("; ") || "no deletedProductId");
      }

      await db.execute(sql`delete from channel_link where id = ${row.id}`);
      deleted++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`${row.channelCode} ${row.productId}: ${message}`);
      await db.execute(sql`
        update channel_link set last_push_error = ${message}, last_pushed_at = now()
        where id = ${row.id}
      `);
    }
  }

  const [left] = await db.execute<{ remaining: number; errored: number }>(sql`
    select
      count(*) filter (where last_push_error is null)::int     as remaining,
      count(*) filter (where last_push_error is not null)::int as errored
    from channel_link where shopify_product_id is not null
  `);

  return Response.json({
    ok: failures.length === 0,
    deleted,
    failures,
    remaining: left?.remaining ?? 0,
    errored: left?.errored ?? 0,
  });
}

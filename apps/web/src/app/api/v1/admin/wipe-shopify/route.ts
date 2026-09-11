import { sql } from "drizzle-orm";

import { shopifyClient } from "@slk/sync/shopify-client";

import { db } from "@/lib/db";

/**
 * TEMPORARY. Deletes test products from Shopify, a few per request.
 *
 * Nothing outside this deployment holds Shopify's client secret, so a
 * take-down has to run from here — the same reason `publish-one` exists.
 * See the commit that first added this file for the fuller account; this is
 * the same script, brought back for a second, smaller batch of test data.
 *
 * Each call deletes up to `?limit=` products, newest link first, and removes
 * the `channel_link` row once Shopify confirms (or says the product is
 * already gone). Gated by WIPE_TASK_SECRET, set for this job only. Remove
 * this file and the variable once the catalogue is empty.
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

/**
 * One store's worth of API access — the token exchange and the GraphQL call
 * that everything else in this worker builds on.
 *
 * This store has no legacy custom-app flow, so there is no static Admin API
 * token to hand a script the way older stores provide. What works instead is
 * the Client ID + Secret pair exchanged via OAuth's client_credentials grant
 * — no browser, no callback URL, right for an app with exactly one
 * installer. Confirmed against the live Aartisanz store; the "App
 * automation token" that looked like the obvious candidate is scoped to CLI
 * deploys instead and returns a 401 for everything else.
 */

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") {
    throw new Error(`${name} is not set.`);
  }
  return value;
}

export interface ShopifyClient {
  domain: string;
  graphql<T>(query: string, variables?: Record<string, unknown>): Promise<T>;
}

const clients = new Map<string, Promise<ShopifyClient>>();

/**
 * One client per channel code, cached — a token exchange is a real request
 * to Shopify and a worker touching several channels' consignments in one
 * pass has no reason to repeat it for every batch on the same channel.
 */
export function shopifyClient(channelCode: string): Promise<ShopifyClient> {
  const cached = clients.get(channelCode);
  if (cached !== undefined) return cached;

  const built = buildClient(channelCode);
  clients.set(channelCode, built);
  return built;
}

async function buildClient(channelCode: string): Promise<ShopifyClient> {
  const PREFIX = channelCode.toUpperCase();
  // Tolerate the value someone copies from a browser address bar — protocol
  // and trailing slash are the obvious mistake, not a different store.
  const domain = required(`SHOPIFY_${PREFIX}_STORE_DOMAIN`)
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "");
  const apiVersion = process.env["SHOPIFY_API_VERSION"] ?? "2026-07";

  const clientId = required(`SHOPIFY_${PREFIX}_CLIENT_ID`);
  const clientSecret = required(`SHOPIFY_${PREFIX}_CLIENT_SECRET`);

  const tokenRes = await fetch(`https://${domain}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "client_credentials",
    }),
  });

  const tokenBody = (await tokenRes.json()) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };

  if (!tokenRes.ok || tokenBody.access_token === undefined) {
    throw new Error(
      `Token exchange ${tokenRes.status}: ${tokenBody.error ?? ""} ${tokenBody.error_description ?? JSON.stringify(tokenBody)}`,
    );
  }

  const token = tokenBody.access_token;

  async function graphql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    const res = await fetch(`https://${domain}/admin/api/${apiVersion}/graphql.json`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-shopify-access-token": token,
      },
      body: JSON.stringify({ query, variables }),
    });

    const body = (await res.json()) as { data?: T; errors?: unknown };

    if (!res.ok || body.errors) {
      throw new Error(`Shopify ${res.status}: ${JSON.stringify(body.errors ?? body)}`);
    }

    return body.data as T;
  }

  return { domain, graphql };
}

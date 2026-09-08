import type { ShopifyClient } from "./shopify-client";

export interface ArchiveResult {
  ok: boolean;
  error?: string;
}

/**
 * Takes a consignment off sale on Shopify — the call `deleteRecord` and
 * `archiveRecord` never made.
 *
 * A saree deleted or archived in slk-core used to stay exactly as it was on
 * the real storefront: `channel_link` is what remembers which Shopify
 * product a consignment became, and `deleteRecord` cascades that row away
 * with the batch it belonged to. The listing did not just stay live — the
 * one record of which listing it was disappeared in the same transaction,
 * so there was nothing left to find it by afterwards.
 *
 * Two calls, the reverse of `sendProductSet`'s publish step: unpublish from
 * the Online Store channel, then set the product's own status to Archived.
 * Both, not either — an archived-but-still-published product can still be a
 * live storefront URL depending on the theme, and an unpublished-but-Active
 * product is one edit away from being republished by mistake. Scoped to the
 * Online Store channel only, matching `sendProductSet` — Point of Sale is a
 * decision this codebase has still not been asked to make.
 */
export async function archiveListing(
  client: ShopifyClient,
  shopifyProductId: string,
): Promise<ArchiveResult> {
  try {
    const { publications } = await client.graphql<{
      publications: { nodes: { id: string; name: string }[] };
    }>(`query { publications(first: 10) { nodes { id name } } }`);

    const onlineStore = publications.nodes.find((p) => p.name === "Online Store");

    if (onlineStore !== undefined) {
      const UNPUBLISH = `
        mutation Unpublish($id: ID!, $input: [PublicationInput!]!) {
          publishableUnpublish(id: $id, input: $input) {
            userErrors { field message }
          }
        }
      `;

      const unpublished = await client.graphql<{
        publishableUnpublish: { userErrors: { field: string[]; message: string }[] };
      }>(UNPUBLISH, { id: shopifyProductId, input: [{ publicationId: onlineStore.id }] });

      if (unpublished.publishableUnpublish.userErrors.length > 0) {
        throw new Error(
          unpublished.publishableUnpublish.userErrors
            .map((e) => `${e.field.join(".")}: ${e.message}`)
            .join("; "),
        );
      }
    }

    const ARCHIVE = `
      mutation Archive($input: ProductUpdateInput!) {
        productUpdate(input: $input) {
          userErrors { field message }
        }
      }
    `;

    const archived = await client.graphql<{
      productUpdate: { userErrors: { field: string[]; message: string }[] };
    }>(ARCHIVE, { input: { id: shopifyProductId, status: "ARCHIVED" } });

    if (archived.productUpdate.userErrors.length > 0) {
      throw new Error(
        archived.productUpdate.userErrors
          .map((e) => `${e.field.join(".")}: ${e.message}`)
          .join("; "),
      );
    }

    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    // Already gone from Shopify's side — someone deleted it directly in the
    // admin, or a previous archive attempt actually succeeded and only the
    // confirmation was lost. Either way the end state this call exists to
    // reach is already true, so it is not a failure to report.
    if (/does not exist|not found|could not find|no longer exists|invalid id/i.test(message)) {
      return { ok: true };
    }

    return { ok: false, error: message };
  }
}

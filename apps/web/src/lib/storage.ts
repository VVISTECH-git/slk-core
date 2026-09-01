import { AwsClient } from "aws4fetch";

/**
 * Cloudflare R2, for the product photographs.
 *
 * R2 rather than Vercel Blob because the cost that grows here is egress, not
 * storage. A catalogue's images are a few gigabytes and are served on every
 * page view of every storefront for ever; R2 charges nothing to serve them
 * out, and that is the half of the bill that compounds with success.
 *
 * S3-compatible, so this is a signed S3 client pointed at R2's endpoint.
 * `aws4fetch` rather than the AWS SDK: it is a few kilobytes against several
 * megabytes, and cold starts are something this app has already had to care
 * about.
 */

const ACCOUNT = process.env["R2_ACCOUNT_ID"] ?? "";
const BUCKET = process.env["R2_BUCKET"] ?? "";
const KEY_ID = process.env["R2_ACCESS_KEY_ID"] ?? "";
const SECRET = process.env["R2_SECRET_ACCESS_KEY"] ?? "";

/**
 * Where the images are read from — an r2.dev subdomain or a custom domain
 * with public access enabled.
 *
 * Kept separate from the write credentials on purpose. Reading is public and
 * unauthenticated; writing needs a key nobody outside the server should ever
 * hold.
 */
const PUBLIC_BASE = (process.env["R2_PUBLIC_BASE_URL"] ?? "").replace(/\/$/, "");

/** Everything set, so uploading can actually work. */
export function storageConfigured(): boolean {
  return (
    ACCOUNT !== "" &&
    BUCKET !== "" &&
    KEY_ID !== "" &&
    SECRET !== "" &&
    PUBLIC_BASE !== ""
  );
}

/** What is missing, so the message can say rather than shrug. */
export function storageMissing(): string[] {
  return (
    [
      ["R2_ACCOUNT_ID", ACCOUNT],
      ["R2_BUCKET", BUCKET],
      ["R2_ACCESS_KEY_ID", KEY_ID],
      ["R2_SECRET_ACCESS_KEY", SECRET],
      ["R2_PUBLIC_BASE_URL", PUBLIC_BASE],
    ] as const
  )
    .filter(([, value]) => value === "")
    .map(([name]) => name);
}

/** The address a stored key is served from. */
export function publicUrl(key: string): string {
  return `${PUBLIC_BASE}/${key}`;
}

const client = new AwsClient({
  accessKeyId: KEY_ID,
  secretAccessKey: SECRET,
  service: "s3",
  region: "auto",
});

/**
 * A URL the browser can PUT a file to directly, valid for a few minutes.
 *
 * The file never passes through the server. Sending it through a Server
 * Action would mean raising Next's body limit past its 1MB default and paying
 * for every megabyte twice — once inbound to the function, once outbound to
 * R2 — for no benefit, since the server has nothing to say about the bytes.
 *
 * The signature is what makes this safe: it is bound to one key, one method
 * and one content type, and expires. It is not a general permission to write
 * to the bucket.
 */
export async function presignPut(
  key: string,
  contentType: string,
  seconds = 300,
): Promise<string> {
  const url = new URL(
    `https://${ACCOUNT}.r2.cloudflarestorage.com/${BUCKET}/${key}`,
  );
  url.searchParams.set("X-Amz-Expires", String(seconds));

  const signed = await client.sign(
    new Request(url, { method: "PUT", headers: { "content-type": contentType } }),
    { aws: { signQuery: true } },
  );

  return signed.url;
}

/** Removes an object. Used when a photograph is replaced or taken off. */
export async function remove(key: string): Promise<void> {
  const url = `https://${ACCOUNT}.r2.cloudflarestorage.com/${BUCKET}/${key}`;
  await client.fetch(url, { method: "DELETE" });
}

/**
 * Where a photograph lives.
 *
 * Keyed by colourway and slot rather than by a random id, so the bucket is
 * browsable and an orphaned object can be traced back to what it belonged
 * to. The timestamp makes replacing a photograph write a new object rather
 * than overwrite one that a CDN may still be serving.
 */
export function imageKey(
  colourwayId: string,
  slotId: string,
  extension: string,
  stamp: number,
): string {
  return `products/${colourwayId}/${slotId}-${stamp}.${extension}`;
}

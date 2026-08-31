import { resolve } from "node:path";

import { config as loadEnv } from "dotenv";
import type { NextConfig } from "next";

// Next reads .env from the app directory, but the workspace keeps one .env at
// the slk-core root so the web app, the sync worker and the migration tooling
// cannot drift onto different databases. The config file is evaluated before
// the server starts, so loading it here reaches the whole runtime.
loadEnv({ path: resolve(import.meta.dirname, "../../.env") });

/**
 * `vercel link` and `vercel env pull` write apps/web/.env.local, and Next
 * reads that ahead of everything else — which quietly points a development
 * server at the deployed database. It looks like missing data rather than
 * like a misconfiguration, which is the dangerous part: the first symptom is
 * an empty table, and the second is an edit landing in production.
 *
 * Delete apps/web/.env.local to develop against the local Postgres.
 */
if (process.env.NODE_ENV === "development") {
  const url = process.env["DATABASE_URL"] ?? "";

  if (url !== "" && !/localhost|127\.0\.0\.1/.test(url)) {
    const host = url.replace(/^.*@/, "").replace(/[/?].*$/, "");
    console.warn(
      `\n  ⚠  Development server is using a REMOTE database: ${host}\n` +
        `     Anything you edit here changes deployed data.\n` +
        `     Delete apps/web/.env.local to use the local Postgres.\n`,
    );
  }
}

const nextConfig: NextConfig = {
  // The @slk/* packages are consumed as TypeScript source rather than built
  // artefacts, so there is no build step between editing a domain rule and
  // seeing it here. Next has to compile them itself.
  transpilePackages: ["@slk/contracts", "@slk/db", "@slk/domain"],

  // Next's floating dev overlay never ships to users, but it sits on top of
  // the app while the people it is being shown to are trying to judge it.
  // Compile and runtime errors still surface.
  devIndicators: false,
};

export default nextConfig;

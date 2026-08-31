import { resolve } from "node:path";

import { config as loadEnv } from "dotenv";
import type { NextConfig } from "next";

// Next reads .env from the app directory, but the workspace keeps one .env at
// the slk-core root so the web app, the sync worker and the migration tooling
// cannot drift onto different databases. The config file is evaluated before
// the server starts, so loading it here reaches the whole runtime.
loadEnv({ path: resolve(import.meta.dirname, "../../.env") });

const nextConfig: NextConfig = {
  // The @slk/* packages are consumed as TypeScript source rather than built
  // artefacts, so there is no build step between editing a domain rule and
  // seeing it here. Next has to compile them itself.
  transpilePackages: ["@slk/contracts", "@slk/db", "@slk/domain"],
};

export default nextConfig;

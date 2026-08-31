import { resolve } from "node:path";

import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// One .env for the whole workspace, at the slk-core root.
//
// Resolved from the working directory rather than import.meta.dirname:
// drizzle-kit transpiles this file to CommonJS before running it, and
// import.meta is undefined there.
config({ path: resolve(process.cwd(), "../../.env") });

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./migrations",
  dbCredentials: {
    // Never the pooler: migrations need a real session.
    url: process.env["DIRECT_URL"] ?? process.env["DATABASE_URL"] ?? "",
  },
  strict: true,
  verbose: true,
});

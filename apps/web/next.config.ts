import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The @slk/* packages are consumed as TypeScript source rather than built
  // artefacts, so there is no build step between editing a domain rule and
  // seeing it here. Next has to compile them itself.
  transpilePackages: ["@slk/contracts", "@slk/db", "@slk/domain"],
};

export default nextConfig;

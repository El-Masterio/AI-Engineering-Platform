import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  // packages/ui ships TypeScript source for its stylesheets and is consumed
  // from the workspace, so Next must compile it rather than treat it as
  // prebuilt node_modules.
  transpilePackages: ["@atelier/ui"],
  typedRoutes: true,
  experimental: {
    // Import only the icons actually used rather than the whole barrel.
    optimizePackageImports: ["lucide-react"],
  },
};

export default config;

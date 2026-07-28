import { defineConfig } from "vitest/config";

/**
 * §24 stage 3. Needs Docker, a real Postgres and a real HTTP server, so it is
 * separate from the fast unit suite for the same reason packages/db's is.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.integration.test.ts"],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 180_000,
  },
});

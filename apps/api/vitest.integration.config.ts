import { defineConfig } from "vitest/config";

/**
 * §24 stage 3. Separate from the unit config because these tests need Docker,
 * a real Postgres and minutes rather than seconds — mixing them would make the
 * fast suite slow and the slow suite look flaky.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.integration.test.ts"],
    // Containers start once per file; running files in parallel would start
    // several Postgres instances at once for no benefit.
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 180_000,
  },
});

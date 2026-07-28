import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

/**
 * Component test configuration (§23 Layer 1/3).
 *
 * jsdom rather than a real browser: these tests assert behaviour, accessibility
 * and keyboard operation, none of which need a rendering engine. Visual
 * verification is Storybook's job, and visual regression lands at M094.
 */
export default defineConfig({
  plugins: [react()],
  /**
   * Resolve workspace packages to SOURCE, not to their built `dist`.
   *
   * Without this, `@atelier/ui` resolves through the package `exports` map to
   * `dist/`, so the app tests only run if someone has built the package first.
   * On a clean checkout they do not: CI collected 43 of 64 tests and reported
   * two "failed" files that had simply failed to import. Locally it passed
   * because a stale `dist/` happened to be on disk — which is exactly the class
   * of bug a clean CI checkout exists to catch.
   *
   * Pointing at source is also the better default on its own terms: unit tests
   * should exercise the code we wrote, coverage should instrument it, and no
   * test should depend on build ordering. `dialog.tsx` reported 0% coverage for
   * precisely this reason — it was covered, just not the copy being measured.
   */
  resolve: {
    alias: {
      "@atelier/ui": fileURLToPath(new URL("packages/ui/src/index.ts", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["packages/*/src/**/*.test.{ts,tsx}", "apps/*/src/**/*.test.{ts,tsx}"],
    // Integration tests need Docker and a real Postgres. They are §24 stage 3
    // and run from packages/db/vitest.integration.config.ts, not here — mixing
    // them would make the fast suite slow and the slow suite look flaky.
    exclude: ["**/node_modules/**", "**/dist/**", "**/*.integration.test.ts"],
    coverage: {
      provider: "v8",
      include: ["packages/*/src/**/*.{ts,tsx}"],
      exclude: [
        "**/*.stories.tsx",
        "**/*.test.{ts,tsx}",
        "**/index.ts",
        // Covered by the integration suite, which reports its own coverage.
        // Counting it here would measure it as 0% and fail the floor for a
        // reason that has nothing to do with how well it is tested.
        "packages/db/**",
      ],
      /**
       * §23's floors, enforced rather than reported (§24 stage 2). 80% overall
       * is the baseline; the higher per-path floors §23 sets for auth, tenant
       * isolation, the policy engine and cost metering attach to packages that
       * do not exist yet, and land with them.
       *
       * Lines AND branches, because line coverage alone is satisfied by walking
       * through a conditional without ever taking the other side of it.
       */
      thresholds: {
        lines: 80,
        statements: 80,
        branches: 80,
        functions: 80,
        // §23 sets 90% for packages/domain: pure logic, no excuse.
        "packages/domain/src/**/*.ts": {
          lines: 90,
          statements: 90,
          branches: 90,
          functions: 90,
        },
      },
    },
  },
});

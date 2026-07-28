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
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["packages/*/src/**/*.test.{ts,tsx}", "apps/*/src/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      include: ["packages/*/src/**/*.{ts,tsx}"],
      exclude: ["**/*.stories.tsx", "**/*.test.{ts,tsx}", "**/index.ts"],
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
      },
    },
  },
});

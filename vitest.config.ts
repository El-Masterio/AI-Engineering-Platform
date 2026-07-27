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
    },
  },
});

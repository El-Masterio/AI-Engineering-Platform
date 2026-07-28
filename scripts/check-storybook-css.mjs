#!/usr/bin/env node
/**
 * Storybook actually compiled Tailwind (§18 governance).
 *
 * This exists because of a real failure. From M008 until M003, every story
 * rendered with the right colours and no layout: Vite found no PostCSS config
 * at the repo root, so it never ran the Tailwind engine and merely INLINED
 * Tailwind's source stylesheets. The output looked plausible — `@layer theme`,
 * `@layer utilities`, all the custom properties — and contained not one
 * generated utility class. A build that exits 0 and a CSS file that exists were
 * both true the whole time.
 *
 * So the check is not "did Storybook build" but "does the bundle contain
 * utilities we know the gallery uses". Run it after `pnpm build:storybook`.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";

const ASSETS = path.join("storybook-static", "assets");

if (!existsSync(ASSETS)) {
  console.error(`\n  ${ASSETS} not found. Run \`pnpm build:storybook\` first.\n`);
  process.exit(1);
}

const cssFiles = readdirSync(ASSETS).filter((f) => f.endsWith(".css"));
if (cssFiles.length === 0) {
  console.error("\n  Storybook produced no CSS at all.\n");
  process.exit(1);
}

const css = cssFiles.map((f) => readFileSync(path.join(ASSETS, f), "utf8")).join("\n");

/**
 * Utilities the primitives gallery cannot render without. Layout first — those
 * are the ones whose absence makes the page look like unstyled HTML.
 */
const REQUIRED = [
  ".flex{",
  ".inline-flex{",
  ".grid{",
  ".rounded-full{",
  ".items-center{",
  ".shrink-0{",
];

const missing = REQUIRED.filter((utility) => !css.includes(utility));

console.log(`\n  ${cssFiles.length} stylesheet(s), ${css.length} bytes`);

if (missing.length > 0) {
  console.error(`\n  STORYBOOK CSS CHECK FAILED — ${missing.length} expected utilities absent:`);
  for (const m of missing) console.error(`    ✖ ${m}`);
  console.error(
    "\n  Tailwind ran but generated nothing, or did not run at all. Check that\n" +
      "  postcss.config.mjs exists at the repo root and that packages/ui's\n" +
      "  theme.css still declares its `@source`.\n",
  );
  process.exit(1);
}

console.log(`  All ${REQUIRED.length} sampled utilities are present — Tailwind compiled.\n`);

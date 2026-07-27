#!/usr/bin/env node
/**
 * WCAG 2.2 contrast verification for the design tokens.
 *
 * §18 claims both themes conform to AA. This turns that claim into a build
 * gate — NFR-A11Y-3 says contrast is a build check, not a designer's judgment.
 *
 * Parses packages/ui/src/tokens/tokens.css, resolves each semantic token
 * through its var() chain per theme, and asserts the ratio for every pair that
 * carries meaning.
 *
 * Thresholds (WCAG 2.2 AA):
 *   4.5:1  normal body text
 *   3.0:1  large text (>=18.66px bold / 24px regular) and UI component
 *          boundaries + graphical objects (1.4.11 Non-text Contrast)
 *
 * Pairs whose value uses color-mix() are skipped and reported — they cannot be
 * resolved statically. They are decorative fills (selection, diff backgrounds)
 * layered over a checked background, never the sole carrier of meaning.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const TOKENS = path.join(here, "..", "packages", "ui", "src", "tokens", "tokens.css");

/** Pairs that must meet a threshold. [foreground, background, minRatio, label] */
const PAIRS = [
  // Body text — 4.5:1
  ["--text-primary", "--bg-base", 4.5, "body text on page"],
  ["--text-primary", "--bg-surface", 4.5, "body text on card"],
  ["--text-primary", "--bg-surface-2", 4.5, "body text on raised surface"],
  ["--text-primary", "--bg-inset", 4.5, "code text on inset"],
  ["--text-secondary", "--bg-base", 4.5, "secondary text on page"],
  ["--text-secondary", "--bg-surface", 4.5, "secondary text on card"],
  ["--text-tertiary", "--bg-base", 4.5, "tertiary text on page"],
  ["--text-tertiary", "--bg-surface", 4.5, "tertiary text on card"],
  ["--text-accent", "--bg-base", 4.5, "accent text on page"],
  ["--text-accent", "--bg-surface", 4.5, "accent text on card"],
  ["--accent-fg", "--accent-bg", 4.5, "primary button label"],

  // UI boundaries and status indicators — 3.0:1 (WCAG 1.4.11)
  ["--border-default", "--bg-surface", 3, "input border on card"],
  ["--border-default", "--bg-base", 3, "input border on page"],
  ["--border-focus", "--bg-base", 3, "focus ring on page"],
  ["--border-focus", "--bg-surface", 3, "focus ring on card"],
  ["--status-ok", "--bg-surface", 3, "success indicator"],
  ["--status-warn", "--bg-surface", 3, "warning indicator"],
  ["--status-err", "--bg-surface", 3, "error indicator"],
  ["--status-info", "--bg-surface", 3, "info indicator"],
  ["--status-running", "--bg-surface", 3, "agent-running indicator"],
];

const THEMES = ["dark", "light"];

// ── Parsing ────────────────────────────────────────────────────────────────

const css = readFileSync(TOKENS, "utf8");

/** Strip comments so declarations inside them are never parsed. */
const stripped = css.replaceAll(/\/\*[\s\S]*?\*\//g, "");

/**
 * Collect `--name: value;` declarations from each block we care about.
 * Blocks are matched by their selector text.
 */
function blockFor(selectorTest) {
  const blocks = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(stripped)) !== null) {
    const selector = m[1].trim();
    if (selectorTest(selector)) blocks.push(m[2]);
  }
  return blocks.join("\n");
}

function declarations(text) {
  const out = new Map();
  const re = /(--[\w-]+)\s*:\s*([^;]+);/g;
  let m;
  while ((m = re.exec(text)) !== null) out.set(m[1], m[2].trim());
  return out;
}

// `:root` carries primitives + the dark semantic layer; `[data-theme="light"]`
// overrides. Order matters: later declarations win.
const rootDeclarations = declarations(
  blockFor((s) =>
    s.split(",").some((p) => p.trim() === ":root" || p.trim() === '[data-theme="dark"]'),
  ),
);
const lightDeclarations = declarations(blockFor((s) => s.includes('[data-theme="light"]')));

const themeMaps = {
  dark: rootDeclarations,
  light: new Map([...rootDeclarations, ...lightDeclarations]),
};

// ── Colour maths ───────────────────────────────────────────────────────────

/** Resolve a token through its var() chain to a literal value. */
function resolve(name, map, seen = new Set()) {
  if (seen.has(name)) throw new Error(`circular token reference: ${name}`);
  seen.add(name);
  const raw = map.get(name);
  if (raw === undefined) return;
  const variableMatch = /^var\(\s*(--[\w-]+)\s*\)$/.exec(raw);
  if (variableMatch) return resolve(variableMatch[1], map, seen);
  return raw;
}

function hexToRgb(hex) {
  const h = hex.trim().replace("#", "");
  const full = h.length === 3 ? [...h].map((c) => c + c).join("") : h;
  if (!/^[\da-f]{6}$/i.test(full)) return;
  return [0, 2, 4].map((index) => Number.parseInt(full.slice(index, index + 2), 16));
}

/** WCAG relative luminance. */
function luminance([r, g, b]) {
  const [rs, gs, bs] = [r, g, b].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function contrast(fg, bg) {
  const l1 = luminance(fg);
  const l2 = luminance(bg);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

// ── Run ────────────────────────────────────────────────────────────────────

/**
 * Evaluate one pair in one theme.
 *
 * @returns {{ status: "pass" | "fail" | "skip", line: string }}
 */
function checkPair([fgName, bgName, min, label], map) {
  const fgRaw = resolve(fgName, map);
  const bgRaw = resolve(bgName, map);
  const name = label.padEnd(30);

  if (fgRaw === undefined || bgRaw === undefined) {
    return { status: "fail", line: `  ✖ ${name} UNDEFINED TOKEN (${fgName} / ${bgName})` };
  }
  if (fgRaw.includes("color-mix") || bgRaw.includes("color-mix")) {
    return { status: "skip", line: `  ~ ${name} skipped (color-mix, not statically resolvable)` };
  }

  const fg = hexToRgb(fgRaw);
  const bg = hexToRgb(bgRaw);
  if (!fg || !bg) {
    return { status: "fail", line: `  ✖ ${name} UNPARSEABLE (${fgRaw} / ${bgRaw})` };
  }

  const ratio = contrast(fg, bg);
  const isOk = ratio >= min;
  return {
    status: isOk ? "pass" : "fail",
    line:
      `  ${isOk ? "✔" : "✖"} ${name} ${ratio.toFixed(2).padStart(5)}:1  (min ${min}) ` +
      `${fgName} on ${bgName}`,
  };
}

let failures = 0;
let skipped = 0;
let checked = 0;

for (const theme of THEMES) {
  const map = themeMaps[theme];
  console.log(`\n  ${theme.toUpperCase()} THEME`);
  console.log("  " + "─".repeat(74));

  for (const pair of PAIRS) {
    const { status, line } = checkPair(pair, map);
    if (status === "fail") failures++;
    else if (status === "skip") skipped++;
    else checked++;
    console.log(line);
  }
}

console.log("\n  " + "─".repeat(74));
console.log(`  ${checked} pairs checked · ${skipped} skipped · ${failures} failing\n`);

if (failures > 0) {
  console.error(`  WCAG 2.2 AA contrast check FAILED: ${failures} pair(s) below threshold.`);
  console.error("  Fix the token values in packages/ui/src/tokens/tokens.css.\n");
  process.exit(1);
}
console.log("  All token pairs meet WCAG 2.2 AA.\n");

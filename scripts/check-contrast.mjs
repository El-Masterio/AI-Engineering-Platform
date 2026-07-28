#!/usr/bin/env node
/**
 * WCAG 2.2 contrast verification for the design tokens.
 *
 * §18 v2.0 claims the palette conforms to AA. This turns that claim into a
 * build gate — NFR-A11Y-3 says contrast is a build check, not a designer's
 * judgment. It is the reason the v2.0 directive's palette shipped with derived
 * shades rather than as written: this script measured 20 of 23 load-bearing
 * pairs below threshold before any of it was implemented.
 *
 * Parses packages/ui/src/tokens/tokens.css, resolves each semantic token
 * through its var() chain, and asserts the ratio for every pair that carries
 * meaning. Every surface a token can land on is checked, not just one — the
 * sidebar (#ece8e2) is darker than the page and is where borderline values
 * fail first.
 *
 * Thresholds (WCAG 2.2 AA):
 *   4.5:1  normal body text
 *   3.0:1  large text (>=18.66px bold / 24px regular) and UI component
 *          boundaries + graphical objects (1.4.11 Non-text Contrast)
 *
 * Deliberately NOT gated: --brand (--o-500 #f06d22) and the --chart-* series.
 * The brand orange appears only in the logo mark and gradients, where nothing
 * depends on distinguishing it from its background. Chart series are gated
 * against each other by review, not against a surface.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const TOKENS = path.join(here, "..", "packages", "ui", "src", "tokens", "tokens.css");

/** Every surface text or a border can land on. */
const SURFACES = [
  "--bg-base",
  "--bg-surface",
  "--bg-surface-2",
  "--bg-elevated",
  "--bg-sidebar",
  "--bg-hover",
];

/** [foreground, background, minRatio, label] */
const PAIRS = [
  // ── Body text on every surface — 4.5:1 ──────────────────────────────────
  ...["--text-primary", "--text-secondary", "--text-tertiary"].flatMap((fg) =>
    SURFACES.map((bg) => [
      fg,
      bg,
      4.5,
      `${fg.replace("--text-", "")} on ${bg.replace("--bg-", "")}`,
    ]),
  ),
  ["--text-primary", "--bg-inset", 4.5, "text in an input"],
  ["--text-primary", "--bg-selected", 4.5, "text on selection"],
  ["--text-accent", "--bg-base", 4.5, "accent text on page"],
  ["--text-accent", "--bg-surface", 4.5, "accent text on card"],
  ["--text-link", "--bg-surface", 4.5, "link on card"],
  ["--text-link", "--bg-base", 4.5, "link on page"],
  ["--slate", "--bg-surface", 4.5, "slate text on card"],

  // ── Text on coloured fills — 4.5:1 ──────────────────────────────────────
  ["--accent-fg", "--accent-bg", 4.5, "primary button label"],
  ["--accent-fg", "--accent-bg-hover", 4.5, "primary button hover"],
  ["--accent-fg", "--accent-bg-active", 4.5, "primary button pressed"],
  ["--accent-soft-fg", "--accent-soft-bg", 4.5, "soft-orange chip"],
  ["--secondary-soft-fg", "--secondary-soft-bg", 4.5, "active nav item"],
  ["--text-inverse", "--status-err-fill", 4.5, "danger button label"],

  // ── Status text on its tinted chip — 4.5:1 ──────────────────────────────
  ["--status-ok", "--status-ok-bg", 4.5, "success chip text"],
  ["--status-warn", "--status-warn-bg", 4.5, "warning chip text"],
  ["--status-err", "--status-err-bg", 4.5, "error chip text"],
  ["--status-info", "--status-info-bg", 4.5, "info chip text"],
  ["--status-running", "--status-running-bg", 4.5, "running chip text"],
  ["--status-ok", "--bg-surface", 4.5, "success text on card"],
  ["--status-warn", "--bg-surface", 4.5, "warning text on card"],
  ["--status-err", "--bg-surface", 4.5, "error text on card"],
  ["--status-info", "--bg-surface", 4.5, "info text on card"],
  ["--status-running", "--bg-surface", 4.5, "running text on card"],

  // ── Control boundaries and indicators — 3.0:1 (WCAG 1.4.11) ─────────────
  ...["--border-default", "--border-strong", "--border-focus", "--accent"].flatMap((fg) =>
    ["--bg-base", "--bg-surface", "--bg-sidebar"].map((bg) => [
      fg,
      bg,
      3,
      `${fg.replace("--border-", "").replace("--", "")} on ${bg.replace("--bg-", "")}`,
    ]),
  ),
  ["--secondary-strong", "--bg-sidebar", 3, "active nav marker"],
  ["--status-ok-dot", "--bg-surface", 3, "success dot"],
  ["--status-warn-dot", "--bg-surface", 3, "warning dot"],
  ["--status-err-dot", "--bg-surface", 3, "error dot"],
  ["--status-info-dot", "--bg-surface", 3, "info dot"],
  ["--text-placeholder", "--bg-inset", 4.5, "input placeholder"],
];

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

// `:root` carries the primitives; `:root, [data-theme="light"]` carries the
// semantic layer. v2.0 specifies one palette, so there is one map to build.
// Order matters: later declarations win.
const tokens = declarations(
  blockFor((s) =>
    s.split(",").some((p) => p.trim() === ":root" || p.trim() === '[data-theme="light"]'),
  ),
);

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
  const name = label.padEnd(34);

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

console.log("\n  DESIGN SYSTEM v2.0 — WARM NEUTRAL");
console.log("  " + "─".repeat(74));

for (const pair of PAIRS) {
  const { status, line } = checkPair(pair, tokens);
  if (status === "fail") failures++;
  else if (status === "skip") skipped++;
  else checked++;
  console.log(line);
}

console.log("\n  " + "─".repeat(74));
console.log(`  ${checked} pairs checked · ${skipped} skipped · ${failures} failing\n`);

if (failures > 0) {
  console.error(`  WCAG 2.2 AA contrast check FAILED: ${failures} pair(s) below threshold.`);
  console.error("  Fix the token values in packages/ui/src/tokens/tokens.css.\n");
  process.exit(1);
}
console.log("  All token pairs meet WCAG 2.2 AA.\n");

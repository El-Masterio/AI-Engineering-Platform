#!/usr/bin/env node
/**
 * Dependency licence gate (§24 stage 1).
 *
 * The product is commercial SaaS. Permissive licences are fine; strong copyleft
 * is not, and "we did not notice" is not a defence in a diligence review.
 *
 * The design is deliberately fail-closed. There is no "warn" tier, because a
 * warning in CI is a thing people scroll past — §24 principle 2: every check
 * that can be automated is a gate, not a suggestion. A licence that is neither
 * on the permissive list nor individually acknowledged below fails the build,
 * and the fix is for a human to write down why it is acceptable.
 */
import { execSync } from "node:child_process";

/** Permissive: use freely in a closed-source commercial product. */
const PERMISSIVE = new Set([
  "0BSD",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "BlueOak-1.0.0",
  "CC0-1.0",
  "ISC",
  "MIT",
  "MIT-0",
  "Python-2.0",
  "Unlicense",
  "WTFPL",
  "Zlib",
]);

/**
 * Weak copyleft and attribution licences we have looked at and accepted, with
 * the reason. Adding a line here is a deliberate act; that is the point.
 *
 * Keyed by package name so a NEW package under the same licence still fails and
 * gets its own review.
 */
const ACKNOWLEDGED = new Map([
  ["axe-core", "MPL-2.0 — file-level copyleft. Test-time only, never shipped, never modified."],
  [
    "lightningcss",
    "MPL-2.0 — file-level copyleft. Build-time CSS tool, unmodified, not redistributed.",
  ],
  ["lightningcss-win32-x64-msvc", "MPL-2.0 — platform binary of the above."],
  [
    "caniuse-lite",
    "CC-BY-4.0 — a browser-support dataset, not code. Attribution satisfied by shipping the package notice.",
  ],
  [
    "@img/sharp-win32-x64",
    "Apache-2.0 AND LGPL-3.0-or-later — libvips binding pulled in by Next.js image optimization. " +
      "LGPL obligations attach to distribution; we operate the software as a service and do not " +
      "distribute the binary. Dynamically linked and unmodified. Revisit if we ever ship an installable artifact.",
  ],
]);

/** Never acceptable, listed so the failure message can say why. */
const FORBIDDEN = [/\bAGPL/i, /\bSSPL/i, /\bBUSL/i, /\bCommons Clause/i, /(?<!L)\bGPL-[23]/i];

// ── Collect ────────────────────────────────────────────────────────────────

// A literal command string, not execFileSync with an args array. On Windows
// `pnpm` is a .cmd shim, which Node 24 refuses to spawn directly (EINVAL), and
// passing an args array through `shell: true` triggers DEP0190 because the args
// would be concatenated rather than escaped. A constant string interpolates
// nothing, so there is nothing to escape.
const raw = execSync("pnpm licenses list --json", {
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
});

/** @type {Record<string, { name: string, versions: string[] }[]>} */
const byLicence = JSON.parse(raw);

/**
 * A dual licence like "(MIT OR CC0-1.0)" is satisfied if EITHER side is
 * permissive — we simply take the permissive option.
 */
function isPermissive(licence) {
  const options = licence
    .replaceAll(/[()]/g, "")
    .split(/\s+OR\s+/i)
    .map((s) => s.trim());
  return options.some((option) => PERMISSIVE.has(option));
}

/**
 * Classify one package.
 *
 * @returns {{ verdict: "ok" } | { verdict: "acknowledged" | "fail", label: string, licence: string, why: string }}
 */
function classify(licence, pkg) {
  const label = `${pkg.name}@${pkg.versions.join(",")}`;

  if (FORBIDDEN.some((re) => re.test(licence))) {
    return { verdict: "fail", label, licence, why: "forbidden licence for a commercial product" };
  }
  if (isPermissive(licence)) return { verdict: "ok" };
  if (ACKNOWLEDGED.has(pkg.name)) {
    return { verdict: "acknowledged", label, licence, why: ACKNOWLEDGED.get(pkg.name) };
  }
  return {
    verdict: "fail",
    label,
    licence,
    why: "not permissive and not individually acknowledged — review it and add a reason to ACKNOWLEDGED",
  };
}

const failures = [];
const accepted = [];
let packageCount = 0;

for (const [licence, packages] of Object.entries(byLicence)) {
  for (const pkg of packages) {
    packageCount++;
    const result = classify(licence, pkg);
    if (result.verdict === "fail") failures.push(result);
    else if (result.verdict === "acknowledged") accepted.push(result);
  }
}

// ── Report ─────────────────────────────────────────────────────────────────

console.log(
  `\n  ${packageCount} packages across ${Object.keys(byLicence).length} licence strings\n`,
);

if (accepted.length > 0) {
  console.log("  Acknowledged non-permissive licences:");
  for (const a of accepted) console.log(`    • ${a.label}  [${a.licence}]\n      ${a.why}`);
  console.log("");
}

if (failures.length > 0) {
  console.error(`  LICENCE CHECK FAILED — ${failures.length} package(s) need a decision:\n`);
  for (const f of failures) console.error(`    ✖ ${f.label}  [${f.licence}]\n      ${f.why}`);
  console.error(
    "\n  Fix: remove the dependency, or add it to ACKNOWLEDGED in scripts/check-licenses.mjs with a reason.\n",
  );
  process.exit(1);
}

console.log("  All dependency licences are permissive or acknowledged.\n");

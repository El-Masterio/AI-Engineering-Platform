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
  [
    "caniuse-lite",
    "CC-BY-4.0 — a browser-support dataset, not code. Attribution satisfied by shipping the package notice.",
  ],
]);

/**
 * Optional platform binaries of an already-acknowledged package.
 *
 * These exist because `pnpm licenses list` reports only what is installed for
 * the CURRENT platform. Acknowledging `@img/sharp-win32-x64` by name passed on a
 * Windows laptop and failed in Linux CI on `@img/sharp-libvips-linux-x64` — the
 * gate was silently platform-dependent, which makes a green run on one OS say
 * nothing about the other. Listing every triple would leave the same hole open
 * for the next architecture (this repo already builds arm64 images).
 *
 * The licence reasoning is identical for every platform variant of the same
 * upstream package, so it is written once. The patterns are anchored and shaped
 * like `<name>-<os>-<arch>[-abi]` precisely so they cannot swallow an unrelated
 * package that merely shares a prefix — `sharp-charts` or `lightningcss-loader`
 * still fail and still get their own review.
 */
const ACKNOWLEDGED_PLATFORM_BINARIES = [
  {
    pattern: /^@img\/sharp-(?:libvips-)?(?:linux|linuxmusl|darwin|win32|freebsd)-[a-z0-9]+$/,
    why:
      "Apache-2.0 AND LGPL-3.0-or-later — libvips binding pulled in by Next.js image optimization. " +
      "LGPL obligations attach to distribution; we operate the software as a service and do not " +
      "distribute the binary. Dynamically linked and unmodified. Revisit if we ever ship an installable artifact.",
  },
  {
    pattern: /^lightningcss-(?:linux|darwin|win32|freebsd)-[a-z0-9]+(?:-(?:gnu|musl|msvc))?$/,
    why: "MPL-2.0 — platform binary of lightningcss, acknowledged above.",
  },
];

function acknowledgementFor(name) {
  if (ACKNOWLEDGED.has(name)) return ACKNOWLEDGED.get(name);
  return ACKNOWLEDGED_PLATFORM_BINARIES.find((entry) => entry.pattern.test(name))?.why;
}

/**
 * The patterns above are the only fuzzy matching in a gate that is otherwise
 * exact, so their reach is asserted rather than assumed — including the names
 * that must NOT match. A pattern that quietly widened would waive review for
 * packages nobody looked at, and would do it invisibly.
 *
 * This runs on every invocation. It costs nothing and it fails loudly.
 */
function selfTest() {
  const mustMatch = [
    "@img/sharp-libvips-linux-x64", // ← the two that failed in Linux CI
    "lightningcss-linux-x64-gnu",
    "@img/sharp-win32-x64",
    "lightningcss-win32-x64-msvc",
    "@img/sharp-linux-arm64", // ← arm64: we build multi-arch images
    "@img/sharp-libvips-linuxmusl-arm64",
    "lightningcss-linux-arm64-musl",
  ];
  const mustNotMatch = [
    "@img/sharp-charts",
    "lightningcss-loader",
    "lightningcss-plugin-linux-x64",
    "some-linux-x64",
  ];

  const wrong = [
    ...mustMatch
      .filter((n) => acknowledgementFor(n) === undefined)
      .map((n) => `${n} (not matched)`),
    ...mustNotMatch
      .filter((n) => acknowledgementFor(n) !== undefined)
      .map((n) => `${n} (matched, must not)`),
  ];

  if (wrong.length > 0) {
    console.error("\n  ACKNOWLEDGED_PLATFORM_BINARIES is wrong:\n");
    for (const w of wrong) console.error(`    ✖ ${w}`);
    console.error("");
    process.exit(1);
  }
}

selfTest();

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
  const why = acknowledgementFor(pkg.name);
  if (why !== undefined) return { verdict: "acknowledged", label, licence, why };
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

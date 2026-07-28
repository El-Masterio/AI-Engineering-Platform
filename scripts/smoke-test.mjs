#!/usr/bin/env node
/**
 * Staging smoke test (§24 stage 11).
 *
 * Gates promotion. It is deliberately small — a smoke test that takes minutes
 * gets skipped, and one that asserts business behaviour belongs in the E2E
 * suite. This answers one question: is the thing we just deployed actually up,
 * connected to its database, and the revision we expected?
 *
 * That last check is the one people leave out, and it is the one that catches a
 * deploy which silently did nothing.
 *
 * Usage: node scripts/smoke-test.mjs <base-url> [expected-revision]
 */
const [baseUrl, expectedRevision] = process.argv.slice(2);

if (!baseUrl) {
  console.error("usage: smoke-test.mjs <base-url> [expected-revision]");
  process.exit(2);
}

// Railway shows the domain without a scheme, so that is what gets pasted into
// STAGING_URL. `fetch` throws "Failed to parse URL" on a bare host, which reads
// like the service is broken rather than the variable being half-written.
const base = (/^https?:\/\//.test(baseUrl) ? baseUrl : `https://${baseUrl}`).replace(/\/$/, "");
const failures = [];

/** Retry: a container that has just started is allowed a few seconds. */
async function get(path, { attempts = 10, delayMs = 3000 } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(`${base}${path}`, {
        signal: AbortSignal.timeout(10_000),
        headers: { "user-agent": "atelier-smoke-test" },
      });
      return { status: response.status, body: await response.text(), headers: response.headers };
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastError;
}

function check(name, condition, detail = "") {
  if (condition) {
    console.log(`  PASS  ${name}`);
  } else {
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
    failures.push(name);
  }
}

console.log(`\nSmoke testing ${base}\n`);

const health = await get("/healthz");
check("liveness returns 200", health.status === 200, `got ${health.status}`);

const ready = await get("/readyz");
check("readiness returns 200", ready.status === 200, `got ${ready.status}`);
check(
  "readiness reports the database healthy",
  ready.body.includes('"name":"database"') && !ready.body.includes('"status":"fail"'),
  ready.body.slice(0, 200),
);

const root = await get("/");
check("root returns 200", root.status === 200, `got ${root.status}`);
check("root identifies the service", root.body.includes("@atelier/api"), root.body.slice(0, 200));

// NFR-OBS-6: every response carries a support-correlatable id.
check("response carries a correlation id", root.headers.get("x-request-id") !== null);

// The check that catches a deploy which quietly did not happen.
if (expectedRevision) {
  const short = expectedRevision.slice(0, 7);
  check(
    `serving revision ${short}`,
    root.body.includes(expectedRevision) || root.body.includes(short),
    `body was ${root.body.slice(0, 200)}`,
  );
}

const missing = await get("/nope");
check("unknown route returns 404", missing.status === 404, `got ${missing.status}`);

console.log("");
if (failures.length > 0) {
  console.error(`SMOKE TEST FAILED — ${failures.length} check(s): ${failures.join(", ")}\n`);
  process.exit(1);
}
console.log("All smoke checks passed.\n");

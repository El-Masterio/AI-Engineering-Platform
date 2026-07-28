/**
 * Out-of-process trace probe.
 *
 * OpenTelemetry's auto-instrumentation patches module exports, and under ESM it
 * does that through a Node loader hook. Vitest resolves modules through Vite's
 * own pipeline, which the hook never sees — so inside a vitest worker the
 * instrumentation loads, reports no error, and produces no spans.
 *
 * Testing it there would mean testing vitest's module graph. This script runs
 * the real thing instead: a plain Node process started exactly the way a
 * service will be (`node --import @opentelemetry/instrumentation/hook.mjs`),
 * making a real HTTP request that runs a real query. It prints a span summary
 * as JSON on stdout, and the integration test asserts on that.
 *
 * Usage: node --import @opentelemetry/instrumentation/hook.mjs trace-probe.mjs <postgres-url> <out.json>
 *
 * Output goes to a FILE, not stdout: instrumentation and drivers both warn on
 * stdout occasionally, and a single stray line makes the result unparseable.
 */
import { writeFileSync } from "node:fs";
import { InMemorySpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-node";
// dist/, not src/: the point of this probe is that it runs through Node's real
// module resolution rather than Vite's. That makes the build a hard prerequisite
// — `test:integration` therefore builds first. On a clean checkout without it,
// this file dies with ERR_MODULE_NOT_FOUND, which is how it failed in CI while
// passing locally against a stale dist/ left on disk.
import { startTracing } from "../../dist/tracing.js";
import { withDatabaseSpan, withServerSpan, withSpan } from "../../dist/spans.js";

const [connectionString, outputPath] = process.argv.slice(2);
if (!connectionString || !outputPath) {
  process.stderr.write("usage: trace-probe.mjs <postgres-url> <out.json>\n");
  process.exit(2);
}

const exporter = new InMemorySpanExporter();

// Before importing http or postgres — the ordering the whole thing depends on.
const tracing = startTracing({
  serviceName: "trace-probe",
  spanProcessors: [new SimpleSpanProcessor(exporter)],
});

const { createServer } = await import("node:http");
const { default: postgres } = await import("postgres");

const sql = postgres(connectionString, { max: 2, prepare: false });
await sql`CREATE TABLE IF NOT EXISTS organizations (id uuid PRIMARY KEY, slug text NOT NULL)`;

const server = createServer((request, response) => {
  if (request.url === "/healthz") {
    // Deliberately NOT wrapped in a span: health probes fire constantly and
    // would drown everything useful.
    response.writeHead(200, { "content-type": "application/json" });
    response.end('{"status":"pass"}');
    return;
  }

  // The three hops the acceptance criterion asks for: HTTP → service → DB.
  void withServerSpan(request, async () => {
    const count = await withSpan("service.countOrganizations", {}, async () => {
      const statement = "SELECT count(*) FROM organizations";
      const rows = await withDatabaseSpan(
        statement,
        () => sql`SELECT count(*)::text AS count FROM organizations`,
      );
      return Number(rows[0]?.count ?? 0);
    });
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ count }));
  });
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address();

await fetch(`http://127.0.0.1:${port}/organizations`);
// A health probe too, to prove it is excluded from tracing.
await fetch(`http://127.0.0.1:${port}/healthz`);

// Let the server spans finish and export.
await new Promise((resolve) => setTimeout(resolve, 300));

const spans = exporter.getFinishedSpans().map((span) => ({
  name: span.name,
  kind: span.kind,
  traceId: span.spanContext().traceId,
  spanId: span.spanContext().spanId,
  parentSpanId: span.parentSpanContext?.spanId ?? span.parentSpanId ?? null,
  attributes: span.attributes,
}));

writeFileSync(outputPath, JSON.stringify({ spans }, null, 2), "utf8");

await new Promise((resolve) => server.close(resolve));
await sql.end({ timeout: 5 });
await tracing.shutdown();

import { execFile } from "node:child_process";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import path from "node:path";
import { readFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import postgres from "postgres";
import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  REQUEST_ID_HEADER,
  newCorrelationId,
  sanitizeRequestId,
  withCorrelation,
} from "./correlation.js";
import { healthStatusCode, liveness, readiness } from "./health.js";

/**
 * M006 acceptance, the two halves that need a real process:
 *   "A trace spans HTTP → service → DB"
 *   "/healthz and /readyz respond"
 *
 * A real HTTP server and a real Postgres, because both spans come from
 * OpenTelemetry's auto-instrumentation patching `node:http` and `pg`. Mocking
 * either would test the mock and prove nothing about whether instrumentation
 * is actually wired up — which is the failure this suite exists to catch.
 *
 * `node:http` rather than Fastify on purpose: the framework decision is M016's
 * and is still open (§14 lists Fastify vs. NestJS as pending). The
 * instrumentation being verified is at the `node:http` layer regardless.
 */

const execFileAsync = promisify(execFile);
let container: StartedPostgreSqlContainer;
let sql: Sql;
let server: Server;
let baseUrl: string;

/** The "service" layer — the middle hop the trace has to pass through. */
async function countOrganizations(): Promise<number> {
  const rows = await sql<{ count: string }[]>`SELECT count(*)::text AS count FROM organizations`;
  return Number(rows[0]?.count ?? 0);
}

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:17-alpine").start();
  sql = postgres(container.getConnectionUri(), { max: 4, prepare: false });
  await sql`CREATE TABLE organizations (id uuid PRIMARY KEY, slug text NOT NULL)`;
  await sql`INSERT INTO organizations (id, slug) VALUES (gen_random_uuid(), 'acme')`;

  server = createServer((request, response) => {
    const correlationId = newCorrelationId();
    const requestId = sanitizeRequestId(request.headers[REQUEST_ID_HEADER]);

    void withCorrelation({ correlationId, ...(requestId && { requestId }) }, async () => {
      response.setHeader(REQUEST_ID_HEADER, correlationId);

      if (request.url === "/healthz") {
        const report = liveness();
        response.writeHead(healthStatusCode(report), { "content-type": "application/json" });
        response.end(JSON.stringify(report));
        return;
      }

      if (request.url === "/readyz") {
        const report = await readiness([
          { name: "database", probe: async () => void (await sql`SELECT 1`) },
        ]);
        response.writeHead(healthStatusCode(report), { "content-type": "application/json" });
        response.end(JSON.stringify(report));
        return;
      }

      // HTTP → service → DB.
      const count = await countOrganizations();
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ count }));
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
}, 180_000);

afterAll(async () => {
  await new Promise<void>((resolve) => server?.close(() => resolve()));
  await sql?.end({ timeout: 5 });
  await container?.stop();
}, 60_000);

describe("a trace spans HTTP → service → DB", () => {
  /**
   * Run in a CHILD PROCESS, not here.
   *
   * Auto-instrumentation patches module exports through a Node ESM loader hook.
   * Vitest resolves modules via Vite, which the hook never sees, so inside a
   * worker the instrumentation loads cleanly and emits nothing — a test here
   * would be testing vitest's module graph rather than our tracing setup.
   *
   * The probe is started the way a real service is started, which makes this a
   * stronger check than an in-process one, not a weaker one.
   */
  type ProbeSpan = {
    name: string;
    traceId: string;
    spanId: string;
    parentSpanId: string | null;
    attributes: Record<string, unknown>;
  };

  let spans: ProbeSpan[] = [];

  beforeAll(async () => {
    const probe = fileURLToPath(new URL("testing/trace-probe.mjs", import.meta.url));
    const output = path.join(tmpdir(), `atelier-trace-probe-${Date.now()}.json`);

    await execFileAsync(
      process.execPath,
      [
        "--import",
        "@opentelemetry/instrumentation/hook.mjs",
        probe,
        container.getConnectionUri(),
        output,
      ],
      { cwd: fileURLToPath(new URL("..", import.meta.url)), timeout: 60_000 },
    );

    spans = (JSON.parse(await readFile(output, "utf8")) as { spans: ProbeSpan[] }).spans;
    await rm(output, { force: true });
  }, 120_000);

  it("emits an HTTP server span, a service span and a database span", () => {
    const http = spans.filter((s) => s.attributes["http.request.method"] !== undefined);
    expect(spans.some((s) => s.name === "service.countOrganizations")).toBe(true);
    const db = spans.filter((s) => s.attributes["db.system"] !== undefined);

    expect(http.length, "no HTTP span — is http instrumentation active?").toBeGreaterThan(0);
    expect(db.length, "no database span — is pg instrumentation active?").toBeGreaterThan(0);
  });

  it("puts them in ONE trace, with the query descending from the request", () => {
    const db = spans.find((s) => s.attributes["db.system"] !== undefined);
    const server = spans.find((s) => s.attributes["http.request.method"] !== undefined);

    expect(db, "expected a database span").toBeDefined();
    expect(server, "expected a root HTTP server span").toBeDefined();

    // Two trace ids would mean context was lost between the request and the query.
    expect(db?.traceId).toBe(server?.traceId);
    // And the query is a descendant, not a second root.
    expect(db?.parentSpanId).not.toBeNull();
  });

  it("records the SQL statement on the database span", () => {
    const db = spans.find((s) => s.attributes["db.system"] !== undefined);
    const statement = db?.attributes["db.statement"];
    expect(typeof statement === "string" ? statement : "").toContain("organizations");
  });

  it("excludes health probes from tracing", () => {
    // They fire constantly and would drown everything useful.
    const healthSpans = spans.filter((s) => {
      const urlPath = s.attributes["url.path"];
      return typeof urlPath === "string" && urlPath.includes("healthz");
    });
    expect(healthSpans).toHaveLength(0);
  });
});

describe("health endpoints respond", () => {
  it("/healthz returns 200 without touching a dependency", async () => {
    const response = await fetch(`${baseUrl}/healthz`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "pass", checks: [] });
  });

  it("/readyz returns 200 and names the dependency it checked", async () => {
    const response = await fetch(`${baseUrl}/readyz`);
    expect(response.status).toBe(200);

    const body = (await response.json()) as { status: string; checks: { name: string }[] };
    expect(body.status).toBe("pass");
    expect(body.checks.map((c) => c.name)).toEqual(["database"]);
  });
});

describe("correlation reaches the client", () => {
  it("echoes a correlation id on the response", async () => {
    // NFR-OBS-6: every user-visible error surfaces a support-correlatable id.
    const response = await fetch(`${baseUrl}/organizations`);
    expect(response.headers.get(REQUEST_ID_HEADER)).toMatch(/^[\da-f-]{36}$/);
  });
});

/**
 * Last on purpose — this stops the shared container, so every test after it
 * would have no database. Vitest runs files top to bottom, which makes ordering
 * a real constraint rather than a style preference.
 */
describe("readiness fails without taking the process down", () => {
  it("reports 503 once the database is gone, while liveness still passes", async () => {
    // The distinction that matters in a rolling deploy: readiness failing pulls
    // one replica out of the load balancer; liveness failing would have the
    // orchestrator restart every replica and turn a database blip into an outage.
    await container.stop();

    const ready = await fetch(`${baseUrl}/readyz`);
    expect(ready.status).toBe(503);

    const live = await fetch(`${baseUrl}/healthz`);
    expect(live.status, "liveness must not depend on the database").toBe(200);
  }, 60_000);
});

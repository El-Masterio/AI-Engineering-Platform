// @vitest-environment node
//
// Node rather than the suite-wide jsdom: this file builds a real Fastify
// instance, and @atelier/db resolves a directory from import.meta.url at import.
import { beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../server.js";
import { badRequest, conflict, forbidden, notFound, unprocessable } from "../lib/errors.js";

/**
 * §16's central claim is "one shape, everywhere". The word doing the work is
 * *everywhere*, so these tests go looking for the places a framework normally
 * emits its own shape instead — an unmatched route, a schema validation
 * failure, an unexpected throw — rather than only checking the errors we raise
 * on purpose.
 *
 * `inject` rather than a listening socket: same code path through Fastify's
 * lifecycle, no port, no teardown to forget.
 */

const logged: unknown[] = [];
let app: FastifyInstance;

const noop = (): void => {
  /* only `error` is inspected here */
};

function recordingLogger() {
  return {
    error: (...args: unknown[]): void => {
      logged.push(args);
    },
    warn: noop,
    info: noop,
    debug: noop,
    fatal: noop,
    trace: noop,
    child: noop,
  } as never;
}

beforeAll(async () => {
  app = await buildServer({
    port: 0,
    logger: recordingLogger(),
  });

  app.get("/boom", () => {
    // An unexpected failure, carrying exactly the kind of text §16 forbids.
    throw new Error('relation "organizations" does not exist at 10.0.0.7:5432');
  });
  app.get("/not-found", () => notFoundThrower());
  app.get("/forbidden", () => {
    throw forbidden();
  });
  app.get("/conflict", () => {
    throw conflict("version_conflict", "This resource has changed since you last read it.");
  });
  app.post(
    "/validated",
    {
      schema: {
        body: {
          type: "object",
          required: ["email", "count"],
          properties: { email: { type: "string", format: "email" }, count: { type: "integer" } },
        },
      },
    },
    () => ({ ok: true }),
  );
  app.post("/semantic", () => {
    throw unprocessable(
      "dependency_cycle",
      "Milestone 3 depends on milestone 5, which depends on 3.",
      [{ field: "dependencies", issue: "cycle: 3 → 5 → 3" }],
    );
  });
  app.get("/bad", () => {
    throw badRequest("invalid_thing", "That is not a thing.");
  });

  await app.ready();
});

function notFoundThrower(): never {
  throw notFound("project");
}

const envelopeOf = (body: string) =>
  JSON.parse(body) as {
    error: { type: string; code: string; message: string; request_id: string; details?: unknown[] };
  };

describe("every error uses the §16 envelope", () => {
  it.each([
    ["/boom", 500, "internal_error"],
    ["/not-found", 404, "not_found"],
    ["/forbidden", 403, "authorization_error"],
    ["/conflict", 409, "conflict"],
    ["/bad", 400, "validation_error"],
  ])("%s → %i is a %s", async (url, status, type) => {
    const response = await app.inject({ method: "GET", url });
    expect(response.statusCode).toBe(status);

    const { error } = envelopeOf(response.body);
    expect(error.type).toBe(type);
    expect(typeof error.code).toBe("string");
    expect(typeof error.message).toBe("string");
    expect(error.request_id).toBeTruthy();
  });

  it("covers an UNMATCHED ROUTE, which never reaches the error handler", async () => {
    // Fastify's default 404 body is
    // {"message":"Route GET:/nope not found","error":"Not Found","statusCode":404}
    // — a second error shape, in the case clients hit most often.
    const response = await app.inject({ method: "GET", url: "/nope" });
    expect(response.statusCode).toBe(404);

    const { error } = envelopeOf(response.body);
    expect(error.type).toBe("not_found");
    expect(error.request_id).toBeTruthy();
    expect(response.body).not.toContain("statusCode");
  });

  it("covers a SCHEMA VALIDATION failure", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/validated",
      payload: { email: "not-an-email", count: "seven" },
    });
    expect(response.statusCode).toBe(400);

    const { error } = envelopeOf(response.body);
    expect(error.type).toBe("validation_error");
    expect(error.code).toBe("invalid_body");
    expect(error.details?.length).toBeGreaterThan(0);
  });

  it("names the offending field in details", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/validated",
      payload: { count: 1 },
    });
    const { error } = envelopeOf(response.body);
    expect(JSON.stringify(error.details)).toContain("email");
  });

  it("carries details when we supply them (422)", async () => {
    const response = await app.inject({ method: "POST", url: "/semantic" });
    expect(response.statusCode).toBe(422);

    const { error } = envelopeOf(response.body);
    expect(error.code).toBe("dependency_cycle");
    expect(error.details).toEqual([{ field: "dependencies", issue: "cycle: 3 → 5 → 3" }]);
  });
});

describe("an unexpected error leaks nothing (§16)", () => {
  it("DISCARDS the message rather than forwarding it", async () => {
    const response = await app.inject({ method: "GET", url: "/boom" });

    // The thrown message carried a table name and a database host.
    expect(response.body).not.toContain("organizations");
    expect(response.body).not.toContain("10.0.0.7");
    expect(response.body).not.toContain("does not exist");
    expect(envelopeOf(response.body).error.message).toBe("Something went wrong on our side.");
  });

  it("still logs the real cause, so an operator can act on it", async () => {
    logged.length = 0;
    await app.inject({ method: "GET", url: "/boom" });
    expect(JSON.stringify(logged)).toContain("unhandled error");
  });

  it("has no stack trace anywhere in the body", async () => {
    const response = await app.inject({ method: "GET", url: "/boom" });
    expect(response.body).not.toContain("at ");
    expect(response.body).not.toMatch(/\.ts:\d+/);
  });
});

describe("request_id", () => {
  it("is on every error, and matches the response header", async () => {
    // §16: "on every error, always. It's how support works." Two different ids
    // would make that sentence false while looking true.
    const response = await app.inject({ method: "GET", url: "/nope" });
    expect(envelopeOf(response.body).error.request_id).toBe(response.headers["x-request-id"]);
  });

  it("reuses an inbound correlation id rather than inventing one", async () => {
    const inbound = "11111111-2222-4333-8444-555555555555";
    const response = await app.inject({
      method: "GET",
      url: "/nope",
      headers: { "x-request-id": inbound },
    });
    expect(envelopeOf(response.body).error.request_id).toBe(inbound);
  });

  it("is present on SUCCESS too", async () => {
    const response = await app.inject({ method: "GET", url: "/" });
    expect(response.headers["x-request-id"]).toBeTruthy();
  });
});

describe("404 does not distinguish missing from invisible", () => {
  it("gives the same message for an unknown route and a hidden resource", async () => {
    // §16: "never distinguish, it's an enumeration oracle."
    const unknownRoute = await app.inject({ method: "GET", url: "/nope" });
    const hiddenResource = await app.inject({ method: "GET", url: "/not-found" });

    expect(hiddenResource.statusCode).toBe(unknownRoute.statusCode);
    expect(envelopeOf(hiddenResource.body).error.message).toBe(
      envelopeOf(unknownRoute.body).error.message,
    );
  });
});

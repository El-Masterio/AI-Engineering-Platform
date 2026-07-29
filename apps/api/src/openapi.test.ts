// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildServer } from "./server.js";

/**
 * §16: "JSON Schema in Fastify route definitions → generated OpenAPI. Docs
 * cannot drift from code."
 *
 * That claim is only true if the document is actually generated from the route
 * schemas, so these tests assert the generated content rather than that the
 * generator ran.
 */

let app: FastifyInstance;
let document: {
  openapi: string;
  info: { title: string; version: string };
  paths: Record<string, Record<string, { responses?: Record<string, unknown> }>>;
};

beforeAll(async () => {
  app = await buildServer({ port: 0, logger: noopLogger() });

  app.post(
    "/v1/projects",
    {
      schema: {
        summary: "Create a project",
        body: {
          type: "object",
          required: ["name"],
          properties: { name: { type: "string", minLength: 1 } },
        },
        response: {
          201: {
            type: "object",
            properties: { id: { type: "string" }, name: { type: "string" } },
          },
        },
      },
    },
    (_request, reply) => reply.status(201).send({ id: "p1", name: "x" }),
  );

  await app.ready();
  document = app.swagger() as typeof document;
});

describe("the OpenAPI document", () => {
  it("generates and is OpenAPI 3", () => {
    expect(document.openapi).toMatch(/^3\./);
    expect(document.info.title).toBe("Atelier API");
  });

  it("includes a route's schema WITHOUT it being written twice", () => {
    // The point of §16's decision: one definition validates and documents.
    const post = document.paths["/v1/projects"]?.["post"];
    expect(post, "the route is missing from the document").toBeDefined();
    expect(JSON.stringify(post)).toContain("name");
    expect(post?.responses?.["201"]).toBeDefined();
  });

  it("HIDES infrastructure probes, which are not API surface", () => {
    // An orchestrator does not read the spec to find /healthz, and listing it
    // invites a client to depend on it.
    for (const path of ["/healthz", "/readyz", "/"]) {
      expect(document.paths[path], `${path} leaked into the public document`).toBeUndefined();
    }
  });

  it("declares the session cookie as a security scheme", () => {
    expect(JSON.stringify(document)).toContain("better-auth.session_token");
  });

  it("is serialisable, so it can actually be served", () => {
    expect(() => JSON.stringify(document)).not.toThrow();
  });
});

const noop = (): void => {
  /* the logger is not what these tests are about */
};

function noopLogger() {
  return {
    error: noop,
    warn: noop,
    info: noop,
    debug: noop,
    fatal: noop,
    trace: noop,
    child: noop,
  } as never;
}

import Fastify, { type FastifyInstance } from "fastify";
import etag from "@fastify/etag";
import swagger from "@fastify/swagger";
import {
  healthStatusCode,
  liveness,
  readiness,
  withCorrelation,
  newCorrelationId,
  sanitizeRequestId,
  REQUEST_ID_HEADER,
  type Logger,
} from "@atelier/observability";
import type { Sql } from "postgres";
import { registerErrorHandler } from "./plugins/error-handler.plugin.js";
import { registerRateLimit } from "./plugins/rate-limit.plugin.js";
import { createMemoryStore, type RateLimitStore } from "./lib/rate-limit.js";

/**
 * The API service, on Fastify (§14, M016).
 *
 * M011 built this on bare `node:http` and said so in a comment: the framework
 * decision belonged to this milestone, and a deploy pipeline needed something
 * that listens, answers probes and drains cleanly rather than something final.
 * This replaces it. Everything M011 and M014 verified — probes, correlation
 * ids, graceful shutdown, the auth mount — is preserved, because the container
 * checks from those milestones still have to pass.
 *
 * Everything §16 defines lives in `plugins/` and `lib/` rather than in route
 * handlers, so a new endpoint gets the conventions by existing rather than by
 * its author remembering them.
 */

export type ServerOptions = {
  port: number;
  logger: Logger;
  /** Present when a database is configured; readiness checks it when it is. */
  sql?: Sql;
  /** Surfaced on `/` so a deploy can be identified without guessing. */
  revision?: string;
  /** Handles everything under `/api/auth/*` (M014). */
  authHandler?: (request: Request) => Promise<Response>;
  /**
   * Where rate-limit windows live (§16, M020).
   *
   * Omitted means in-memory, which is correct for ONE process and wrong for
   * several — N replicas each keeping their own counter enforce N times the
   * limit. `main.ts` supplies a Redis store when `REDIS_URL` is set and warns
   * when it is not.
   */
  rateLimitStore?: RateLimitStore;
};

export type RunningServer = {
  app: FastifyInstance;
  port: number;
  shutdown: () => Promise<void>;
};

/** Everything Better Auth owns lives under this prefix. */
const AUTH_PREFIX = "/api/auth";

export async function buildServer(options: ServerOptions): Promise<FastifyInstance> {
  const { logger, sql, revision, authHandler } = options;

  const app = Fastify({
    /**
     * Fastify's own logger is off; §M006's pino instance is the one carrying
     * redaction and correlation. Two loggers would mean two formats, and one
     * of them unredacted.
     */
    logger: false,
    /**
     * Reuse the inbound correlation id as Fastify's request id, so
     * `request.id` in the error envelope and `x-request-id` on the response are
     * the same value. §16 puts `request_id` on every error because "it's how
     * support works" — two different ids would make that false while looking
     * true.
     */
    genReqId: (request) =>
      sanitizeRequestId(request.headers[REQUEST_ID_HEADER]) ?? newCorrelationId(),
    requestIdHeader: REQUEST_ID_HEADER,
    // Trust the proxy for client IP: staging runs behind Railway's edge, and
    // rate limiting keyed on the proxy's address throttles everyone as one.
    trustProxy: true,
  });

  registerErrorHandler(app, logger);

  // Before every route, including the auth prefix: sign-in is exactly what an
  // unauthenticated attacker hammers, and Better Auth's own limiter (M014)
  // covers its endpoints while this covers everything else.
  registerRateLimit(app, {
    store: options.rateLimitStore ?? createMemoryStore(),
    logger,
  });

  // ETag on GET responses, so §16's optimistic concurrency has a validator to
  // compare against. Strong, not weak — a conditional WRITE needs byte equality.
  await app.register(etag, { weak: false });

  /**
   * AWAITED, and before any route is declared.
   *
   * `@fastify/swagger` collects routes through an `onRoute` hook, and a hook
   * only sees routes registered after the plugin has loaded. `register()` defers
   * until `ready()`, so a fire-and-forget registration loads the plugin AFTER
   * the routes it was supposed to document — producing a valid, empty document
   * and a passing build. §16's "docs cannot drift from code" would have been
   * false on the first day, in the least visible way possible.
   */
  await app.register(swagger, {
    openapi: {
      info: {
        title: "Atelier API",
        description:
          "Conventions in §16. Errors share one envelope; lists are cursor-paginated; " +
          "mutations accept If-Match and Idempotency-Key.",
        version: "0.1.0",
      },
      components: {
        securitySchemes: {
          session: { type: "apiKey", in: "cookie", name: "better-auth.session_token" },
        },
      },
    },
  });

  // ── Correlation ────────────────────────────────────────────────────────
  app.addHook("onRequest", (request, reply, done) => {
    // NFR-OBS-6: the id is on the response whether or not anything went wrong.
    void reply.header(REQUEST_ID_HEADER, request.id);
    void withCorrelation({ correlationId: request.id }, () => {
      done();
      return Promise.resolve();
    });
  });

  // ── Probes ─────────────────────────────────────────────────────────────
  // Hidden from OpenAPI: they are infrastructure, not API surface, and an
  // orchestrator does not read the spec to find them.
  app.get("/healthz", { schema: { hide: true } }, (_request, reply) => {
    const report = liveness();
    return reply.status(healthStatusCode(report)).send(report);
  });

  app.get("/readyz", { schema: { hide: true } }, async (_request, reply) => {
    const report = await readiness(
      sql === undefined
        ? []
        : [
            {
              name: "database",
              probe: async () => void (await sql`SELECT 1`),
              // The wire gets "check failed"; the log gets the reason.
              onError: (error) =>
                logger.error({ err: error, check: "database" }, "readiness check failed"),
            },
          ],
    );
    return reply.status(healthStatusCode(report)).send(report);
  });

  app.get("/", { schema: { hide: true } }, () => ({
    service: "@atelier/api",
    status: "ok",
    ...(revision !== undefined && { revision }),
  }));

  // ── Authentication (M014) ──────────────────────────────────────────────
  if (authHandler !== undefined) {
    /**
     * Auth payloads must reach Better Auth as RAW BYTES.
     *
     * It reads and validates its own bodies, and a body Fastify has already
     * parsed cannot be read again — the request would arrive looking empty and
     * every auth POST would fail as a validation error with nothing wrong in it.
     */
    app.addContentTypeParser(
      "application/json",
      { parseAs: "buffer" },
      (request, payload, done) => {
        if (request.url.startsWith(`${AUTH_PREFIX}/`)) {
          done(null, payload);
          return;
        }
        try {
          const text = (payload as Buffer).toString("utf8");
          done(null, text.length === 0 ? undefined : JSON.parse(text));
        } catch (error: unknown) {
          done(error as Error);
        }
      },
    );

    /**
     * Better Auth owns its whole prefix, including the paths it 404s, so this
     * is one wildcard rather than a route per endpoint.
     */
    app.route({
      method: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      url: `${AUTH_PREFIX}/*`,
      schema: { hide: true },
      handler: async (request, reply) => {
        const origin = `${request.protocol}://${request.hostname}`;
        const headers = new Headers();
        for (const [name, value] of Object.entries(request.headers)) {
          if (value === undefined) continue;
          const values = Array.isArray(value) ? value : [value];
          for (const single of values) headers.append(name, single);
        }

        const hasBody = request.method !== "GET" && request.method !== "HEAD";
        const body = hasBody && Buffer.isBuffer(request.body) ? request.body : undefined;

        const response = await authHandler(
          new Request(new URL(request.url, origin), {
            method: request.method,
            headers,
            ...(body !== undefined && body.length > 0 && { body }),
          }),
        );

        for (const [name, value] of response.headers) {
          // getSetCookie() rather than get(): several cookies must stay several
          // headers, and Headers joins them with a comma browsers mis-parse.
          if (name.toLowerCase() === "set-cookie") continue;
          void reply.header(name, value);
        }
        const cookies = response.headers.getSetCookie();
        if (cookies.length > 0) void reply.header("set-cookie", cookies);

        return reply
          .status(response.status)
          .send(response.body === null ? undefined : Buffer.from(await response.arrayBuffer()));
      },
    });
  }

  return app;
}

/**
 * Start listening, and wire graceful shutdown.
 *
 * §24 requires SIGTERM to stop accepting, drain in flight, then exit. Fastify's
 * `close()` does the draining; the forced-exit timer is still ours, because a
 * request that never finishes must not hold the process open forever — the
 * orchestrator would SIGKILL it and the drain was pointless.
 */
export async function startApiServer(options: ServerOptions): Promise<RunningServer> {
  const app = await buildServer(options);
  const { logger } = options;

  // 0.0.0.0, not localhost: inside a container, binding the loopback makes the
  // service unreachable from outside it, and the symptom is a health check that
  // times out while the process looks perfectly healthy.
  await app.listen({ port: options.port, host: "0.0.0.0" });

  const address = app.server.address();
  const port = typeof address === "object" && address !== null ? address.port : options.port;
  logger.info({ port }, "listening");

  let isShuttingDown = false;
  const shutdown = async (): Promise<void> => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    logger.info("draining");

    const forced = setTimeout(() => {
      logger.warn("drain timed out; closing anyway");
    }, 10_000);
    forced.unref();

    await app.close();
    clearTimeout(forced);
    logger.info("stopped");
  };

  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.once(signal, () => {
      logger.info({ signal }, "signal received");
      void shutdown().then(() => process.exit(0));
    });
  }

  return { app, port, shutdown };
}

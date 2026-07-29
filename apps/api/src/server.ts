import { createServer, type Server, type ServerResponse } from "node:http";
import {
  healthStatusCode,
  liveness,
  readiness,
  withServerSpan,
  withCorrelation,
  newCorrelationId,
  sanitizeRequestId,
  REQUEST_ID_HEADER,
  type Logger,
} from "@atelier/observability";
import type { Sql } from "postgres";

/**
 * The staging service.
 *
 * `node:http` rather than Fastify: the framework decision is M016's and is
 * still open (§14 lists Fastify vs. NestJS as pending). What M011 needs is a
 * process that listens, answers probes, and shuts down cleanly — none of which
 * depends on the framework, and all of which the deploy pipeline needs in order
 * to be verifiable at all.
 *
 * GATE 1A asks for "a trivial endpoint deployed through the full pipeline,
 * traced end to end". That is `/` here, and it is deliberately trivial.
 */

export type ServerOptions = {
  port: number;
  logger: Logger;
  /** Present when a database is configured; readiness checks it when it is. */
  sql?: Sql;
  /** Surfaced on `/` so a deploy can be identified without guessing. */
  revision?: string;
};

export type RunningServer = {
  server: Server;
  port: number;
  /** Drain and stop. Safe to call more than once. */
  shutdown: () => Promise<void>;
};

function json(response: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
  });
  response.end(payload);
}

function createApiServer(options: ServerOptions): Server {
  const { logger, sql, revision } = options;

  return createServer((request, response) => {
    const url = request.url ?? "/";

    // Probes are answered before anything else and are not traced: they fire
    // constantly and would drown every useful span.
    if (url === "/healthz") {
      const report = liveness();
      json(response, healthStatusCode(report), report);
      return;
    }

    if (url === "/readyz") {
      void (async () => {
        const report = await readiness(
          sql === undefined
            ? []
            : [
                {
                  name: "database",
                  probe: async () => void (await sql`SELECT 1`),
                  // The wire gets "check failed"; the log gets the reason.
                  // Without this a failing deploy is undiagnosable from outside
                  // the container.
                  onError: (error) =>
                    logger.error({ err: error, check: "database" }, "readiness check failed"),
                },
              ],
        );
        json(response, healthStatusCode(report), report);
      })();
      return;
    }

    const correlationId = newCorrelationId();
    const requestId = sanitizeRequestId(request.headers[REQUEST_ID_HEADER]);

    void withCorrelation({ correlationId, ...(requestId && { requestId }) }, async () => {
      // NFR-OBS-6: the id is on the response whether or not anything went wrong.
      response.setHeader(REQUEST_ID_HEADER, correlationId);

      await withServerSpan(request, () => {
        if (url === "/") {
          logger.info({ path: url }, "request");
          json(response, 200, {
            service: "@atelier/api",
            status: "ok",
            ...(revision !== undefined && { revision }),
          });
          return Promise.resolve();
        }

        json(response, 404, { error: { code: "NOT_FOUND", message: "No such route." } });
        return Promise.resolve();
      });
    });
  });
}

/**
 * Start listening, and wire graceful shutdown.
 *
 * §24 requires SIGTERM to stop accepting, drain in flight, then exit. Without
 * it a rolling deploy kills connections mid-response, which shows up as a
 * handful of 502s per release and gets blamed on the load balancer.
 *
 * The forced-exit timer is the other half: a request that never finishes must
 * not hold the process open forever, or the orchestrator SIGKILLs it and the
 * drain was pointless.
 */
export async function startApiServer(options: ServerOptions): Promise<RunningServer> {
  const server = createApiServer(options);
  const { logger } = options;

  await new Promise<void>((resolve) => server.listen(options.port, resolve));
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : options.port;
  logger.info({ port }, "listening");

  let isShuttingDown = false;
  const shutdown = async (): Promise<void> => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    logger.info("draining");

    await new Promise<void>((resolve) => {
      const forced = setTimeout(() => {
        logger.warn("drain timed out; closing anyway");
        resolve();
      }, 10_000);
      forced.unref();

      server.close(() => {
        clearTimeout(forced);
        resolve();
      });
      // Node keeps keep-alive sockets open past `close()`; without this the
      // drain waits the full timeout on every deploy.
      server.closeIdleConnections();
    });

    logger.info("stopped");
  };

  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.once(signal, () => {
      logger.info({ signal }, "signal received");
      void shutdown().then(() => process.exit(0));
    });
  }

  return { server, port, shutdown };
}

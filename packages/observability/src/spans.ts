import { SpanKind, SpanStatusCode, context, propagation, trace } from "@opentelemetry/api";
import type { Attributes, Span, Tracer } from "@opentelemetry/api";

/**
 * Explicit instrumentation.
 *
 * M006 set out to get the trace from auto-instrumentation alone. It does not
 * work here, for two separate reasons that were only visible by running it:
 *
 *   1. `@opentelemetry/instrumentation-pg` instruments the `pg` package.
 *      packages/db uses `postgres` (postgres.js) — a different library with no
 *      OTel auto-instrumentation. It would never have produced a span.
 *   2. Under pure ESM, `import-in-the-middle` does not reliably patch `node:`
 *      core modules, so the HTTP server span did not appear either.
 *
 * Both fail SILENTLY: the SDK starts, reports no error, and exports nothing.
 * That is the worst possible shape for a telemetry bug, so the trace is carried
 * by these helpers instead — they work under any module system and are what a
 * Fastify plugin will call at M016.
 *
 * `HttpInstrumentation` stays registered because it costs nothing and will
 * start contributing once a framework is chosen. It is not what the trace
 * depends on today.
 */

const TRACER_NAME = "@atelier/observability";

export function tracer(): Tracer {
  return trace.getTracer(TRACER_NAME);
}

/**
 * Run `work` inside a span, recording failures.
 *
 * The span ends in a `finally`, so an exception cannot leave one open — an
 * unended span is invisible in every backend and takes its children with it.
 */
export async function withSpan<T>(
  name: string,
  attributes: Attributes,
  work: (span: Span) => Promise<T>,
  kind: SpanKind = SpanKind.INTERNAL,
): Promise<T> {
  const span = tracer().startSpan(name, { kind, attributes });
  try {
    return await context.with(trace.setSpan(context.active(), span), () => work(span));
  } catch (error: unknown) {
    span.setStatus({ code: SpanStatusCode.ERROR });
    span.recordException(error instanceof Error ? error : new Error(String(error)));
    throw error;
  } finally {
    span.end();
  }
}

/**
 * Start a SERVER span for an incoming request, continuing the caller's trace.
 *
 * `propagation.extract` reads the W3C `traceparent` header, which is what makes
 * a distributed trace distributed — without it every service starts its own
 * trace and the whole point is lost.
 */
export async function withServerSpan<T>(
  request: {
    method?: string | undefined;
    url?: string | undefined;
    headers: Record<string, unknown>;
  },
  work: (span: Span) => Promise<T>,
): Promise<T> {
  const parent = propagation.extract(context.active(), request.headers);
  const span = tracer().startSpan(
    `${request.method ?? "GET"} ${request.url ?? "/"}`,
    {
      kind: SpanKind.SERVER,
      attributes: {
        "http.request.method": request.method ?? "GET",
        "url.path": request.url ?? "/",
      },
    },
    parent,
  );

  try {
    return await context.with(trace.setSpan(parent, span), () => work(span));
  } catch (error: unknown) {
    span.setStatus({ code: SpanStatusCode.ERROR });
    span.recordException(error instanceof Error ? error : new Error(String(error)));
    throw error;
  } finally {
    span.end();
  }
}

/**
 * Wrap a database call. `db.system` and `db.statement` are the conventional
 * attribute names, so existing dashboards and Tempo queries work unchanged.
 */
export async function withDatabaseSpan<T>(statement: string, work: () => Promise<T>): Promise<T> {
  return withSpan(
    "postgres.query",
    { "db.system": "postgresql", "db.statement": statement },
    () => work(),
    SpanKind.CLIENT,
  );
}

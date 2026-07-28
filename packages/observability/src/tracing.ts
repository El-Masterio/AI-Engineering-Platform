import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";
import type { SpanProcessor } from "@opentelemetry/sdk-trace-node";

/**
 * OpenTelemetry setup (NFR-OBS-1: a trace spans HTTP → orchestrator → agent
 * session → tool call → model call).
 *
 * Auto-instrumentation alone does NOT carry the trace here — see spans.ts for
 * the two reasons, both discovered by running it rather than by reading docs.
 * Explicit helpers carry it; HttpInstrumentation stays registered because it
 * costs nothing and will contribute once M016 picks a framework.
 *
 * `start()` must run BEFORE the modules it instruments are imported, because
 * auto-instrumentation works by patching module exports. Import this first in
 * an entrypoint — that ordering constraint is the usual reason tracing
 * silently produces nothing.
 */

export type TracingOptions = {
  serviceName: string;
  serviceVersion?: string;
  /** OTLP endpoint. Absent means no exporter — tracing is a no-op, not an error. */
  endpoint?: string;
  /** Test seam: collect spans in memory instead of exporting them. */
  spanProcessors?: SpanProcessor[];
};

export type Tracing = {
  shutdown: () => Promise<void>;
};

export function startTracing(options: TracingOptions): Tracing {
  const { serviceName, serviceVersion = "0.0.0", endpoint, spanProcessors } = options;

  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: serviceName,
      [ATTR_SERVICE_VERSION]: serviceVersion,
    }),
    instrumentations: [
      new HttpInstrumentation({
        // Health probes fire constantly and would dominate the trace volume
        // while telling us nothing.
        ignoreIncomingRequestHook: (request) =>
          request.url === "/healthz" || request.url === "/readyz",
      }),
    ],
    ...(spanProcessors && { spanProcessors }),
    ...(endpoint !== undefined &&
      spanProcessors === undefined && {
        traceExporter: new OTLPTraceExporter({ url: `${endpoint}/v1/traces` }),
      }),
  });

  sdk.start();
  return { shutdown: () => sdk.shutdown() };
}

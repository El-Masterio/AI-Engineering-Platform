/**
 * OpenTelemetry setup, structured logging with redaction, health probes.
 *
 * Import order matters in an entrypoint: call `startTracing()` before importing
 * anything it instruments (http, pg), or auto-instrumentation patches modules
 * that have already been loaded and quietly produces no spans.
 */

export { createLogger, type Logger, type LoggerOptions, type LogLevel } from "./logger.js";

export {
  redact,
  redactString,
  isSensitiveKey,
  REDACTED,
  type RedactionOptions,
} from "./redaction.js";

export {
  withCorrelation,
  currentCorrelation,
  currentTraceIds,
  newCorrelationId,
  sanitizeRequestId,
  REQUEST_ID_HEADER,
  type CorrelationContext,
} from "./correlation.js";

export {
  liveness,
  readiness,
  healthStatusCode,
  type HealthReport,
  type CheckResult,
  type CheckStatus,
  type ReadinessCheck,
} from "./health.js";

export { startTracing, type Tracing, type TracingOptions } from "./tracing.js";

export { tracer, withSpan, withServerSpan, withDatabaseSpan } from "./spans.js";

import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { trace } from "@opentelemetry/api";

/**
 * Correlation context.
 *
 * NFR-OBS-6: "Every user-visible error surfaces a support-correlatable request
 * ID." That only works if the id reaches every log line without being threaded
 * through every function signature, so it lives in `AsyncLocalStorage` — the
 * one place Node can hold per-request state across `await` boundaries without
 * a global.
 *
 * Correlation id and trace id are deliberately separate. The trace id belongs
 * to OpenTelemetry and only exists while a span is active; the correlation id
 * is ours, exists for the whole request, survives sampling, and is the string
 * we are willing to show a customer. The logger emits both when it has them.
 */

export type CorrelationContext = {
  /** Stable for the life of the request. Safe to show a user. */
  readonly correlationId: string;
  /** Set when the caller supplied one, so a client can stitch its own logs. */
  readonly requestId?: string;
};

const storage = new AsyncLocalStorage<CorrelationContext>();

/** Header a caller can use to supply its own id. */
export const REQUEST_ID_HEADER = "x-request-id";

/**
 * Accept a caller-supplied id only if it is plausible.
 *
 * An id from the network lands in every log line for this request, so an
 * unvalidated one is a log-injection vector — a newline turns one entry into
 * two, and the second can say whatever the caller likes.
 */
export function sanitizeRequestId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 128) return undefined;
  return /^[\w.:-]+$/.test(trimmed) ? trimmed : undefined;
}

export function newCorrelationId(): string {
  return randomUUID();
}

/** Run `work` with a correlation context bound to it and everything it awaits. */
export function withCorrelation<T>(context: CorrelationContext, work: () => T): T {
  return storage.run(context, work);
}

export function currentCorrelation(): CorrelationContext | undefined {
  return storage.getStore();
}

/** The active OpenTelemetry trace and span ids, when a span is recording. */
export function currentTraceIds(): { traceId?: string; spanId?: string } {
  const span = trace.getActiveSpan();
  if (span === undefined) return {};
  const context = span.spanContext();
  // An all-zero trace id is OTel's "invalid span" sentinel; emitting it would
  // put a useless constant on every log line.
  if (context.traceId === "00000000000000000000000000000000") return {};
  return { traceId: context.traceId, spanId: context.spanId };
}

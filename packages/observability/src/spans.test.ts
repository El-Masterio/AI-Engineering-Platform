import { context, propagation, trace } from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import { W3CTraceContextPropagator } from "@opentelemetry/core";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { withDatabaseSpan, withServerSpan, withSpan } from "./spans.js";

/**
 * Spans created explicitly, verified in-process.
 *
 * These do not need auto-instrumentation — that is the entire point of the
 * explicit helpers, and why they work where the auto-instrumented path did not.
 */

const exporter = new InMemorySpanExporter();
let provider: BasicTracerProvider;

beforeAll(() => {
  provider = new BasicTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] });
  trace.setGlobalTracerProvider(provider);
  propagation.setGlobalPropagator(new W3CTraceContextPropagator());
  // NodeSDK registers this for you; a bare provider does not. Without a context
  // manager, `context.active()` always returns ROOT — so `context.with()` is a
  // no-op and every span comes out a root. Three tests here caught exactly that.
  context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());
});

beforeEach(() => {
  exporter.reset();
});

afterAll(async () => {
  await provider.shutdown();
});

describe("withSpan", () => {
  it("returns the result and ends the span", async () => {
    const result = await withSpan("work", { unit: "test" }, () => Promise.resolve(42));

    expect(result).toBe(42);
    const [span] = exporter.getFinishedSpans();
    expect(span?.name).toBe("work");
    expect(span?.attributes["unit"]).toBe("test");
    expect(span?.ended).toBe(true);
  });

  it("records the exception, marks the span an error, and rethrows", async () => {
    const boom = new Error("kaboom");

    await expect(withSpan("failing", {}, () => Promise.reject(boom))).rejects.toThrow("kaboom");

    const [span] = exporter.getFinishedSpans();
    // ERROR = 2 in the OTel status enum.
    expect(span?.status.code).toBe(2);
    expect(span?.events.map((e) => e.name)).toContain("exception");
  });

  it("ends the span even when the work throws", async () => {
    // An unended span is invisible in every backend and takes its children with
    // it, so the `finally` matters more than the status does.
    await expect(withSpan("failing", {}, () => Promise.reject(new Error("x")))).rejects.toThrow();
    expect(exporter.getFinishedSpans()[0]?.ended).toBe(true);
  });

  it("handles a thrown non-Error without losing the span", async () => {
    // A non-Error rejection is exactly the case the helper must not choke on.
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- justified: rejecting with a non-Error is the behaviour under test
    await expect(withSpan("weird", {}, () => Promise.reject("a string"))).rejects.toBe("a string");
    expect(exporter.getFinishedSpans()[0]?.status.code).toBe(2);
  });

  it("nests: inner spans descend from the outer one", async () => {
    await withSpan("outer", {}, async () => {
      await withSpan("inner", {}, () => Promise.resolve());
    });

    const spans = exporter.getFinishedSpans();
    const outer = spans.find((s) => s.name === "outer");
    const inner = spans.find((s) => s.name === "inner");

    expect(inner?.parentSpanContext?.spanId).toBe(outer?.spanContext().spanId);
    expect(inner?.spanContext().traceId).toBe(outer?.spanContext().traceId);
  });
});

describe("withServerSpan", () => {
  it("starts a root span when there is no incoming trace", async () => {
    await withServerSpan({ method: "GET", url: "/runs", headers: {} }, () => Promise.resolve());

    const [span] = exporter.getFinishedSpans();
    expect(span?.name).toBe("GET /runs");
    expect(span?.attributes["http.request.method"]).toBe("GET");
    expect(span?.attributes["url.path"]).toBe("/runs");
  });

  it("continues the CALLER's trace from a traceparent header", async () => {
    // Without this, every service starts its own trace and a distributed trace
    // is not distributed.
    const traceId = "4bf92f3577b34da6a3ce929d0e0e4736";
    await withServerSpan(
      {
        method: "POST",
        url: "/runs",
        headers: { traceparent: `00-${traceId}-00f067aa0ba902b7-01` },
      },
      () => Promise.resolve(),
    );

    expect(exporter.getFinishedSpans()[0]?.spanContext().traceId).toBe(traceId);
  });

  it("falls back to GET and / when the request says neither", async () => {
    await withServerSpan({ headers: {} }, () => Promise.resolve());
    expect(exporter.getFinishedSpans()[0]?.name).toBe("GET /");
  });

  it("marks the span an error and rethrows when the handler throws", async () => {
    await expect(
      withServerSpan({ method: "GET", url: "/boom", headers: {} }, () =>
        Promise.reject(new Error("handler failed")),
      ),
    ).rejects.toThrow("handler failed");

    expect(exporter.getFinishedSpans()[0]?.status.code).toBe(2);
  });
});

describe("withDatabaseSpan", () => {
  it("uses the conventional attribute names so existing dashboards work", async () => {
    await withDatabaseSpan("SELECT 1", () => Promise.resolve());

    const [span] = exporter.getFinishedSpans();
    expect(span?.name).toBe("postgres.query");
    expect(span?.attributes["db.system"]).toBe("postgresql");
    expect(span?.attributes["db.statement"]).toBe("SELECT 1");
  });

  it("descends from the active span rather than starting a new trace", async () => {
    await withSpan("service.doThing", {}, async () => {
      await withDatabaseSpan("SELECT 2", () => Promise.resolve());
    });

    const spans = exporter.getFinishedSpans();
    const db = spans.find((s) => s.name === "postgres.query");
    const service = spans.find((s) => s.name === "service.doThing");
    expect(db?.spanContext().traceId).toBe(service?.spanContext().traceId);
  });
});

describe("context is restored after a span", () => {
  it("does not leave the span active once it ends", async () => {
    await withSpan("scoped", {}, () => {
      expect(trace.getSpan(context.active())).toBeDefined();
      return Promise.resolve();
    });
    expect(trace.getSpan(context.active())).toBeUndefined();
  });
});

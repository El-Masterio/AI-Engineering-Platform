import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { createLogger } from "./logger.js";
import { newCorrelationId, withCorrelation } from "./correlation.js";
import { REDACTED } from "./redaction.js";

/** Collect emitted lines as parsed JSON. */
function capture(): { stream: Writable; lines: () => Record<string, unknown>[] } {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(String(chunk));
      callback();
    },
  });
  return {
    stream,
    lines: () =>
      chunks
        .join("")
        .split("\n")
        .filter((line) => line.trim().length > 0)
        .map((line) => JSON.parse(line) as Record<string, unknown>),
  };
}

describe("structured output", () => {
  it("emits JSON with a word level, ISO time and the service name", () => {
    const { stream, lines } = capture();
    createLogger({ service: "api", destination: stream }).info({ milestone: "M006" }, "started");

    const [line] = lines();
    expect(line?.["level"]).toBe("info");
    expect(line?.["service"]).toBe("api");
    expect(line?.["msg"]).toBe("started");
    expect(line?.["milestone"]).toBe("M006");
    expect(String(line?.["time"])).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe("correlation", () => {
  /** M006 acceptance: "logs carry a correlation ID". */
  it("attaches the ambient correlation id without the caller passing it", () => {
    const { stream, lines } = capture();
    const logger = createLogger({ service: "api", destination: stream });
    const correlationId = newCorrelationId();

    withCorrelation({ correlationId, requestId: "client-abc" }, () => {
      logger.info("handling request");
    });

    const [line] = lines();
    expect(line?.["correlationId"]).toBe(correlationId);
    expect(line?.["requestId"]).toBe("client-abc");
  });

  it("survives an await boundary", async () => {
    // AsyncLocalStorage is the whole reason this works. Without it the id would
    // be lost the moment a handler did any I/O.
    const { stream, lines } = capture();
    const logger = createLogger({ service: "api", destination: stream });
    const correlationId = newCorrelationId();

    await withCorrelation({ correlationId }, async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      logger.info("after await");
    });

    expect(lines()[0]?.["correlationId"]).toBe(correlationId);
  });

  it("omits the field entirely outside a correlation scope", () => {
    const { stream, lines } = capture();
    createLogger({ service: "api", destination: stream }).info("no context");
    expect(lines()[0]).not.toHaveProperty("correlationId");
  });
});

describe("redaction is not optional", () => {
  /**
   * The realistic leak is not someone logging a field called `password` — it is
   * a message string built by interpolation. Both paths are covered, because
   * pino's formatter never sees the message argument.
   */
  it("redacts a secret in the MESSAGE", () => {
    const { stream, lines } = capture();
    createLogger({ service: "api", destination: stream }).error(
      "failed to reach postgresql://atelier:hunter2@db:5432/app",
    );

    const serialized = JSON.stringify(lines()[0]);
    expect(serialized).not.toContain("hunter2");
    expect(serialized).toContain(REDACTED);
  });

  it("redacts a secret in a FIELD", () => {
    const { stream, lines } = capture();
    createLogger({ service: "api", destination: stream }).info(
      { config: { apiKey: "sk-ant-api03-REALKEY0123456789" } },
      "loaded",
    );

    expect(JSON.stringify(lines()[0])).not.toContain("REALKEY");
  });

  it("redacts a secret-shaped value under an innocuous key", () => {
    const { stream, lines } = capture();
    createLogger({ service: "api", destination: stream }).warn(
      { note: "token is ghp_0123456789abcdefghijklmnopqrstuvwx" },
      "check",
    );

    expect(JSON.stringify(lines()[0])).not.toContain("ghp_0123456789");
  });
});

describe("levels", () => {
  it("suppresses output below the configured level", () => {
    const { stream, lines } = capture();
    const logger = createLogger({ service: "api", level: "warn", destination: stream });
    logger.debug("invisible");
    logger.info("also invisible");
    logger.warn("visible");

    expect(lines()).toHaveLength(1);
    expect(lines()[0]?.["msg"]).toBe("visible");
  });
});

import { describe, expect, it } from "vitest";
import {
  currentCorrelation,
  newCorrelationId,
  sanitizeRequestId,
  withCorrelation,
} from "./correlation.js";

describe("request id sanitisation", () => {
  /**
   * A caller-supplied id reaches every log line for the request. An unvalidated
   * one is log injection: a newline turns one entry into two, and the second
   * says whatever the caller wants it to.
   */
  it.each([
    ["line\nbreak", "newline"],
    ["carriage\rreturn", "carriage return"],
    ["spaces here", "spaces"],
    ['quote"inject', "quote"],
    ["{json:true}", "json braces"],
    ["", "empty"],
    ["x".repeat(129), "too long"],
  ])("rejects %j (%s)", (value) => {
    expect(sanitizeRequestId(value)).toBeUndefined();
  });

  it.each(["abc-123", "019fa69a-3f85-76b4-ad2a-431298f548ab", "trace.span:01", "A_b-9"])(
    "accepts %s",
    (value) => {
      expect(sanitizeRequestId(value)).toBe(value);
    },
  );

  it("rejects a non-string", () => {
    expect(sanitizeRequestId(undefined)).toBeUndefined();
    expect(sanitizeRequestId(42)).toBeUndefined();
    expect(sanitizeRequestId({ toString: () => "abc" })).toBeUndefined();
  });

  it("trims surrounding whitespace rather than rejecting it", () => {
    expect(sanitizeRequestId("  abc-123  ")).toBe("abc-123");
  });
});

describe("correlation scope", () => {
  it("is absent outside a scope", () => {
    expect(currentCorrelation()).toBeUndefined();
  });

  it("does not leak out of its scope", () => {
    withCorrelation({ correlationId: newCorrelationId() }, () => {
      expect(currentCorrelation()).toBeDefined();
    });
    expect(currentCorrelation()).toBeUndefined();
  });

  it("nests without the inner scope corrupting the outer", () => {
    const outer = newCorrelationId();
    const inner = newCorrelationId();

    withCorrelation({ correlationId: outer }, () => {
      withCorrelation({ correlationId: inner }, () => {
        expect(currentCorrelation()?.correlationId).toBe(inner);
      });
      expect(currentCorrelation()?.correlationId).toBe(outer);
    });
  });

  it("keeps concurrent scopes separate", async () => {
    const a = newCorrelationId();
    const b = newCorrelationId();
    const seen: string[] = [];

    await Promise.all([
      withCorrelation({ correlationId: a }, async () => {
        await new Promise((r) => setTimeout(r, 20));
        seen.push(currentCorrelation()?.correlationId ?? "lost");
      }),
      withCorrelation({ correlationId: b }, async () => {
        await new Promise((r) => setTimeout(r, 5));
        seen.push(currentCorrelation()?.correlationId ?? "lost");
      }),
    ]);

    // b finishes first; each kept its own id despite interleaving.
    expect(seen).toEqual([b, a]);
  });
});

import { describe, expect, it } from "vitest";
import { fallbackConfig, isComplete, readContent } from "./refusal.js";
import { resolveModel } from "./resolve.js";

/**
 * ADR-004 control 5: `stop_reason` is checked before content access.
 *
 * The case that makes this necessary is not an error path — a refusal is a
 * **successful HTTP 200** with an empty or partial content array. Code that
 * reaches straight for `content[0]` does not get an exception it can catch; it
 * gets nothing, or a fragment that looks like a short answer.
 */

describe("a refusal is recognised before content is read", () => {
  it("reports a refusal that produced no output", () => {
    const outcome = readContent({
      stopReason: "refusal",
      stopDetails: { category: "cyber", explanation: "declined" },
      content: [],
    });

    expect(outcome.kind).toBe("refused");
    if (outcome.kind !== "refused") return;
    expect(outcome.category).toBe("cyber");
    expect(outcome.explanation).toBe("declined");
    expect(outcome.hadPartialOutput).toBe(false);
  });

  it("flags a refusal that arrived after partial output", () => {
    // The partial is billed and must be DISCARDED. Treating it as complete is the
    // dangerous reading — the caller gets a truncated result that looks finished.
    const outcome = readContent({
      stopReason: "refusal",
      stopDetails: null,
      content: [{ type: "text", text: "Here is the first half" }],
    });

    expect(outcome.kind).toBe("refused");
    if (outcome.kind !== "refused") return;
    expect(outcome.hadPartialOutput).toBe(true);
  });

  it("handles a refusal with no details at all", () => {
    // `stop_details` is populated only on a refusal and is nullable even then, so
    // branching on it instead of on `stop_reason` misclassifies this response as
    // a success.
    const outcome = readContent({ stopReason: "refusal", content: [] });

    expect(outcome.kind).toBe("refused");
    if (outcome.kind !== "refused") return;
    expect(outcome.category).toBeUndefined();
    expect(outcome.explanation).toBeUndefined();
  });

  it("surfaces a recommended model when the configured fallback could not run", () => {
    // Present when the fallback was rate-limited or overloaded — not when it also
    // refused. A hint for a direct retry, not a guarantee.
    const outcome = readContent({
      stopReason: "refusal",
      stopDetails: { category: "cyber", recommendedModel: "some-other-model" },
      content: [],
    });

    expect(outcome.kind).toBe("refused");
    if (outcome.kind !== "refused") return;
    expect(outcome.recommendedModel).toBe("some-other-model");
  });

  it("returns content on an ordinary completion", () => {
    const outcome = readContent<{ type: string }>({
      stopReason: "end_turn",
      content: [{ type: "text" }],
    });

    expect(outcome.kind).toBe("ok");
    if (outcome.kind !== "ok") return;
    expect(outcome.content).toHaveLength(1);
  });

  it("treats a missing stop reason as a completion rather than guessing", () => {
    const outcome = readContent({ content: [{ type: "text" }] });
    expect(outcome.kind).toBe("ok");
  });

  it("does not mistake a non-refusal stop reason for a refusal", () => {
    // `max_tokens` is incomplete but it is not a refusal — the content is real,
    // just truncated. Collapsing the two would discard usable output.
    const outcome = readContent({ stopReason: "max_tokens", content: [{ type: "text" }] });

    expect(outcome.kind).toBe("ok");
    expect(isComplete({ stopReason: "max_tokens" })).toBe(false);
  });
});

describe("incomplete stop reasons", () => {
  it("groups the three that must not be read as end_turn", () => {
    for (const reason of ["refusal", "max_tokens", "model_context_window_exceeded"]) {
      expect(isComplete({ stopReason: reason }), reason).toBe(false);
    }
    expect(isComplete({ stopReason: "end_turn" })).toBe(true);
    expect(isComplete({ stopReason: "tool_use" })).toBe(true);
  });
});

describe("fallback configuration", () => {
  it("asks for the provider's recommended fallback rather than pinning a model", () => {
    // The right substitute depends on WHY the request was declined, since
    // different models carry different classifiers — and a pinned model is a
    // migration to do when that model is retired.
    expect(fallbackConfig(true)).toEqual({ fallbacks: "default" });
    expect(fallbackConfig(false)).toBeNull();
  });

  it("is configured for the reasoning tier, which is where refusals land", () => {
    // Reasoning-tier work here is security review and architecture — the benign
    // security-adjacent category most likely to trip a classifier.
    expect(
      fallbackConfig(resolveModel("reasoning", "high").requiresRefusalFallback),
    ).not.toBeNull();
  });
});

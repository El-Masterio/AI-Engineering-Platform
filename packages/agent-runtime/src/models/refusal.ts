/**
 * Refusal handling (ADR-004 control 5, M034).
 *
 * ADR-004: "Refusal fallback configured on every reasoning-tier call. Safety
 * classifiers can decline benign security-adjacent work; `stop_reason` is checked
 * before reading content."
 *
 * That second sentence is the whole module. A refusal arrives as a **successful
 * HTTP 200** — not an error — with an empty or partial content array, so
 * `response.content[0].text` on the happy path is not a style problem: it throws
 * or returns nothing on a refusal, and the caller reports a mysterious failure
 * instead of "the classifier declined this". Reasoning-tier work on this platform
 * is security review and architecture, which is precisely the benign
 * security-adjacent category most likely to trip a classifier.
 *
 * Deliberately provider-agnostic in shape: it accepts the minimum structure a
 * response must have and returns our own union, so an adapter for a second
 * provider (ADR-015) maps into the same result rather than teaching the
 * orchestrator a second failure vocabulary.
 */

/**
 * The subset of a provider response this module reads.
 *
 * Narrow on purpose — anything wider would make this a provider type, and the
 * port's purity test exists to stop those spreading.
 */
export type RefusalCandidate = {
  readonly stopReason?: string | null;
  /**
   * Populated **only** on a refusal, and nullable even then.
   *
   * Which is why every check below branches on `stopReason` and treats this as
   * decoration. Branching on the details object instead would misclassify a
   * refusal that arrived without one.
   */
  readonly stopDetails?: {
    readonly category?: string | null;
    readonly explanation?: string | null;
    readonly recommendedModel?: string | null;
  } | null;
  readonly content?: readonly unknown[] | null;
};

export type RefusalOutcome<T> =
  | { readonly kind: "ok"; readonly content: readonly T[] }
  | {
      readonly kind: "refused";
      /** `"cyber"`, `"bio"`, … or undefined — a refusal may carry no category. */
      readonly category?: string;
      readonly explanation?: string;
      /**
       * A model the provider suggests retrying directly.
       *
       * Present when a configured fallback could not run — rate-limited or
       * overloaded — rather than when the fallback also refused. A hint, not a
       * guarantee.
       */
      readonly recommendedModel?: string;
      /**
       * True when output had already been produced before the classifier fired.
       *
       * The partial is billed and must be **discarded**, not treated as a short
       * answer. Reporting it as complete is the dangerous reading: the caller
       * gets a truncated result that looks finished.
       */
      readonly hadPartialOutput: boolean;
    };

/**
 * Check `stop_reason` before touching content.
 *
 * The signature enforces the ordering that ADR-004 asks for: there is no way to
 * get the content out of this function without having gone through the refusal
 * branch first.
 */
export function readContent<T>(response: RefusalCandidate): RefusalOutcome<T> {
  if (response.stopReason === "refusal") {
    const details = response.stopDetails ?? undefined;
    return {
      kind: "refused",
      ...(details?.category != null && { category: details.category }),
      ...(details?.explanation != null && { explanation: details.explanation }),
      ...(details?.recommendedModel != null && { recommendedModel: details.recommendedModel }),
      hadPartialOutput: (response.content ?? []).length > 0,
    };
  }

  return { kind: "ok", content: (response.content ?? []) as readonly T[] };
}

/**
 * Is this stop reason one the caller must handle before reading content?
 *
 * `refusal` and `max_tokens` both mean "what you have is not the whole answer",
 * and `model_context_window_exceeded` means the input did not fit. Grouped
 * because the mistake they share is being read as `end_turn`.
 */
export const INCOMPLETE_STOP_REASONS: ReadonlySet<string> = new Set([
  "refusal",
  "max_tokens",
  "model_context_window_exceeded",
]);

export function isComplete(response: RefusalCandidate): boolean {
  const reason = response.stopReason;
  return reason == null || !INCOMPLETE_STOP_REASONS.has(reason);
}

/**
 * The fallback configuration for a resolved tier.
 *
 * `"default"` rather than a named model: the right substitute depends on *why*
 * the request was declined, since different models carry different classifiers —
 * and naming one creates a migration to do when that model is retired. ADR-004
 * control 5 wants the fallback configured, not a specific model pinned.
 */
export function fallbackConfig(
  requiresFallback: boolean,
): { readonly fallbacks: "default" } | null {
  return requiresFallback ? { fallbacks: "default" } : null;
}

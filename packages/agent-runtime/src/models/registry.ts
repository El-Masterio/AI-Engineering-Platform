import type { EffortLevel, ModelTier } from "../spec.js";

/**
 * The tier → model mapping table (ADR-004, M034).
 *
 * **This file is the only place in the codebase where a model identifier may
 * appear.** That is ADR-004's decision verbatim — "No model ID appears anywhere
 * else in the codebase — enforced by lint" — and `eslint.config.js` enforces it
 * with a `Literal[value=/^claude-/]` rule that exempts this file and nothing
 * else. A model launch is then a diff to one table plus an eval run, rather than
 * a repository-wide edit with no single place to test the migration.
 *
 * Two design consequences worth stating, because both are load-bearing:
 *
 * **1. Keyed by provider, not flat.** ADR-004 wrote "a single mapping table"
 * when Anthropic was the only provider. The owner has since decided to keep the
 * managed runtime *and* add a second provider behind the same port
 * ([ADR-015](../../../../docs/decisions/ADR-015-provider-keyed-tier-registry.md)),
 * so the table is keyed by provider from the start. Retrofitting that later
 * would mean touching every call site — which is exactly the repository-wide
 * edit ADR-004 exists to prevent.
 *
 * **2. An entry describes a whole request, not just a model name.** If
 * resolution returned `{ model, effort }`, every caller would still need to know
 * that the utility tier's model REJECTS `effort` outright, that one model cannot
 * disable thinking above `high` effort, and that sampling parameters are gone
 * from all four. That knowledge is model-specific, so keeping it out of the
 * table would leak exactly what the table exists to contain.
 */

/** Which provider's models a registry describes. */
export const MODEL_PROVIDERS = ["anthropic"] as const;
export type ModelProvider = (typeof MODEL_PROVIDERS)[number];

/**
 * How a model expects the thinking parameter to be sent.
 *
 * Not a preference — each value is a 400 if sent to the wrong model.
 */
export type ThinkingMode =
  /** Send `{ type: "adaptive" }`. Disabling is permitted, subject to `disableThinkingMaxEffort`. */
  | "adaptive"
  /** Thinking is always on; sending ANY explicit thinking config is rejected. */
  | "always-on";

/**
 * Prices in **integer hundredths of a cent per million tokens**.
 *
 * Integers because §15 and the cost package both forbid floating point for
 * money: `0.1 + 0.2 !== 0.3`, and a per-token rate multiplied by millions of
 * tokens is precisely where that error compounds into a wrong invoice.
 * $5.00/MTok is 50_000.
 */
export type TokenPricing = {
  readonly inputPerMTok: number;
  readonly outputPerMTok: number;
  /**
   * A promotional rate and the date it ends.
   *
   * Present because the implementation tier currently has one. A test asserts
   * the window has not silently expired — a stale introductory price is a COGS
   * model that quietly understates cost, which is the failure mode
   * ASSUMPTION-010 was opened to watch for.
   */
  readonly introductory?: {
    readonly inputPerMTok: number;
    readonly outputPerMTok: number;
    /** ISO date. After this, `introductory` must be removed from the entry. */
    readonly until: string;
  };
};

export type ModelTierEntry = {
  /** The provider's identifier for the model. Never leaves this file as a literal. */
  readonly model: string;
  /**
   * Effort levels the model accepts.
   *
   * **Empty means the parameter is rejected**, not that any value works. ADR-004
   * writes "n/a" for the utility tier and that is literal: sending `effort` to
   * that model is an error, so the resolver omits it rather than passing a
   * default through.
   */
  readonly supportedEfforts: readonly EffortLevel[];
  /**
   * ADR-004's recommended range for this tier, as the ADR's table writes it.
   *
   * Advisory, not enforced — ADR-004 control 6 says effort is "swept per task
   * class against the eval corpus", so a spec may legitimately name a level
   * outside this range. Recorded so `adr-004-alignment.test.ts` can pin it.
   */
  readonly recommendedEfforts: readonly EffortLevel[];
  readonly thinking: ThinkingMode;
  /**
   * Highest effort at which thinking may be explicitly disabled, if at all.
   *
   * `null` means never. This exists because one model accepts a disabled-thinking
   * request at `high` or below and returns 400 for the same request at `xhigh` —
   * validated per request, so a later call that raises effort fails even though
   * earlier ones in the same conversation succeeded.
   */
  readonly disableThinkingMaxEffort: EffortLevel | null;
  readonly maxOutputTokens: number;
  readonly contextWindow: number;
  /**
   * Minimum prefix length that will cache, in tokens.
   *
   * Varies per model and is **not monotonic across generations**. Below it,
   * caching silently does nothing — no error, just a cache-read count of zero.
   * M035 needs this per tier; recording it here keeps the surprise in one place.
   */
  readonly cacheMinimumTokens: number;
  /** `temperature` / `top_p` / `top_k`. False on every current tier — a 400 if sent. */
  readonly acceptsSamplingParameters: boolean;
  /**
   * Whether a refusal on this tier should be retried on another model.
   *
   * ADR-004 control 5 requires a refusal fallback on every reasoning-tier call.
   * The frontier tier carries the same classifiers and gets the same treatment.
   */
  readonly requiresRefusalFallback: boolean;
  readonly pricing: TokenPricing;
};

/**
 * ADR-004's four tiers, for the Anthropic provider.
 *
 * Prices re-verified 2026-07-30 against the `claude-api` capability pack (cached
 * 2026-06-24), which CLAUDE.md makes authoritative over recalled API details.
 * All four match ADR-004 as authored, which resolves ASSUMPTION-010. This is a
 * documentary check, not a live one: no credentials are available in this
 * environment, so it confirms the ADR agrees with our authoritative reference
 * rather than with the billing system.
 */
const ANTHROPIC_TIERS: Readonly<Record<ModelTier, ModelTierEntry>> = Object.freeze({
  reasoning: {
    model: "claude-opus-5",
    supportedEfforts: ["low", "medium", "high", "xhigh", "max"],
    recommendedEfforts: ["high", "xhigh"],
    thinking: "adaptive",
    // Accepted at `high` or below; 400 at `xhigh`/`max`.
    disableThinkingMaxEffort: "high",
    maxOutputTokens: 128_000,
    contextWindow: 1_000_000,
    cacheMinimumTokens: 512,
    acceptsSamplingParameters: false,
    requiresRefusalFallback: true,
    pricing: { inputPerMTok: 50_000, outputPerMTok: 250_000 },
  },
  implementation: {
    model: "claude-sonnet-5",
    supportedEfforts: ["low", "medium", "high", "xhigh", "max"],
    recommendedEfforts: ["high"],
    thinking: "adaptive",
    disableThinkingMaxEffort: "max",
    maxOutputTokens: 128_000,
    contextWindow: 1_000_000,
    cacheMinimumTokens: 1024,
    acceptsSamplingParameters: false,
    requiresRefusalFallback: false,
    pricing: {
      inputPerMTok: 30_000,
      outputPerMTok: 150_000,
      introductory: { inputPerMTok: 20_000, outputPerMTok: 100_000, until: "2026-08-31" },
    },
  },
  utility: {
    model: "claude-haiku-4-5",
    // Empty on purpose: this model REJECTS the effort parameter. ADR-004's "n/a"
    // is not "unspecified" — it is "do not send it".
    supportedEfforts: [],
    recommendedEfforts: [],
    thinking: "adaptive",
    disableThinkingMaxEffort: "max",
    // The only tier that is not 128K/1M. A ceiling copied from another tier
    // would truncate silently.
    maxOutputTokens: 64_000,
    contextWindow: 200_000,
    cacheMinimumTokens: 4096,
    acceptsSamplingParameters: false,
    requiresRefusalFallback: false,
    pricing: { inputPerMTok: 10_000, outputPerMTok: 50_000 },
  },
  frontier: {
    model: "claude-fable-5",
    supportedEfforts: ["low", "medium", "high", "xhigh", "max"],
    recommendedEfforts: ["xhigh", "max"],
    // Thinking cannot be configured at all — an explicit disable is a 400 at any
    // effort, so the parameter is omitted entirely rather than sent as adaptive.
    thinking: "always-on",
    disableThinkingMaxEffort: null,
    maxOutputTokens: 128_000,
    contextWindow: 1_000_000,
    cacheMinimumTokens: 512,
    acceptsSamplingParameters: false,
    requiresRefusalFallback: true,
    pricing: { inputPerMTok: 100_000, outputPerMTok: 500_000 },
  },
});

const REGISTRIES: Readonly<Record<ModelProvider, Readonly<Record<ModelTier, ModelTierEntry>>>> =
  Object.freeze({ anthropic: ANTHROPIC_TIERS });

/**
 * The beta flag that enables server-side refusal fallback.
 *
 * Here rather than in the resolver because it is provider-specific wire detail,
 * and because the `"default"` fallback mode requires this exact flag — the
 * array form of the parameter uses a different, earlier one, and pairing either
 * with the other form is rejected.
 */
export const REFUSAL_FALLBACK_BETA = "server-side-fallback-2026-07-01";

export function tierRegistry(
  provider: ModelProvider = "anthropic",
): Readonly<Record<ModelTier, ModelTierEntry>> {
  return REGISTRIES[provider];
}

export function tierEntry(tier: ModelTier, provider: ModelProvider = "anthropic"): ModelTierEntry {
  return REGISTRIES[provider][tier];
}

import type { AgentSpec, EffortLevel, ModelTier } from "../spec.js";
import {
  REFUSAL_FALLBACK_BETA,
  tierEntry,
  type ModelProvider,
  type ModelTierEntry,
} from "./registry.js";

/**
 * Tier → request parameters (ADR-004, M034).
 *
 * The port carries `{ tier, effort }` and never a model id (ADR-012); this is
 * where that intent becomes a concrete request, inside an adapter. Callers get a
 * complete, valid shape — not a model name plus a set of rules they have to
 * remember — because every rule below is a 400 if applied to the wrong tier.
 */

/**
 * What an adapter needs to build a request for a tier.
 *
 * `effort` and `thinking` are `null`/`"omit"` rather than defaulted, and the
 * distinction matters: on one tier the effort parameter is *rejected*, so
 * "absent" and "some default value" are not the same request.
 */
export type ResolvedModel = {
  readonly provider: ModelProvider;
  readonly tier: ModelTier;
  readonly model: string;
  /** `null` means do not send the parameter at all. */
  readonly effort: EffortLevel | null;
  /** `"omit"` means send no thinking configuration — an explicit one is rejected. */
  readonly thinking: "adaptive" | "omit";
  readonly maxOutputTokens: number;
  readonly contextWindow: number;
  readonly cacheMinimumTokens: number;
  /** Beta flags this request requires. Empty unless a fallback is configured. */
  readonly betas: readonly string[];
  /** Whether to ask the provider to retry a refusal on another model. */
  readonly requiresRefusalFallback: boolean;
  /**
   * Set when the spec asked for an effort this tier cannot express.
   *
   * Reported rather than swallowed. ADR-004 writes "n/a" for the utility tier, so
   * ignoring a requested effort there is correct behaviour — but a silent drop
   * would leave an operator wondering why their `max`-effort utility agent reads
   * like a cheap one.
   */
  readonly droppedEffort?: EffortLevel;
};

/**
 * A tier cannot express the requested effort.
 *
 * Loud, because the alternative is a run that quietly used a different effort
 * than its specification records — and §13 rule 6 requires a run to be
 * explainable from what was recorded.
 */
export class UnsupportedEffortError extends Error {
  constructor(tier: ModelTier, effort: EffortLevel, supported: readonly EffortLevel[]) {
    super(
      supported.length === 0
        ? `the ${tier} tier does not accept an effort level at all (ADR-004 records it as n/a)`
        : `the ${tier} tier does not support effort "${effort}" — supported: ${supported.join(", ")}`,
    );
    this.name = "UnsupportedEffortError";
  }
}

/** Ordered weakest to strongest, for comparing against a ceiling. */
const EFFORT_ORDER: readonly EffortLevel[] = ["low", "medium", "high", "xhigh", "max"];

function isAtMost(effort: EffortLevel, ceiling: EffortLevel): boolean {
  return EFFORT_ORDER.indexOf(effort) <= EFFORT_ORDER.indexOf(ceiling);
}

/**
 * Resolve a tier and requested effort into request parameters.
 *
 * A tier whose model rejects the effort parameter drops it and says so. Any
 * other mismatch throws — clamping would silently substitute a level the spec
 * did not ask for.
 */
export function resolveModel(
  tier: ModelTier,
  effort: EffortLevel,
  provider: ModelProvider = "anthropic",
): ResolvedModel {
  const entry = tierEntry(tier, provider);

  if (entry.supportedEfforts.length === 0) {
    return {
      ...base(entry, tier, provider),
      effort: null,
      droppedEffort: effort,
    };
  }

  if (!entry.supportedEfforts.includes(effort)) {
    throw new UnsupportedEffortError(tier, effort, entry.supportedEfforts);
  }

  return { ...base(entry, tier, provider), effort };
}

function base(
  entry: ModelTierEntry,
  tier: ModelTier,
  provider: ModelProvider,
): Omit<ResolvedModel, "effort"> {
  return {
    provider,
    tier,
    model: entry.model,
    thinking: entry.thinking === "always-on" ? "omit" : "adaptive",
    maxOutputTokens: entry.maxOutputTokens,
    contextWindow: entry.contextWindow,
    cacheMinimumTokens: entry.cacheMinimumTokens,
    betas: entry.requiresRefusalFallback ? [REFUSAL_FALLBACK_BETA] : [],
    requiresRefusalFallback: entry.requiresRefusalFallback,
  };
}

/** Resolve straight from an agent specification (§13). */
export function resolveForSpec(
  spec: AgentSpec,
  provider: ModelProvider = "anthropic",
): ResolvedModel {
  return resolveModel(spec.model.tier, spec.model.effort, provider);
}

/**
 * May thinking be explicitly disabled at this resolved effort?
 *
 * Asked rather than assumed, because the answer is per-model AND per-request:
 * one tier accepts a disabled-thinking request at `high` and rejects the same
 * request at `xhigh`, validated on every call. An adapter that checked once at
 * session start would be right until the first time it raised effort.
 */
export function canDisableThinking(resolved: ResolvedModel): boolean {
  const entry = tierEntry(resolved.tier, resolved.provider);
  if (entry.disableThinkingMaxEffort === null) return false;
  // No effort parameter means nothing to compare against a ceiling; the tier
  // permits disabling at whatever level it runs.
  if (resolved.effort === null) return true;
  return isAtMost(resolved.effort, entry.disableThinkingMaxEffort);
}

/**
 * Cost of a run, in integer hundredths of a cent.
 *
 * Integer arithmetic throughout — the input rate is per million tokens, so a
 * float multiply is where rounding error turns into a wrong invoice. Division is
 * last and truncates, which under-bills by less than a hundredth of a cent
 * rather than over-billing.
 */
export function priceTokens(
  tier: ModelTier,
  usage: { readonly inputTokens: number; readonly outputTokens: number },
  options: { readonly provider?: ModelProvider; readonly on?: Date } = {},
): number {
  const entry = tierEntry(tier, options.provider ?? "anthropic");
  const introductory = entry.pricing.introductory;
  const active =
    introductory !== undefined && (options.on ?? new Date()) <= new Date(introductory.until)
      ? introductory
      : entry.pricing;

  return (
    Math.trunc((usage.inputTokens * active.inputPerMTok) / 1_000_000) +
    Math.trunc((usage.outputTokens * active.outputPerMTok) / 1_000_000)
  );
}

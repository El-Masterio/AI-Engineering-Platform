/**
 * The AgentRuntime port and its adapters (ADR-002, ADR-012).
 *
 * This package is the seam ADR-002 is reversible through. Nothing here mentions
 * a provider, and a test asserts that stays true.
 */
export type {
  AgentRuntime,
  RunContext,
  RunHandle,
  RuntimeCapabilities,
  StreamOptions,
  ToolVeto,
} from "./port.js";

export {
  MODEL_TIERS,
  EFFORT_LEVELS,
  isExecutableAllowed,
  isToolGranted,
  toAgentRef,
  type AgentBudget,
  type AgentPermissions,
  type AgentRef,
  type AgentSpec,
  type EffortLevel,
  type ModelTier,
  type ToolGrant,
  type ToolName,
} from "./spec.js";

export {
  isTerminal,
  type EventCursor,
  type InboundEvent,
  type RunEvent,
  type RunEventBody,
  type RunEventKind,
  type RunStatus,
  type UsageReport,
} from "./events.js";

export {
  createFakeRuntime,
  type FakeRuntime,
  type FakeRuntimeOptions,
  type ScriptedStep,
} from "./fake.js";
export { runConformanceSuite, CONFORMANCE_SPEC, type TestHarness } from "./conformance.js";

export {
  loadDefinitionFile,
  loadDefinitions,
  PLATFORM_ROLES_DIR,
  type LoadedDefinition,
} from "./definitions/loader.js";

export {
  tierEntry,
  tierRegistry,
  MODEL_PROVIDERS,
  REFUSAL_FALLBACK_BETA,
  type ModelProvider,
  type ModelTierEntry,
  type ThinkingMode,
  type TokenPricing,
} from "./models/registry.js";

export {
  canDisableThinking,
  priceTokens,
  resolveForSpec,
  resolveModel,
  UnsupportedEffortError,
  type ResolvedModel,
} from "./models/resolve.js";

export {
  fallbackConfig,
  isComplete,
  readContent,
  INCOMPLETE_STOP_REASONS,
  type RefusalCandidate,
  type RefusalOutcome,
} from "./models/refusal.js";

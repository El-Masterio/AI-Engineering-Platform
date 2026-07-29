/**
 * The agent specification (§13), in our vocabulary.
 *
 * Every type here is deliberately provider-neutral, and that is the milestone's
 * acceptance criterion rather than a stylistic preference: this file is the seam
 * ADR-002 is reversible through. A single vendor type reaching it — a model id,
 * a message shape, a tool-definition format — silently welds the orchestrator to
 * one runtime, and the exit ramp stops being an exit.
 *
 * `model` is the clearest case. §13 writes `tier: implementation`, not a model
 * name, because ADR-004 owns that mapping. An adapter resolves a tier to
 * whatever its provider calls the right model; the port never learns the answer.
 */

/** Model selection, resolved by ADR-004 inside an adapter. */
export const MODEL_TIERS = ["planning", "implementation", "review", "utility"] as const;
export type ModelTier = (typeof MODEL_TIERS)[number];

/** How hard to think. Maps to whatever the provider calls reasoning effort. */
export const EFFORT_LEVELS = ["low", "medium", "high", "adaptive"] as const;
export type EffortLevel = (typeof EFFORT_LEVELS)[number];

/**
 * A tool the agent may use.
 *
 * `bash` is constrained rather than raw (§13): a list of permitted executables,
 * never a shell. "Run any command" is not a capability we can audit, budget or
 * reason about, so it is not expressible here.
 */
export type ToolGrant =
  | { readonly name: "read" }
  | { readonly name: "write" }
  | { readonly name: "edit" }
  | { readonly name: "glob" }
  | { readonly name: "grep" }
  | { readonly name: "web_search" }
  | { readonly name: "web_fetch" }
  | { readonly name: "bash"; readonly allow: readonly string[] };

export type ToolName = ToolGrant["name"];

/**
 * What an agent is permitted to do, enforced by the orchestrator (§13).
 *
 * Not by the model's cooperation — which is why these are separate from
 * `tools`. A tool grant says "you may call `write`"; a permission says "you may
 * write production code", and the second is a policy question the orchestrator
 * answers using its own state.
 */
export type AgentPermissions = {
  readonly canWriteCode: boolean;
  /** QA Engineer's remit. False for implementers, structurally. */
  readonly canWriteTests: boolean;
  /**
   * §13's single most important structural rule: review and authorship are
   * performed by different agents, and an agent never reviews its own work.
   * False for every implementer, and not a configuration an org can relax.
   */
  readonly canReview: boolean;
  readonly canDeploy: boolean;
  readonly canMigrateSchema: boolean;
  /** Actions this agent may only take with a human approval event (§17). */
  readonly requiresApprovalFor: readonly string[];
};

export type AgentBudget = {
  readonly maxTokensPerRun: number;
  readonly maxWallClockMs: number;
  readonly maxRetries: number;
};

/**
 * The spec, as §13 defines it.
 *
 * `version` is part of the identity, not metadata. A run pins the version it
 * started with (M024), so editing a role cannot retroactively change what
 * already happened — which is the difference between an auditable system and a
 * system that merely has logs.
 */
export type AgentSpec = {
  readonly id: string;
  readonly version: number;
  readonly role: string;
  readonly model: { readonly tier: ModelTier; readonly effort: EffortLevel };
  readonly systemPrompt: string;
  /** SKILL.md documents, progressively disclosed (ADR-005). */
  readonly capabilityPacks: readonly string[];
  /** An ALLOWLIST. Absence means denied (§13). */
  readonly tools: readonly ToolGrant[];
  readonly budget: AgentBudget;
  readonly permissions: AgentPermissions;
  /** Structured output the result is validated against. */
  readonly outputContract: { readonly type: string; readonly schema: string };
};

/**
 * A defined agent, as the runtime knows it.
 *
 * Opaque on purpose. An adapter may key it by a hosted definition id, a hash,
 * or nothing at all — and a caller that reached inside would couple itself to
 * whichever adapter it happened to be talking to.
 */
declare const agentRefBrand: unique symbol;
export type AgentRef = {
  readonly [agentRefBrand]: "AgentRef";
  readonly id: string;
  readonly version: number;
};

export function toAgentRef(input: { id: string; version: number }): AgentRef {
  return Object.freeze({ id: input.id, version: input.version }) as AgentRef;
}

/** Is this tool granted by the spec? The allowlist check, in one place. */
export function isToolGranted(spec: AgentSpec, tool: string): boolean {
  return spec.tools.some((grant) => grant.name === tool);
}

/**
 * Is this bash invocation permitted?
 *
 * Checks the EXECUTABLE, not the string. `npm test && curl evil.example` starts
 * with a permitted executable and is not a permitted command, so the caller
 * must pass the resolved executable rather than the command line — and the
 * signature says so by taking one argument, not a sentence.
 */
export function isExecutableAllowed(spec: AgentSpec, executable: string): boolean {
  const bash = spec.tools.find((grant) => grant.name === "bash");
  return bash !== undefined && "allow" in bash && bash.allow.includes(executable);
}

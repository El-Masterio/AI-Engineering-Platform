import type { EventCursor, InboundEvent, RunEvent, RunStatus } from "./events.js";
import type { AgentRef, AgentSpec } from "./spec.js";

/**
 * The AgentRuntime port — the seam ADR-002 is reversible through (§12).
 *
 * Five methods, deliberately. Every one that gets added is one more thing a
 * second adapter has to reproduce, and ADR-002's exit ramp is M127 writing a
 * self-hosted adapter that passes the shared conformance suite. A wide port is
 * an exit ramp nobody can walk.
 *
 * What is NOT here is as considered as what is: no method to list runs (that is
 * our database), none to fetch usage (it arrives as an event), none to configure
 * a model (ADR-004 resolves a tier inside the adapter), and none to read a
 * sandbox filesystem (the repo is mounted, and reaching into it from outside
 * would make the sandbox boundary advisory).
 */

/** What a run needs to exist. */
export type RunContext = {
  /** Tenant. Every run belongs to exactly one (FR-ORG-2). */
  readonly organizationId: string;
  /** Ours, not the adapter's — so a run can be correlated before it starts. */
  readonly runId: string;
  /** Repository to mount, if this run touches code. */
  readonly repository?: { readonly url: string; readonly ref: string };
  /**
   * The task, as prose.
   *
   * Not a message array: that is a provider shape, and a caller that built one
   * would be coupled to whichever adapter accepted it.
   */
  readonly prompt: string;
  /**
   * Memory namespace to attach (§13's memory architecture).
   *
   * Absent means a run with no memory, which is the right default for a utility
   * agent and the wrong one for a Director.
   */
  readonly memoryNamespace?: string;
  /** Correlation id, so a run's spans join the request that started it. */
  readonly correlationId?: string;
};

export type RunHandle = {
  /** Ours, echoed back. */
  readonly runId: string;
  /** The adapter's own identifier, for its logs and support requests. */
  readonly providerRunId: string;
  readonly status: RunStatus;
};

export type StreamOptions = {
  /**
   * Resume after this cursor.
   *
   * The reason §12's Realtime Gateway can promise "a dropped connection never
   * loses events". Omitted means from the beginning of the run, NOT from now —
   * a consumer that reconnected and got only future events would silently lose
   * the window it was disconnected for, which is the exact failure replay
   * exists to prevent.
   */
  readonly after?: EventCursor;
  readonly signal?: AbortSignal;
};

/**
 * A tool call the orchestrator may refuse before it runs.
 *
 * Optional on the port, and that is a deliberate admission rather than a gap.
 * ADR-002 chose a runtime that hosts the agent loop and executes tools inside
 * its own sandbox, so a pre-execution hook may not exist to implement. §13 still
 * requires enforcement by the orchestrator rather than by the model's
 * cooperation, so the guarantee is met in two layers:
 *
 *   1. the allowlist is DECLARED in the spec, and the runtime enforces it;
 *   2. every call is STREAMED as a `tool_call` event before its result, so the
 *      orchestrator checks it independently and interrupts on a violation.
 *
 * Where an adapter can offer a veto, it implements this and the violation is
 * prevented rather than detected. Where it cannot, the violation is still
 * caught and audited. The conformance suite asserts both paths.
 */
export type ToolVeto = (call: {
  readonly runId: string;
  readonly tool: string;
  readonly arguments: Readonly<Record<string, unknown>>;
}) => Promise<{ readonly allow: boolean; readonly reason?: string }>;

export type AgentRuntime = {
  /** Register a versioned role. Idempotent for an unchanged (id, version). */
  defineAgent: (spec: AgentSpec) => Promise<AgentRef>;

  /** Provision a sandbox, mount the repo, attach memory, and start. */
  startRun: (agent: AgentRef, context: RunContext) => Promise<RunHandle>;

  /** Send something in: a message, a tool result, an approval, a denial. */
  sendEvent: (run: RunHandle, event: InboundEvent) => Promise<void>;

  /** Everything the run emits, resumable from a cursor. */
  streamEvents: (run: RunHandle, options?: StreamOptions) => AsyncIterable<RunEvent>;

  /**
   * Stop at a safe boundary.
   *
   * "Safe" means not mid-write: a run killed between reading a file and writing
   * it back leaves the repository in a state nobody chose. An adapter that
   * cannot guarantee that must say so in its conformance report rather than
   * pretend.
   */
  interrupt: (run: RunHandle) => Promise<void>;

  /** Optional pre-execution veto. See {@link ToolVeto}. */
  readonly vetoTool?: ToolVeto;

  /** For the conformance suite and for operator diagnostics. */
  readonly capabilities: RuntimeCapabilities;
};

/**
 * What an adapter can actually do.
 *
 * Declared rather than discovered, so the conformance suite can hold each
 * adapter to what it claims instead of skipping tests it guesses are
 * unsupported. An adapter that under-claims fails the tests for the features it
 * really has; one that over-claims fails the features it does not. Either way
 * the mismatch surfaces here rather than in production.
 */
export type RuntimeCapabilities = {
  readonly name: string;
  /** Can a tool call be refused BEFORE it executes? */
  readonly supportsToolVeto: boolean;
  /** Can `streamEvents` resume from a cursor? Required by §12's gateway. */
  readonly supportsReplay: boolean;
  /** Does `interrupt` stop at a safe boundary, or just stop? */
  readonly supportsSafeInterrupt: boolean;
  /** Are cached input tokens reported separately? Affects cost accuracy. */
  readonly reportsCachedTokens: boolean;
};

/**
 * Run events — everything the orchestrator learns about a run.
 *
 * A discriminated union in our own vocabulary. The temptation is to pass the
 * provider's stream through and let callers read its fields; that is how the
 * abstraction dies, because every consumer then depends on a shape we do not
 * control and cannot reproduce in a second adapter.
 */

/**
 * A position in a run's event history.
 *
 * §12 requires the Realtime Gateway to replay from history, because "an SSE
 * stream has no built-in replay". That is impossible unless the PORT can resume,
 * so the cursor is part of the interface from the first line rather than
 * something bolted on when the first dropped connection loses events.
 *
 * Monotonic within a run and opaque across runs. An adapter may use a sequence
 * number, an offset, or a provider cursor.
 */
export type EventCursor = string;

export type UsageReport = {
  readonly inputTokens: number;
  readonly outputTokens: number;
  /**
   * Tokens served from a prompt cache.
   *
   * Reported separately because they are priced differently, and the cost
   * ledger (M030) would overstate spend by a large factor on a long run if it
   * counted them as fresh input. Zero when an adapter has no cache.
   */
  readonly cachedInputTokens: number;
};

export type RunStatus =
  | "queued"
  | "running"
  /** Waiting on a human (§17 Control 7) or on a tool result from us. */
  | "awaiting_input"
  | "interrupted"
  | "completed"
  | "failed";

/**
 * An event without its envelope.
 *
 * Named separately because `Omit<RunEvent, "cursor" | "at">` does NOT distribute
 * over a union — it collapses to the common fields and loses every variant, so
 * an adapter building an event would find `kind: "status"` rejected as an
 * unknown property. Splitting the type is the fix; the alternative is a
 * distributive-omit helper that every reader has to decode.
 */
export type RunEventBody =
  | { readonly kind: "status"; readonly status: RunStatus; readonly detail?: string }
  /** Model output, streamed. Deltas, not the accumulated text. */
  | { readonly kind: "text"; readonly text: string }
  /**
   * The agent is about to use a tool, or has.
   *
   * Emitted BEFORE the result, which is what makes independent enforcement
   * possible: the orchestrator sees the call, checks it against the spec's
   * allowlist itself, and interrupts on a violation rather than trusting the
   * runtime to have got it right (§13).
   */
  | {
      readonly kind: "tool_call";
      readonly callId: string;
      readonly tool: string;
      /**
       * Arguments, already redacted by the adapter.
       *
       * §17 makes a secret-shaped string in a log a P1, and this event is
       * audited (FR-AUDIT-2). An adapter that cannot redact must not populate
       * this field.
       */
      readonly arguments: Readonly<Record<string, unknown>>;
    }
  | {
      readonly kind: "tool_result";
      readonly callId: string;
      readonly ok: boolean;
      readonly summary: string;
    }
  /** A model call finished. Feeds the cost ledger (M030). */
  | { readonly kind: "usage"; readonly usage: UsageReport; readonly modelTier: string }
  /** The run produced its output contract. */
  | { readonly kind: "result"; readonly output: unknown }
  /**
   * The run failed.
   *
   * `message` is safe to surface (§16); anything an operator needs and a caller
   * must not see belongs in the adapter's own logs.
   */
  | { readonly kind: "error"; readonly code: string; readonly message: string };

/**
 * One event.
 *
 * Every variant carries `cursor` and `at`, so a consumer can resume and order
 * without special-casing the variant it happens to be holding.
 */
export type RunEvent = { readonly cursor: EventCursor; readonly at: number } & RunEventBody;

export type RunEventKind = RunEvent["kind"];

/** Events the orchestrator sends INTO a run. */
export type InboundEvent =
  | { readonly kind: "user_message"; readonly text: string }
  | { readonly kind: "tool_result"; readonly callId: string; readonly result: unknown }
  /** A human approved a gated action (§17 Control 7). Names the action. */
  | { readonly kind: "approval"; readonly action: string; readonly approvedBy: string }
  | { readonly kind: "denial"; readonly action: string; readonly deniedBy: string };

/**
 * Is this a terminal status?
 *
 * Exported because "has this run finished" is asked in several places, and three
 * separate `=== "completed" || === "failed"` checks is how one of them forgets
 * `interrupted` and waits forever.
 */
const TERMINAL_STATUSES = new Set<RunStatus>(["completed", "failed", "interrupted"]);

export function isTerminal(status: RunStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

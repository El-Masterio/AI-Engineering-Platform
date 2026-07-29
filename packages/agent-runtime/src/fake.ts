import {
  isTerminal,
  type InboundEvent,
  type RunEvent,
  type RunEventBody,
  type RunStatus,
} from "./events.js";
import { isToolGranted, toAgentRef, type AgentRef, type AgentSpec } from "./spec.js";
import type {
  AgentRuntime,
  RunContext,
  RunHandle,
  RuntimeCapabilities,
  StreamOptions,
  ToolVeto,
} from "./port.js";

/**
 * An in-memory AgentRuntime, for tests and for the replay harness (M036).
 *
 * Not a mock. A mock returns whatever a test told it to and therefore agrees
 * with any belief the test holds; this is a real implementation of the port with
 * a scripted model. It keeps an event log, honours cursors, enforces the
 * allowlist, and refuses the things a real adapter must refuse — so a test that
 * passes against it is testing the orchestrator's behaviour rather than its own
 * expectations.
 *
 * It is also what proves the conformance suite has teeth. A suite that only ever
 * ran against the managed adapter could not distinguish "the adapter is correct"
 * from "the suite asserts nothing".
 */

/** What the fake should do when a run starts. */
export type ScriptedStep =
  | { readonly emit: "text"; readonly text: string }
  | {
      readonly emit: "tool_call";
      readonly tool: string;
      readonly arguments?: Record<string, unknown>;
    }
  | { readonly emit: "usage"; readonly inputTokens: number; readonly outputTokens: number }
  | { readonly emit: "result"; readonly output: unknown }
  | { readonly emit: "error"; readonly code: string; readonly message: string }
  /** Stop and wait for a `sendEvent`. Models an approval gate or a tool result. */
  | { readonly emit: "await_input" };

export type FakeRuntimeOptions = {
  /** Steps to play per agent id. Defaults to a single trivial result. */
  readonly script?: Readonly<Record<string, readonly ScriptedStep[]>>;
  readonly capabilities?: Partial<RuntimeCapabilities>;
  readonly vetoTool?: ToolVeto;
};

type RunState = {
  readonly handle: { runId: string; providerRunId: string; status: RunStatus };
  readonly spec: AgentSpec;
  readonly events: RunEvent[];
  readonly remaining: ScriptedStep[];
  /** Resolves when a new event lands, so the stream does not poll. */
  notify: (() => void) | undefined;
};

const DEFAULT_SCRIPT: readonly ScriptedStep[] = [
  { emit: "text", text: "Working." },
  { emit: "usage", inputTokens: 100, outputTokens: 50 },
  { emit: "result", output: { ok: true } },
];

export type FakeRuntime = AgentRuntime & {
  /** Every event a run produced. For assertions the port does not expose. */
  history: (runId: string) => readonly RunEvent[];
  /** Runs started, in order. */
  startedRuns: () => readonly string[];
};

export function createFakeRuntime(options: FakeRuntimeOptions = {}): FakeRuntime {
  const specs = new Map<string, AgentSpec>();
  const runs = new Map<string, RunState>();
  const started: string[] = [];
  let sequence = 0;

  const capabilities: RuntimeCapabilities = {
    name: "fake",
    supportsToolVeto: options.vetoTool !== undefined,
    supportsReplay: true,
    supportsSafeInterrupt: true,
    reportsCachedTokens: true,
    ...options.capabilities,
  };

  function append(state: RunState, event: RunEventBody): void {
    sequence += 1;
    // Zero-padded so cursors sort lexicographically as well as numerically —
    // a consumer comparing them as strings is the likeliest misuse, and it
    // should not silently produce the wrong order.
    const cursor = String(sequence).padStart(12, "0");
    state.events.push({ ...event, cursor, at: Date.now() });
    state.notify?.();
  }

  function setStatus(state: RunState, status: RunStatus, detail?: string): void {
    // eslint-disable-next-line no-param-reassign -- justified: `state` IS the run's mutable record; the fake keeps run state in these objects by design
    state.handle.status = status;
    append(state, { kind: "status", status, ...(detail !== undefined && { detail }) });
  }

  /**
   * Play one step.
   *
   * Split out of the loop so each branch can say "stop" by returning rather
   * than by `break`-ing out of a switch inside a while — which reads as if it
   * leaves the loop and does not.
   */
  async function applyStep(state: RunState, step: ScriptedStep): Promise<"continue" | "stop"> {
    switch (step.emit) {
      case "text": {
        append(state, { kind: "text", text: step.text });
        return "continue";
      }

      case "tool_call": {
        const callId = `call-${state.events.length}`;
        const args = step.arguments ?? {};

        // The veto runs BEFORE the call is announced, because a refused call
        // must not appear to have been attempted.
        if (options.vetoTool !== undefined) {
          const verdict = await options.vetoTool({
            runId: state.handle.runId,
            tool: step.tool,
            arguments: args,
          });
          if (!verdict.allow) {
            append(state, {
              kind: "error",
              code: "tool_vetoed",
              message: verdict.reason ?? "That tool is not permitted.",
            });
            setStatus(state, "failed");
            return "stop";
          }
        }

        append(state, { kind: "tool_call", callId, tool: step.tool, arguments: args });

        // The allowlist, enforced by the runtime as well as declared. A real
        // adapter does this inside its sandbox; the fake does it here so the
        // conformance suite can assert a disallowed tool never produces a
        // result on ANY adapter.
        if (!isToolGranted(state.spec, step.tool)) {
          append(state, {
            kind: "error",
            code: "tool_not_allowed",
            message: "That tool is not permitted.",
          });
          setStatus(state, "failed");
          return "stop";
        }

        append(state, { kind: "tool_result", callId, ok: true, summary: `${step.tool} ok` });
        return "continue";
      }

      case "usage": {
        append(state, {
          kind: "usage",
          modelTier: state.spec.model.tier,
          usage: {
            inputTokens: step.inputTokens,
            outputTokens: step.outputTokens,
            cachedInputTokens: 0,
          },
        });
        return "continue";
      }

      case "result": {
        append(state, { kind: "result", output: step.output });
        setStatus(state, "completed");
        return "stop";
      }

      case "error": {
        append(state, { kind: "error", code: step.code, message: step.message });
        setStatus(state, "failed");
        return "stop";
      }

      case "await_input": {
        setStatus(state, "awaiting_input");
        return "stop";
      }
    }
  }

  async function advance(state: RunState): Promise<void> {
    for (let step = state.remaining.shift(); step !== undefined; step = state.remaining.shift()) {
      if ((await applyStep(state, step)) === "stop") return;
    }

    if (!isTerminal(state.handle.status)) setStatus(state, "completed");
  }

  return {
    capabilities,
    ...(options.vetoTool !== undefined && { vetoTool: options.vetoTool }),

    defineAgent(spec: AgentSpec): Promise<AgentRef> {
      specs.set(`${spec.id}@${spec.version}`, spec);
      return Promise.resolve(toAgentRef({ id: spec.id, version: spec.version }));
    },

    async startRun(agent: AgentRef, context: RunContext): Promise<RunHandle> {
      const spec = specs.get(`${agent.id}@${agent.version}`);
      if (spec === undefined) {
        // A run against an undefined agent is a programming error, not a run
        // that fails — failing it would hide the mistake in a run record.
        throw new Error(`Agent ${agent.id}@${agent.version} was never defined.`);
      }

      const state: RunState = {
        handle: {
          runId: context.runId,
          providerRunId: `fake-${context.runId}`,
          status: "queued",
        },
        spec,
        events: [],
        remaining: [...(options.script?.[spec.id] ?? DEFAULT_SCRIPT)],
        notify: undefined,
      };
      runs.set(context.runId, state);
      started.push(context.runId);

      setStatus(state, "running");
      await advance(state);

      return { ...state.handle };
    },

    async sendEvent(run: RunHandle, event: InboundEvent): Promise<void> {
      const state = runs.get(run.runId);
      if (state === undefined) throw new Error(`No such run: ${run.runId}`);
      if (isTerminal(state.handle.status)) {
        // Accepting input into a finished run would let a caller believe it had
        // steered something that had already stopped.
        throw new Error(`Run ${run.runId} has already finished.`);
      }

      if (event.kind === "denial") {
        append(state, {
          kind: "error",
          code: "approval_denied",
          message: `${event.action} was not approved.`,
        });
        setStatus(state, "failed");
        return;
      }

      await advance(state);
    },

    streamEvents(run: RunHandle, streamOptions: StreamOptions = {}): AsyncIterable<RunEvent> {
      const state = runs.get(run.runId);
      if (state === undefined) throw new Error(`No such run: ${run.runId}`);

      return {
        async *[Symbol.asyncIterator]() {
          // Resume AFTER the cursor. Omitted means from the beginning of the
          // run rather than from now — a reconnecting consumer that got only
          // future events would silently lose the window it missed.
          let index =
            streamOptions.after === undefined
              ? 0
              : state.events.findIndex((event) => event.cursor === streamOptions.after) + 1;

          for (;;) {
            while (index < state.events.length) {
              const event = state.events[index];
              index += 1;
              if (event !== undefined) yield event;
            }

            if (isTerminal(state.handle.status)) return;
            if (streamOptions.signal?.aborted === true) return;

            await new Promise<void>((resolve) => {
              state.notify = resolve;
              streamOptions.signal?.addEventListener(
                "abort",
                () => {
                  resolve();
                },
                { once: true },
              );
            });
            state.notify = undefined;
          }
        },
      };
    },

    interrupt(run: RunHandle): Promise<void> {
      const state = runs.get(run.runId);
      if (state === undefined) throw new Error(`No such run: ${run.runId}`);
      // Idempotent: interrupting a finished run is a race a caller cannot
      // avoid, so it is not an error.
      if (!isTerminal(state.handle.status)) {
        state.remaining.length = 0;
        setStatus(state, "interrupted");
      }
      return Promise.resolve();
    },

    history(runId: string): readonly RunEvent[] {
      return runs.get(runId)?.events ?? [];
    },

    startedRuns(): readonly string[] {
      return started;
    },
  };
}

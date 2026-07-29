import { isTerminal, type RunEvent, type RunStatus } from "./events.js";
import type { AgentRuntime } from "./port.js";
import type { AgentSpec } from "./spec.js";

/**
 * The shared conformance suite — the deliverable that makes ADR-002 reversible.
 *
 * ADR-002 names M127's self-hosted adapter as the exit ramp, and "passes the
 * shared conformance suite" is the entire content of that promise. If the suite
 * is weak, the exit ramp is decorative: a second adapter would pass while
 * behaving differently enough to break the orchestrator, and we would find out
 * during the migration we adopted the port to make safe.
 *
 * So this file is written to be run by every adapter, including the fake, and
 * every assertion is about behaviour the orchestrator actually relies on. It is
 * exported as a factory rather than as a test file so an adapter package can
 * call it from its own suite without importing test machinery from here.
 *
 * Usage:
 *
 *   describe("managed adapter", () => {
 *     runConformanceSuite({ describe, it, expect }, () => createManagedRuntime());
 *   });
 */

/** The minimum of a test framework this suite needs. */
export type TestHarness = {
  describe: (name: string, body: () => void) => void;
  it: (name: string, body: () => Promise<void> | void) => void;
  expect: (
    actual: unknown,
    message?: string,
  ) => {
    toBe: (expected: unknown) => void;
    toEqual: (expected: unknown) => void;
    toBeDefined: () => void;
    toBeUndefined: () => void;
    toBeGreaterThan: (n: number) => void;
    toContain: (value: unknown) => void;
  };
};

/** A spec every adapter is tested against. Narrow tools on purpose. */
export const CONFORMANCE_SPEC: AgentSpec = Object.freeze<AgentSpec>({
  id: "conformance-agent",
  version: 1,
  role: "Conformance",
  model: { tier: "utility", effort: "low" },
  systemPrompt: "You exist to be tested.",
  capabilityPacks: [],
  // `read` is granted and `bash` is NOT, so the suite can assert both the
  // permitted and the refused path without editing the spec.
  tools: [{ name: "read" }],
  budget: { maxTokensPerRun: 10_000, maxWallClockMs: 60_000, maxRetries: 1 },
  permissions: {
    canWriteCode: false,
    canWriteTests: false,
    canReview: false,
    canDeploy: false,
    canMigrateSchema: false,
    requiresApprovalFor: [],
  },
  outputContract: { type: "task_result", schema: "TaskResultSchema" },
});

function drain(events: AsyncIterable<RunEvent>): Promise<RunEvent[]> {
  return Array.fromAsync(events);
}

/** The last status event, narrowed — so no assertion has to cast to `never`. */
function lastStatus(events: readonly RunEvent[]): RunStatus | undefined {
  for (let index = events.length - 1; index >= 0; index--) {
    const event = events[index];
    if (event?.kind === "status") return event.status;
  }
  return undefined;
}

const runIds = { next: 0 };
function nextRunId(): string {
  runIds.next += 1;
  return `conformance-run-${runIds.next}`;
}

export function runConformanceSuite(harness: TestHarness, createRuntime: () => AgentRuntime): void {
  const { describe, it, expect } = harness;

  describe("defineAgent", () => {
    it("returns a ref carrying the spec's identity", async () => {
      const runtime = createRuntime();
      const ref = await runtime.defineAgent(CONFORMANCE_SPEC);
      expect(ref.id).toBe(CONFORMANCE_SPEC.id);
      expect(ref.version).toBe(CONFORMANCE_SPEC.version);
    });

    it("is idempotent for an unchanged (id, version)", async () => {
      // The orchestrator defines agents on every boot. If that were not
      // idempotent, a restart would either fail or create duplicates.
      const runtime = createRuntime();
      const first = await runtime.defineAgent(CONFORMANCE_SPEC);
      const second = await runtime.defineAgent(CONFORMANCE_SPEC);
      expect(second.id).toBe(first.id);
      expect(second.version).toBe(first.version);
    });
  });

  describe("startRun", () => {
    it("echoes our run id rather than replacing it", async () => {
      // Ours is what every audit record, cost entry and log line is keyed on.
      // An adapter that returned only its own id would force a lookup table
      // between our records and theirs.
      const runtime = createRuntime();
      const ref = await runtime.defineAgent(CONFORMANCE_SPEC);
      const runId = nextRunId();

      const handle = await runtime.startRun(ref, {
        organizationId: "org-1",
        runId,
        prompt: "Do the thing.",
      });

      expect(handle.runId).toBe(runId);
      expect(handle.providerRunId).toBeDefined();
    });

    it("reaches a terminal status", async () => {
      const runtime = createRuntime();
      const ref = await runtime.defineAgent(CONFORMANCE_SPEC);
      const handle = await runtime.startRun(ref, {
        organizationId: "org-1",
        runId: nextRunId(),
        prompt: "Do the thing.",
      });

      const events = await drain(runtime.streamEvents(handle));
      const status = lastStatus(events);
      expect(status, "the run never reported a terminal status").toBeDefined();
      expect(
        status !== undefined && isTerminal(status),
        "the run ended in a non-terminal status",
      ).toBe(true);
    });
  });

  describe("streamEvents", () => {
    it("gives every event a monotonic cursor", async () => {
      // Replay depends on ordering. Cursors that repeat or go backwards make
      // "resume after X" ambiguous.
      const runtime = createRuntime();
      const ref = await runtime.defineAgent(CONFORMANCE_SPEC);
      const handle = await runtime.startRun(ref, {
        organizationId: "org-1",
        runId: nextRunId(),
        prompt: "Do the thing.",
      });

      const events = await drain(runtime.streamEvents(handle));
      expect(events.length).toBeGreaterThan(0);

      const cursors = events.map((event) => event.cursor);
      expect(new Set(cursors).size, "cursors repeated").toBe(cursors.length);
      expect(
        cursors.every((cursor, index) => index === 0 || cursor > (cursors[index - 1] as string)),
        "cursors are not monotonic as strings",
      ).toBe(true);
    });

    it("replays from the BEGINNING when no cursor is given", async () => {
      // Not from now. A reconnecting consumer that got only future events would
      // silently lose the window it was disconnected for — which is the exact
      // failure §12's gateway exists to prevent.
      const runtime = createRuntime();
      const ref = await runtime.defineAgent(CONFORMANCE_SPEC);
      const handle = await runtime.startRun(ref, {
        organizationId: "org-1",
        runId: nextRunId(),
        prompt: "Do the thing.",
      });

      const first = await drain(runtime.streamEvents(handle));
      const second = await drain(runtime.streamEvents(handle));
      expect(second.length, "a second stream replayed fewer events").toBe(first.length);
    });

    it("resumes AFTER the given cursor, exclusive", async () => {
      const runtime = createRuntime();
      if (!runtime.capabilities.supportsReplay) return;

      const ref = await runtime.defineAgent(CONFORMANCE_SPEC);
      const handle = await runtime.startRun(ref, {
        organizationId: "org-1",
        runId: nextRunId(),
        prompt: "Do the thing.",
      });

      const all = await drain(runtime.streamEvents(handle));
      const midpoint = all[Math.floor(all.length / 2)];
      expect(midpoint).toBeDefined();

      const resumed = await drain(
        runtime.streamEvents(handle, { after: (midpoint as RunEvent).cursor }),
      );

      // Exclusive: the cursor's own event must not repeat, or a consumer that
      // resumes will process it twice — and for a `usage` event that means
      // double-billing.
      expect(
        resumed.some((event) => event.cursor === (midpoint as RunEvent).cursor),
        "the cursor's own event was replayed",
      ).toBe(false);
      expect(resumed.length).toBe(all.length - all.indexOf(midpoint as RunEvent) - 1);
    });
  });

  describe("the tool allowlist is enforced, not merely declared (§13)", () => {
    it("announces a tool call BEFORE its result", async () => {
      // This ordering is what lets the orchestrator check a call against the
      // spec itself rather than trusting the runtime. Without it, independent
      // enforcement is impossible on any adapter.
      const runtime = createRuntime();
      const ref = await runtime.defineAgent(CONFORMANCE_SPEC);
      const handle = await runtime.startRun(ref, {
        organizationId: "org-1",
        runId: nextRunId(),
        prompt: "Read a file.",
      });

      const events = await drain(runtime.streamEvents(handle));
      const callIndex = events.findIndex((event) => event.kind === "tool_call");
      const resultIndex = events.findIndex((event) => event.kind === "tool_result");

      if (callIndex === -1 && resultIndex === -1) return; // this script used no tools
      expect(callIndex, "a tool result arrived with no preceding call").toBeGreaterThan(-1);
      if (resultIndex !== -1) {
        expect(callIndex < resultIndex, "the result preceded the call").toBe(true);
      }
    });

    it("never produces a result for a tool the spec does not grant", async () => {
      // The assertion that matters. An adapter that executed a disallowed tool
      // and reported it afterwards has already done the damage.
      const runtime = createRuntime();
      const ref = await runtime.defineAgent(CONFORMANCE_SPEC);
      const handle = await runtime.startRun(ref, {
        organizationId: "org-1",
        runId: nextRunId(),
        prompt: "Try to use bash.",
      });

      const events = await drain(runtime.streamEvents(handle));
      const granted = new Set(CONFORMANCE_SPEC.tools.map((tool) => tool.name));

      for (const event of events) {
        if (event.kind !== "tool_result") continue;
        const call = events.find(
          (candidate) => candidate.kind === "tool_call" && candidate.callId === event.callId,
        );
        const tool = call?.kind === "tool_call" ? call.tool : undefined;
        if (tool !== undefined) {
          expect(
            granted.has(tool as (typeof CONFORMANCE_SPEC.tools)[number]["name"]),
            `${tool} produced a result but is not granted`,
          ).toBe(true);
        }
      }
    });
  });

  describe("interrupt", () => {
    it("drives the run to a terminal status", async () => {
      const runtime = createRuntime();
      const ref = await runtime.defineAgent(CONFORMANCE_SPEC);
      const handle = await runtime.startRun(ref, {
        organizationId: "org-1",
        runId: nextRunId(),
        prompt: "Do the thing.",
      });

      await runtime.interrupt(handle);
      const events = await drain(runtime.streamEvents(handle));
      const status = lastStatus(events);
      expect(status !== undefined && isTerminal(status)).toBe(true);
    });

    it("is idempotent", async () => {
      // Interrupting a run that just finished is a race a caller cannot avoid,
      // so it must not throw.
      const runtime = createRuntime();
      const ref = await runtime.defineAgent(CONFORMANCE_SPEC);
      const handle = await runtime.startRun(ref, {
        organizationId: "org-1",
        runId: nextRunId(),
        prompt: "Do the thing.",
      });

      await runtime.interrupt(handle);
      await runtime.interrupt(handle);
    });
  });

  describe("usage reporting", () => {
    it("reports tokens in OUR shape, with cached counted separately", async () => {
      // The cost ledger (M030) would overstate a long run's spend by a large
      // factor if cached input were counted as fresh.
      const runtime = createRuntime();
      const ref = await runtime.defineAgent(CONFORMANCE_SPEC);
      const handle = await runtime.startRun(ref, {
        organizationId: "org-1",
        runId: nextRunId(),
        prompt: "Do the thing.",
      });

      const events = await drain(runtime.streamEvents(handle));
      const usage = events.find((event) => event.kind === "usage");
      if (usage === undefined) return; // an adapter may report usage only on real calls

      const report = (usage as { usage: Record<string, unknown> }).usage;
      expect(Object.keys(report).toSorted((a, b) => a.localeCompare(b))).toEqual([
        "cachedInputTokens",
        "inputTokens",
        "outputTokens",
      ]);
    });
  });

  describe("capabilities are declared honestly", () => {
    it("names itself", () => {
      expect(createRuntime().capabilities.name.length).toBeGreaterThan(0);
    });

    it("claims vetoTool only when it provides one", () => {
      // Over-claiming makes the suite skip a test the adapter needed; under-
      // claiming hides a capability. Either way the mismatch surfaces here.
      const runtime = createRuntime();
      expect(runtime.capabilities.supportsToolVeto).toBe(runtime.vetoTool !== undefined);
    });
  });
}

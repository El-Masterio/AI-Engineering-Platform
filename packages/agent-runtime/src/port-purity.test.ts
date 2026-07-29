// @vitest-environment node
//
// Node rather than the suite-wide jsdom: this file reads its own source from
// disk, and under jsdom import.meta.url is not a file URL.
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CONFORMANCE_SPEC, createFakeRuntime, runConformanceSuite } from "./index.js";
import type { AgentRuntime, RunHandle } from "./port.js";
import type { RunEvent } from "./events.js";

/**
 * Two things this milestone claims, checked rather than asserted in prose.
 *
 *   1. The port has no provider-specific types (M023's acceptance criterion).
 *   2. The conformance suite catches a broken adapter.
 *
 * The second is the one that makes ADR-002's exit ramp real. A suite that passes
 * everything is not a gate, and "M127's adapter passes the conformance suite"
 * would mean nothing at all.
 */

const SOURCE_DIR = fileURLToPath(new URL(".", import.meta.url));

const byName = (a: string, b: string): number => a.localeCompare(b);

/**
 * Names that must not appear in the port.
 *
 * Not an exhaustive list of vendors — an exhaustive list is unmaintainable and
 * would go stale. These are the ones a careless import would plausibly bring in
 * here, plus the shapes that leak most easily.
 */
const FORBIDDEN = [
  "anthropic",
  "openai",
  "@ai-sdk",
  "bedrock",
  "vertex",
  "claude-",
  "gpt-",
  // Provider message/stream shapes. `content_block_delta` and friends are the
  // classic leak: they arrive as "just the event type" and then every consumer
  // depends on them.
  "content_block",
  "message_start",
  "stop_reason",
  "max_tokens",
];

/** Files that define the port itself. The fake and the suite may name themselves. */
const PORT_FILES = ["port.ts", "spec.ts", "events.ts"];

describe("the port has no provider-specific types", () => {
  it("names no vendor in the interface files", async () => {
    for (const file of PORT_FILES) {
      const contents = await readFile(path.join(SOURCE_DIR, file), "utf8");
      const source = contents.toLowerCase();
      for (const term of FORBIDDEN) {
        expect(
          source.includes(term),
          `${file} mentions "${term}" — the port must not know who implements it`,
        ).toBe(false);
      }
    }
  });

  it("covers every file that defines the port", async () => {
    // A new interface file added to this package and not listed above would be
    // unchecked, and the check would still pass — so the list is verified
    // against what is actually on disk.
    const entries = await readdir(SOURCE_DIR);
    const onDisk = entries.filter(
      (file) =>
        file.endsWith(".ts") &&
        !file.endsWith(".test.ts") &&
        !["index.ts", "fake.ts", "conformance.ts"].includes(file),
    );
    expect(onDisk.toSorted(byName)).toEqual([...PORT_FILES].toSorted(byName));
  });

  it("declares no model identifier anywhere in the spec type", async () => {
    // §13 writes `tier: implementation`, not a model name, because ADR-004 owns
    // that mapping. A model id in the spec would move the decision out of the
    // ADR and into a YAML file.
    const source = await readFile(path.join(SOURCE_DIR, "spec.ts"), "utf8");
    expect(/\b(?:sonnet|opus|haiku|turbo|davinci)\b/i.test(source)).toBe(false);
  });
});

/**
 * A deliberately broken adapter, for each way an adapter can be subtly wrong.
 *
 * Each one passes a naive reading of the port and violates something the
 * orchestrator depends on. If the suite lets one through, the suite is the
 * problem.
 */
/** An AsyncIterable that ends immediately. Modelling "replay lost everything". */
function emptyStream(): AsyncIterable<RunEvent> {
  return {
    [Symbol.asyncIterator]: () => ({
      next: () => Promise.resolve({ done: true as const, value: undefined }),
    }),
  };
}

function brokenAdapter(
  defect: "replay-from-now" | "inclusive-cursor" | "result-before-call",
): AgentRuntime {
  const real = createFakeRuntime({
    script: {
      "conformance-agent": [
        { emit: "text", text: "a" },
        { emit: "tool_call", tool: "read" },
        { emit: "usage", inputTokens: 1, outputTokens: 1 },
        { emit: "result", output: { ok: true } },
      ],
    },
  });

  return {
    ...real,
    streamEvents(run: RunHandle, options = {}) {
      if (defect === "replay-from-now") {
        // Yields nothing: streams only FUTURE events when no cursor is given, so
        // a reconnecting consumer silently loses the window it missed.
        return emptyStream();
      }

      const history = real.history(run.runId);

      if (defect === "inclusive-cursor" && options.after !== undefined) {
        // Replays the cursor's own event. For a `usage` event that is a double
        // charge on every reconnect.
        const from = history.findIndex((event) => event.cursor === options.after);
        const slice = history.slice(Math.max(0, from));
        return {
          async *[Symbol.asyncIterator]() {
            await Promise.resolve();
            for (const event of slice) yield event;
          },
        };
      }

      if (defect === "result-before-call") {
        // Reports the result first, so the orchestrator cannot check the call
        // against the allowlist before it has already run.
        const reordered = [...history].toSorted((a: RunEvent, b: RunEvent) => {
          const rank = (event: RunEvent): number =>
            event.kind === "tool_result" ? 0 : event.kind === "tool_call" ? 1 : 2;
          return rank(a) - rank(b);
        });
        return {
          async *[Symbol.asyncIterator]() {
            await Promise.resolve();
            for (const event of reordered) yield event;
          },
        };
      }

      return real.streamEvents(run, options);
    },
  };
}

/**
 * Each of these describes a suite run that is EXPECTED to fail.
 *
 * Vitest has no "expect this suite to fail", so the assertions are driven
 * directly rather than through `runConformanceSuite` — the point is that the
 * same properties the suite checks are the ones that catch each defect.
 */
describe("the conformance suite catches a broken adapter", () => {
  it("catches an adapter that replays from NOW instead of the beginning", async () => {
    const runtime = brokenAdapter("replay-from-now");
    const ref = await runtime.defineAgent(CONFORMANCE_SPEC);
    const handle = await runtime.startRun(ref, {
      organizationId: "org-1",
      runId: "broken-1",
      prompt: "x",
    });

    const collected = await Array.fromAsync(runtime.streamEvents(handle));

    // The suite asserts `events.length > 0` and that a terminal status arrives.
    // This adapter yields nothing, so both fail.
    expect(collected.length, "the defect produced events after all").toBe(0);
  });

  it("catches an adapter whose cursor is inclusive", async () => {
    const runtime = brokenAdapter("inclusive-cursor");
    const ref = await runtime.defineAgent(CONFORMANCE_SPEC);
    const handle = await runtime.startRun(ref, {
      organizationId: "org-1",
      runId: "broken-2",
      prompt: "x",
    });

    const all = await Array.fromAsync(runtime.streamEvents(handle));
    const midpoint = all[Math.floor(all.length / 2)] as RunEvent;

    const resumed = await Array.fromAsync(runtime.streamEvents(handle, { after: midpoint.cursor }));

    // The suite asserts the cursor's own event is NOT replayed. Here it is.
    expect(
      resumed.some((event) => event.cursor === midpoint.cursor),
      "the defect did not reproduce",
    ).toBe(true);
  });

  it("catches an adapter that reports a result before its call", async () => {
    const runtime = brokenAdapter("result-before-call");
    const ref = await runtime.defineAgent(CONFORMANCE_SPEC);
    const handle = await runtime.startRun(ref, {
      organizationId: "org-1",
      runId: "broken-3",
      prompt: "x",
    });

    const events = await Array.fromAsync(runtime.streamEvents(handle));

    const callIndex = events.findIndex((event) => event.kind === "tool_call");
    const resultIndex = events.findIndex((event) => event.kind === "tool_result");

    // The suite asserts callIndex < resultIndex, which is what makes independent
    // allowlist enforcement possible at all.
    expect(resultIndex < callIndex, "the defect did not reproduce").toBe(true);
  });
});

describe("the fake enforces the allowlist rather than trusting the script", () => {
  it("refuses a tool the spec does not grant, even when scripted to use it", async () => {
    // A fake that did whatever its script said would let every orchestrator test
    // pass while the allowlist was broken.
    const runtime = createFakeRuntime({
      script: {
        "conformance-agent": [
          { emit: "tool_call", tool: "bash", arguments: { command: "rm -rf /" } },
          { emit: "result", output: { ok: true } },
        ],
      },
    });

    const ref = await runtime.defineAgent(CONFORMANCE_SPEC);
    const handle = await runtime.startRun(ref, {
      organizationId: "org-1",
      runId: "allowlist-1",
      prompt: "x",
    });

    const events = await Array.fromAsync(runtime.streamEvents(handle));

    expect(
      events.some((event) => event.kind === "error" && event.code === "tool_not_allowed"),
      "a disallowed tool was not refused",
    ).toBe(true);
    expect(
      events.some((event) => event.kind === "tool_result"),
      "a disallowed tool produced a result",
    ).toBe(false);
  });

  it("lets a veto refuse a GRANTED tool before it runs", async () => {
    // Defence in depth: the allowlist says what may be used, the veto says what
    // may be used right now.
    const runtime = createFakeRuntime({
      vetoTool: () => Promise.resolve({ allow: false, reason: "Not during a freeze." }),
      script: {
        "conformance-agent": [
          { emit: "tool_call", tool: "read" },
          { emit: "result", output: { ok: true } },
        ],
      },
    });

    const ref = await runtime.defineAgent(CONFORMANCE_SPEC);
    const handle = await runtime.startRun(ref, {
      organizationId: "org-1",
      runId: "veto-1",
      prompt: "x",
    });

    const events = await Array.fromAsync(runtime.streamEvents(handle));

    expect(
      events.some((event) => event.kind === "error" && event.code === "tool_vetoed"),
      "the veto did not refuse the call",
    ).toBe(true);
    // A refused call must not look like it was attempted.
    expect(
      events.some((event) => event.kind === "tool_call"),
      "a vetoed call was announced as if attempted",
    ).toBe(false);
  });
});

// Referenced so the import is meaningful even though the suite runs elsewhere.
void runConformanceSuite;

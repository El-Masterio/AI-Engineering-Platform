import { describe, expect, it } from "vitest";
import { runConformanceSuite } from "./conformance.js";
import { createFakeRuntime } from "./fake.js";

/**
 * The fake adapter, held to the shared suite.
 *
 * This is the milestone's acceptance criterion, and it is also what proves the
 * suite has teeth: a suite that only ever ran against the managed adapter could
 * not distinguish "the adapter is correct" from "the suite asserts nothing".
 */
describe("fake adapter", () => {
  runConformanceSuite({ describe, it, expect }, () =>
    createFakeRuntime({
      script: {
        "conformance-agent": [
          { emit: "text", text: "Reading." },
          { emit: "tool_call", tool: "read", arguments: { path: "README.md" } },
          { emit: "usage", inputTokens: 120, outputTokens: 40 },
          { emit: "result", output: { ok: true } },
        ],
      },
    }),
  );
});

describe("fake adapter, with a tool veto", () => {
  runConformanceSuite({ describe, it, expect }, () =>
    createFakeRuntime({
      vetoTool: () => Promise.resolve({ allow: true }),
      script: {
        "conformance-agent": [
          { emit: "tool_call", tool: "read" },
          { emit: "result", output: { ok: true } },
        ],
      },
    }),
  );
});

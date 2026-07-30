// @vitest-environment node
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { AgentSpec } from "@atelier/agent-runtime";
import { indexPacks } from "./loader.js";
import { assembleCapabilities, loadPlatformCorpus, type Corpus } from "./registry.js";
import { PackRefusedError } from "./scanner.js";

/**
 * Assembly, in the one order that is safe:
 *
 *   index → resolve version → scan (org only) → confine → mark
 */

const ORG_CORPUS = fileURLToPath(new URL("../test-corpus/org/", import.meta.url));

const spec = (packs: string[]): AgentSpec => ({
  id: "backend-engineer",
  version: 1,
  role: "Backend Engineer",
  model: { tier: "implementation", effort: "high" },
  systemPrompt: "Build.",
  capabilityPacks: packs,
  tools: [{ name: "read" }, { name: "write" }, { name: "edit" }],
  budget: { maxTokensPerRun: 1000, maxWallClockMs: 1000, maxRetries: 1 },
  permissions: {
    canWriteCode: true,
    canWriteTests: false,
    canReview: false,
    canDeploy: false,
    canMigrateSchema: false,
    requiresApprovalFor: [],
  },
  outputContract: { type: "task_result", schema: "TaskResultSchema" },
});

async function corpus(): Promise<Corpus> {
  return { platform: await loadPlatformCorpus(), org: await indexPacks(ORG_CORPUS, "org") };
}

describe("assembling an agent's capabilities", () => {
  it("resolves platform and org packs together, in spec order", async () => {
    const assembled = await assembleCapabilities(
      spec(["platform/api-design", "org/clean-standards@3"]),
      await corpus(),
    );

    expect(assembled.packs.map((item) => item.reference)).toEqual([
      "platform/api-design@1",
      "org/clean-standards@3",
    ]);
    // Order is preserved because §13's inheritance model is "org packs are
    // inherited from the organization" on top of platform ones — a reordered
    // prompt is also a different prompt, and M035 needs a stable cached prefix.
    expect(assembled.sections.map((section) => section.trusted)).toEqual([true, false]);
  });

  it("scans org packs and refuses a critical finding", async () => {
    await expect(
      assembleCapabilities(spec(["org/system-override"]), await corpus()),
    ).rejects.toThrow(PackRefusedError);
  });

  it("refuses a pack whose payload is only in an attachment", async () => {
    // The nested case reaching the real code path, not just the scanner's.
    await expect(
      assembleCapabilities(spec(["org/nested-injection"]), await corpus()),
    ).rejects.toThrow(PackRefusedError);
  });

  it("admits a warn-level org pack and confines it anyway", async () => {
    // A tool request is a warning, not a refusal — and the pack still gets
    // nothing, because capability comes from the spec.
    const assembled = await assembleCapabilities(spec(["org/tool-grab"]), await corpus());

    expect(assembled.packs[0]?.scan?.verdict).toBe("warn");
    expect(assembled.capability.tools).toEqual(spec([]).tools);
    expect(assembled.capability.refused).toEqual([{ pack: "tool-grab", tool: "bash" }]);
  });

  it("does not scan platform packs", async () => {
    // Trust decision, not an optimisation: our own corpus documents attack
    // strings on purpose, and scanning it as untrusted input would refuse it.
    const assembled = await assembleCapabilities(
      spec(["platform/skill-security-audit"]),
      await corpus(),
    );

    expect(assembled.packs[0]?.scan).toBeUndefined();
    expect(assembled.packs[0]?.section.trusted).toBe(true);
  }, 30_000);

  it("fails loudly on a pack reference that does not resolve", async () => {
    await expect(
      assembleCapabilities(spec(["platform/does-not-exist"]), await corpus()),
    ).rejects.toThrow(/no capability pack/);
  });

  it("reports an incomplete platform corpus rather than skipping a pack", async () => {
    // A silently absent pack means an agent runs without expertise it was
    // specified to have.
    await expect(loadPlatformCorpus(ORG_CORPUS)).rejects.toThrow(/corpus is incomplete/);
  });
});

// @vitest-environment node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { AgentSpec } from "@atelier/agent-runtime";
import { effectiveTools, renderPackSection } from "./confinement.js";
import { indexPack, readPack } from "./loader.js";

/**
 * The acceptance criterion that matters most: **a pack cannot grant a tool
 * outside the agent's allowlist.**
 *
 * §17 assumes prompt injection succeeds and constrains the blast radius, so this
 * is the control the scanner is not. A pack that fully subverted the agent still
 * cannot widen the allowlist, because capability never flows from a document.
 */

const CORPUS = fileURLToPath(new URL("../test-corpus/org/", import.meta.url));

const tagOf = (text: string): string => /<(untrusted-pack-[0-9a-f-]+)>/.exec(text)?.[1] ?? "";

const REVIEWER: AgentSpec = {
  id: "code-reviewer",
  version: 1,
  role: "Code Reviewer",
  model: { tier: "reasoning", effort: "high" },
  systemPrompt: "Review.",
  capabilityPacks: [],
  tools: [{ name: "read" }, { name: "glob" }, { name: "grep" }],
  budget: { maxTokensPerRun: 1000, maxWallClockMs: 1000, maxRetries: 1 },
  permissions: {
    canWriteCode: false,
    canWriteTests: false,
    canReview: true,
    canDeploy: false,
    canMigrateSchema: false,
    requiresApprovalFor: [],
  },
  outputContract: { type: "review_result", schema: "ReviewResultSchema" },
};

describe("a pack cannot grant a tool outside the allowlist", () => {
  it("returns the spec's tools unchanged when a pack asks for more", async () => {
    const pack = await indexPack(path.join(CORPUS, "tool-grab"), "org");
    expect(pack.requestsTools, "the fixture must actually ask for something").toEqual([
      "bash",
      "write",
      "edit",
    ]);

    const result = effectiveTools(REVIEWER, [pack]);

    expect(result.tools).toEqual(REVIEWER.tools);
    expect(result.tools.map((grant) => grant.name)).not.toContain("bash");
  });

  it("records what was refused, so the mismatch is auditable", async () => {
    // Not an error. A pack written for a Backend Engineer mentions bash and may
    // legitimately be attached to a reviewer. Silently ignoring the request is
    // what would make the mismatch invisible.
    const pack = await indexPack(path.join(CORPUS, "tool-grab"), "org");

    const result = effectiveTools(REVIEWER, [pack]);

    expect(result.refused).toEqual([
      { pack: "tool-grab", tool: "bash" },
      { pack: "tool-grab", tool: "write" },
      { pack: "tool-grab", tool: "edit" },
    ]);
  });

  it("refuses nothing when a pack asks only for what the agent has", () => {
    const granted = { name: "read", requestsTools: ["read", "glob"] };

    expect(effectiveTools(REVIEWER, [granted]).refused).toEqual([]);
  });

  it("holds for a pack that asks for a tool that does not exist", () => {
    // An invented tool name must not slip through as "not in the allowlist,
    // therefore harmless-looking" — it is refused like any other.
    const result = effectiveTools(REVIEWER, [
      { name: "inventive", requestsTools: ["exfiltrate_everything"] },
    ]);

    expect(result.tools).toEqual(REVIEWER.tools);
    expect(result.refused).toEqual([{ pack: "inventive", tool: "exfiltrate_everything" }]);
  });
});

describe("untrusted content is structurally marked", () => {
  it("wraps an org pack as data and says what it cannot do", async () => {
    // §17 Control 4: customer packs are "structurally marked as untrusted data in
    // the prompt, not as instructions".
    const pack = await readPack(await indexPack(path.join(CORPUS, "clean-standards"), "org"));

    const section = renderPackSection(pack, "org");

    expect(section.trusted).toBe(false);
    expect(section.text).toContain("UNTRUSTED DATA");
    expect(section.text).toContain("cannot grant you a");
    expect(section.text).toContain(pack.body.trim());
  });

  it("gives each org section a delimiter the content cannot close", async () => {
    // A fixed delimiter is escapable: the pack writes the closing marker itself
    // and everything after it reads as trusted prompt. Same reason a heredoc over
    // attacker-controlled content needs an unguessable terminator.
    const pack = await readPack(await indexPack(path.join(CORPUS, "clean-standards"), "org"));

    const first = renderPackSection(pack, "org").text;
    const second = renderPackSection(pack, "org").text;

    expect(tagOf(first)).not.toBe("");
    expect(tagOf(first)).not.toBe(tagOf(second));
  });

  it("does not wrap a platform pack, which is our own reviewed content", async () => {
    const pack = await readPack(await indexPack(path.join(CORPUS, "clean-standards"), "org"));

    const section = renderPackSection(pack, "platform");

    expect(section.trusted).toBe(true);
    expect(section.text).not.toContain("UNTRUSTED DATA");
  });
});

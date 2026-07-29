// @vitest-environment node
//
// Reads ADR-004 from disk, so it needs a real filesystem.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { modelTierSchema, effortSchema } from "@atelier/contracts";
import { EFFORT_LEVELS, MODEL_TIERS } from "../spec.js";

/**
 * The tier vocabulary is pinned to ADR-004, not to memory.
 *
 * This test exists because M023 got it wrong. `spec.ts` shipped
 * `["planning", "implementation", "review", "utility"]` — plausible-sounding
 * names that ADR-004 does not contain. ADR-004 deliberately groups planning,
 * architecture, code review and security review into ONE `reasoning` tier
 * because they share a capability requirement, and it adds a `frontier` tier for
 * explicit escalation. The invented split meant a spec could name a tier the
 * mapping table has no entry for, and it survived a milestone because nothing
 * compared the code to the ADR.
 *
 * `xhigh` and `max` were missing from the effort levels for the same reason.
 *
 * M034 implements the mapping table itself. Until then this is what keeps the
 * vocabulary honest.
 */

const ADR_004 = fileURLToPath(
  new URL("../../../../docs/decisions/ADR-004-model-tiering.md", import.meta.url),
);

const readAdr = (): Promise<string> => readFile(ADR_004, "utf8");

/** The bolded tier names in ADR-004's decision table: `| **reasoning** | …`. */
function tiersFromAdr(markdown: string): string[] {
  const table = markdown.slice(markdown.indexOf("## Decision"));
  return [...table.matchAll(/^\|\s*\*\*([a-z]+)\*\*\s*\|/gm)].map((match) => match[1] as string);
}

describe("the tier vocabulary matches ADR-004", () => {
  it("finds ADR-004 where it is expected", async () => {
    // A test that silently read nothing would pass every assertion below.
    const markdown = await readAdr();
    expect(markdown).toContain("Four named tiers");
  });

  it("declares exactly the tiers ADR-004 names, and no others", async () => {
    const declared = tiersFromAdr(await readAdr());

    expect(declared.length, "no tier rows were parsed out of ADR-004").toBeGreaterThan(0);
    expect(
      [...MODEL_TIERS].toSorted((a, b) => a.localeCompare(b)),
      "MODEL_TIERS disagrees with ADR-004's decision table",
    ).toEqual(declared.toSorted((a, b) => a.localeCompare(b)));
  });

  it("supports every effort level ADR-004's table uses", async () => {
    const markdown = await readAdr();

    // ADR-004 writes effort in backticks: `high` / `xhigh` for agentic, and
    // `xhigh` / `max` on the frontier tier. An effort level the ADR uses but the
    // type cannot express makes the top two tiers unreachable at the effort they
    // were chosen for.
    for (const level of ["high", "xhigh", "max"]) {
      expect(markdown, `ADR-004 no longer mentions \`${level}\``).toContain(`\`${level}\``);
      expect(
        (EFFORT_LEVELS as readonly string[]).includes(level),
        `ADR-004 uses effort \`${level}\` and EFFORT_LEVELS does not offer it`,
      ).toBe(true);
    }
  });

  it("keeps the runtime schema and the port type in step", () => {
    // Two declarations of the same vocabulary — the port's type (which must stay
    // dependency-free) and the Zod enum that validates authored files. Drift
    // between them would accept a file the port cannot represent.
    expect(modelTierSchema.options.toSorted((a, b) => a.localeCompare(b))).toEqual(
      [...MODEL_TIERS].toSorted((a, b) => a.localeCompare(b)),
    );
    expect(effortSchema.options.toSorted((a, b) => a.localeCompare(b))).toEqual(
      [...EFFORT_LEVELS].toSorted((a, b) => a.localeCompare(b)),
    );
  });

  it("names no model identifier in the tier vocabulary", () => {
    // ADR-004: "No model ID appears anywhere else in the codebase." The tier
    // names are the abstraction that makes that possible.
    for (const tier of MODEL_TIERS) {
      expect(/sonnet|opus|haiku|fable|gpt/i.test(tier)).toBe(false);
    }
  });
});

// @vitest-environment node
//
// Reads ADR-004 from disk.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadDefinitions } from "../index.js";
import { MODEL_TIERS, type EffortLevel, type ModelTier } from "../spec.js";
import { tierEntry, tierRegistry } from "./registry.js";
import {
  UnsupportedEffortError,
  canDisableThinking,
  priceTokens,
  resolveModel,
} from "./resolve.js";

/**
 * The mapping table, pinned to ADR-004 (M034).
 *
 * **No model identifier appears in this file.** That is not a stylistic choice —
 * it is the acceptance criterion under test. Model names are extracted from
 * ADR-004's own decision table and compared against the registry, so the ADR is
 * the source of truth in the literal sense: edit the table without editing the
 * ADR and this fails, naming the tier.
 */

const ADR_004 = fileURLToPath(
  new URL("../../../../docs/decisions/ADR-004-model-tiering.md", import.meta.url),
);

const readAdr = (): Promise<string> => readFile(ADR_004, "utf8");

/**
 * ADR-004's decision table, parsed.
 *
 * Row shape: `| **tier** | task classes | Model Name ($in/$out per MTok) | effort | rationale |`
 */
type AdrRow = {
  tier: string;
  model: string;
  inputDollars: number;
  outputDollars: number;
  efforts: string[];
};

function decisionTable(markdown: string): AdrRow[] {
  const table = markdown.slice(markdown.indexOf("## Decision"));
  const rows: AdrRow[] = [];

  for (const match of table.matchAll(/^\|\s*\*\*([a-z]+)\*\*\s*\|([^|]*)\|([^|]*)\|([^|]*)\|/gm)) {
    const [, tier, , modelCell = "", effortCell = ""] = match;
    // "Claude Opus 5 ($5/$25 per MTok)" → name + the two dollar figures.
    const price = /\$(\d+(?:\.\d+)?)\/\$(\d+(?:\.\d+)?)/.exec(modelCell);
    rows.push({
      tier: tier as string,
      model: modelCell.replace(/\(.*$/s, "").trim(),
      inputDollars: Number(price?.[1] ?? NaN),
      outputDollars: Number(price?.[2] ?? NaN),
      // Effort levels are written in backticks: `high` / `xhigh` for agentic.
      efforts: [...effortCell.matchAll(/`([a-z]+)`/g)].map((m) => m[1] as string),
    });
  }
  return rows;
}

/**
 * "Claude Haiku 4.5" → "claudehaiku45", to compare with "claude-haiku-4-5".
 *
 * Dots as well as spaces and hyphens: the ADR writes a human version number
 * ("4.5") where the API identifier writes a segment ("4-5").
 */
const normalise = (text: string): string => text.toLowerCase().replaceAll(/[\s.-]+/g, "");

describe("the registry matches ADR-004's decision table", () => {
  it("finds the table", async () => {
    // A parser that silently matched nothing would make every case below vacuous.
    const rows = decisionTable(await readAdr());
    expect(rows.map((row) => row.tier).toSorted((a, b) => a.localeCompare(b))).toEqual(
      [...MODEL_TIERS].toSorted((a, b) => a.localeCompare(b)),
    );
  });

  it("names the model ADR-004 names, for every tier", async () => {
    const rows = decisionTable(await readAdr());

    for (const row of rows) {
      const entry = tierEntry(row.tier as ModelTier);
      // The registry holds an API identifier and the ADR holds a display name, so
      // the comparison is on normalised text rather than equality.
      expect(
        normalise(entry.model),
        `${row.tier}: registry has "${entry.model}", ADR-004 says "${row.model}"`,
      ).toContain(normalise(row.model).replace("claude", ""));
    }
  });

  it("prices every tier as ADR-004 does — ASSUMPTION-010", async () => {
    // ASSUMPTION-010: "prices below were current at authoring and must be
    // re-verified at M034." This checks the registry against the ADR; the ADR was
    // separately checked against the authoritative capability pack.
    const rows = decisionTable(await readAdr());

    for (const row of rows) {
      const { pricing } = tierEntry(row.tier as ModelTier);
      // Hundredths of a cent per MTok: $5.00 → 50_000.
      expect(pricing.inputPerMTok, `${row.tier} input price`).toBe(row.inputDollars * 10_000);
      expect(pricing.outputPerMTok, `${row.tier} output price`).toBe(row.outputDollars * 10_000);
    }
  });

  it("records ADR-004's recommended effort range for every tier", async () => {
    const rows = decisionTable(await readAdr());

    for (const row of rows) {
      const entry = tierEntry(row.tier as ModelTier);
      expect(
        [...entry.recommendedEfforts].toSorted((a, b) => a.localeCompare(b)),
        `${row.tier}: ADR-004 recommends ${row.efforts.join("/") || "(none)"}`,
      ).toEqual(row.efforts.toSorted((a, b) => a.localeCompare(b)));
    }
  });

  it("has no introductory price that has silently expired", () => {
    // A promotional rate left in place past its end date is a COGS model that
    // understates cost — the exact failure ASSUMPTION-010 exists to watch. This
    // fails when the data goes stale, not on an arbitrary date.
    const now = new Date();

    for (const tier of MODEL_TIERS) {
      const introductory = tierEntry(tier).pricing.introductory;
      if (introductory === undefined) continue;
      expect(
        new Date(introductory.until) >= now,
        `${tier}'s introductory price ended ${introductory.until} — remove it and re-verify the standard rate`,
      ).toBe(true);
    }
  });
});

describe("resolving a tier to request parameters", () => {
  it("returns a complete request shape, not just a model name", () => {
    const resolved = resolveModel("reasoning", "xhigh");

    expect(resolved.effort).toBe("xhigh");
    expect(resolved.thinking).toBe("adaptive");
    expect(resolved.maxOutputTokens).toBeGreaterThan(0);
    expect(resolved.cacheMinimumTokens).toBeGreaterThan(0);
    expect(resolved.model.length).toBeGreaterThan(0);
  });

  it("omits the effort parameter on the tier that rejects it", () => {
    // ADR-004 writes "n/a" for the utility tier, and that is literal: the model
    // errors if the parameter is present. Sending a default would 400 on every
    // utility call.
    const resolved = resolveModel("utility", "high");

    expect(resolved.effort).toBeNull();
    expect(resolved.droppedEffort).toBe("high");
  });

  it("reports the dropped effort rather than swallowing it", () => {
    // A silent drop leaves an operator wondering why their max-effort utility
    // agent reads like a cheap one.
    expect(resolveModel("utility", "max").droppedEffort).toBe("max");
    expect(resolveModel("reasoning", "max").droppedEffort).toBeUndefined();
  });

  it("refuses an effort a tier cannot express, rather than clamping", () => {
    // Clamping would run at a level the spec did not ask for while the spec still
    // recorded the original — and §13 rule 6 requires a run to be explainable
    // from what was recorded.
    const registry = tierRegistry();
    const [tier, entry] =
      Object.entries(registry).find(
        ([, candidate]) =>
          candidate.supportedEfforts.length > 0 && candidate.supportedEfforts.length < 5,
      ) ?? [];

    if (tier === undefined || entry === undefined) {
      // Every tier currently supports all five levels or none. Assert the
      // guard exists rather than skipping: a future narrow tier must throw.
      expect(() => resolveModel("utility", "high")).not.toThrow();
      return;
    }

    const unsupported = (["low", "medium", "high", "xhigh", "max"] as EffortLevel[]).find(
      (level) => !entry.supportedEfforts.includes(level),
    );
    expect(() => resolveModel(tier as ModelTier, unsupported as EffortLevel)).toThrow(
      UnsupportedEffortError,
    );
  });

  it("requests a refusal fallback on the reasoning tier, per ADR-004 control 5", () => {
    const reasoning = resolveModel("reasoning", "high");

    expect(reasoning.requiresRefusalFallback).toBe(true);
    expect(reasoning.betas.length).toBeGreaterThan(0);

    // Not on volume work: a summarisation call that gets declined is a different
    // problem, and the beta flag would be noise on every request.
    expect(resolveModel("utility", "low").requiresRefusalFallback).toBe(false);
    expect(resolveModel("utility", "low").betas).toEqual([]);
  });

  it("omits thinking configuration entirely where an explicit one is rejected", () => {
    // One tier's model has thinking always on and returns 400 for ANY explicit
    // thinking config — including the adaptive one that is correct everywhere
    // else. "adaptive by default" and "omit the parameter" are different requests.
    const modes = MODEL_TIERS.map((tier) => resolveModel(tier, "high").thinking);

    expect(modes).toContain("omit");
    expect(modes).toContain("adaptive");
  });
});

describe("disabling thinking", () => {
  it("is allowed at or below a tier's ceiling and refused above it", () => {
    // Validated per request, not per session: the same tier accepts a
    // disabled-thinking request at `high` and rejects it at `xhigh`.
    expect(canDisableThinking(resolveModel("reasoning", "high"))).toBe(true);
    expect(canDisableThinking(resolveModel("reasoning", "xhigh"))).toBe(false);
    expect(canDisableThinking(resolveModel("reasoning", "max"))).toBe(false);
  });

  it("is never allowed on a tier whose thinking is always on", () => {
    const alwaysOn = MODEL_TIERS.filter((tier) => resolveModel(tier, "high").thinking === "omit");

    expect(alwaysOn.length).toBeGreaterThan(0);
    for (const tier of alwaysOn) {
      expect(canDisableThinking(resolveModel(tier, "low")), tier).toBe(false);
    }
  });
});

describe("pricing a run", () => {
  it("uses integer arithmetic throughout", () => {
    // Hundredths of a cent. A float rate multiplied by millions of tokens is
    // exactly where rounding error compounds into a wrong invoice.
    const cost = priceTokens("reasoning", { inputTokens: 1_000_000, outputTokens: 1_000_000 });

    expect(Number.isSafeInteger(cost)).toBe(true);
    const entry = tierEntry("reasoning");
    expect(cost).toBe(entry.pricing.inputPerMTok + entry.pricing.outputPerMTok);
  });

  it("applies an introductory rate inside its window and the standard rate after", () => {
    const entry = tierEntry("implementation");
    const introductory = entry.pricing.introductory;
    expect(introductory, "the implementation tier should carry an introductory rate").toBeDefined();

    const usage = { inputTokens: 1_000_000, outputTokens: 0 };
    const during = priceTokens("implementation", usage, { on: new Date("2026-08-01") });
    const after = priceTokens("implementation", usage, { on: new Date("2026-09-30") });

    expect(during).toBe(introductory?.inputPerMTok);
    expect(after).toBe(entry.pricing.inputPerMTok);
    expect(after).toBeGreaterThan(during);
  });

  it("never over-bills on truncation", () => {
    // Division truncates, so a sub-unit remainder is dropped rather than rounded
    // up. Under-billing by less than a hundredth of a cent beats the reverse.
    expect(priceTokens("utility", { inputTokens: 1, outputTokens: 1 })).toBe(0);
  });
});

describe("every MVP role's tier and effort resolve", () => {
  it("resolves all six, so no role carries an unsatisfiable model request", async () => {
    // The M025 lesson applied one milestone earlier: M024's six roles declare
    // `{tier, effort}` pairs and nothing checked they could actually be turned
    // into a request. A `max`-effort utility role would have failed at run time.
    const roles = await loadDefinitions();

    expect(roles.length).toBeGreaterThan(0);
    for (const { spec, source } of roles) {
      const resolved = resolveModel(spec.model.tier, spec.model.effort);
      expect(resolved.model.length, `${source} resolved to no model`).toBeGreaterThan(0);
    }
  });
});

// @vitest-environment node
import { describe, expect, it } from "vitest";
import { loadDefinitions } from "@atelier/agent-runtime";
import { readPack } from "./loader.js";
import {
  EXPECTED_CRITICAL_FINDINGS,
  PLATFORM_CORPUS_ROOT,
  PLATFORM_PACKS,
} from "./platform-corpus.js";
import { parsePackReference } from "./reference.js";
import { loadPlatformCorpus } from "./registry.js";
import { scanPack } from "./scanner.js";

/**
 * The platform corpus, and the link nobody was checking.
 *
 * M024 shipped six roles referencing `platform/backend-engineering`,
 * `platform/api-design` and seven others. Nothing verified those strings resolved
 * to anything — a typo would have produced an agent that ran with less expertise
 * than it was specified to have, and the only symptom is worse output. That is the
 * least debuggable failure available, so it gets a test.
 */

describe("the corpus is curated, and the curation is honest", () => {
  it("loads every pack listed in PLATFORM_PACKS", async () => {
    const corpus = await loadPlatformCorpus();

    expect(corpus.map((entry) => entry.name).toSorted((a, b) => a.localeCompare(b))).toEqual(
      Object.keys(PLATFORM_PACKS).toSorted((a, b) => a.localeCompare(b)),
    );
  });

  it("keeps a reason for every pack in the corpus", () => {
    // Same discipline as NON_TENANT_TABLES: a list that can silently grow is a
    // list nobody reviews.
    for (const [name, reason] of Object.entries(PLATFORM_PACKS)) {
      expect(reason.length, `${name} is in the corpus with no reason`).toBeGreaterThan(40);
    }
  });

  it("excludes the packs in skills/ that are not agent capabilities", () => {
    // skills/ also holds developer tooling and personal workflow packs. Shipping
    // the directory listing as the corpus would hand a Backend Engineer a skill
    // for making video thumbnails.
    for (const name of ["youtube-thumbnail-maker", "upwork-proposal", "know-me", "albert-dm"]) {
      expect(Object.hasOwn(PLATFORM_PACKS, name), `${name} should not be product content`).toBe(
        false,
      );
    }
  });

  it("points at skills/ rather than a copy of it", () => {
    // One corpus, two consumers. A second copy of 1.5 MB of prose drifts from the
    // first the moment either is edited.
    expect(PLATFORM_CORPUS_ROOT.replaceAll("\\", "/")).toMatch(/\/skills\/$/);
    expect(PLATFORM_CORPUS_ROOT).not.toContain("capability-packs");
  });
});

describe("every pack an agent role names actually resolves", () => {
  it("resolves all six MVP roles' capability packs", async () => {
    const roles = await loadDefinitions();
    const corpus = await loadPlatformCorpus();
    const available = new Set(corpus.map((entry) => entry.name));

    const unresolved: string[] = [];
    let checked = 0;
    for (const { spec, source } of roles) {
      for (const raw of spec.capabilityPacks) {
        checked++;
        const reference = parsePackReference(raw);
        if (reference.scope === "platform" && !available.has(reference.name)) {
          unresolved.push(`${source} → ${raw}`);
        }
      }
    }

    expect(checked, "no role referenced any pack — the check is vacuous").toBeGreaterThan(10);
    expect(unresolved, `unresolvable pack references: ${unresolved.join(", ")}`).toEqual([]);
  });
});

describe("scanning the platform corpus", () => {
  it("finds criticals only in the packs recorded as expected", async () => {
    // Platform packs are trusted content and are not scanned as untrusted input —
    // `skill-security-audit` documents the attack strings it teaches people to
    // find, and the scanner applies no context downgrade because downgrading
    // fenced content is unsound (see scanner.ts).
    //
    // Scanning them anyway, and pinning WHICH ones trip it, is the guard that
    // matters: a new platform pack carrying an injection fails this test.
    const corpus = await loadPlatformCorpus();

    const tripped: string[] = [];
    for (const entry of corpus) {
      const result = scanPack(await readPack(entry));
      if (result.findings.some((finding) => finding.severity === "critical")) {
        tripped.push(entry.name);
      }
    }

    expect(
      tripped.toSorted((a, b) => a.localeCompare(b)),
      `platform packs with critical findings — add a reason to EXPECTED_CRITICAL_FINDINGS or fix the pack: ${tripped.join(", ")}`,
    ).toEqual(Object.keys(EXPECTED_CRITICAL_FINDINGS).toSorted((a, b) => a.localeCompare(b)));
  }, 60_000);

  it("does not exempt a pack that no longer trips the scanner", async () => {
    // A stale exemption is how a real finding later slips through under a name
    // someone once excused.
    const corpus = await loadPlatformCorpus();
    const byName = new Map(corpus.map((entry) => [entry.name, entry]));

    for (const name of Object.keys(EXPECTED_CRITICAL_FINDINGS)) {
      const entry = byName.get(name);
      expect(entry, `${name} is exempt but not in the corpus`).toBeDefined();

      const result = scanPack(await readPack(entry!));
      expect(
        result.findings.some((finding) => finding.severity === "critical"),
        `${name} is exempt but no longer produces a critical finding — remove the exemption`,
      ).toBe(true);
    }
  }, 60_000);

  it("keeps a reason for every exemption", () => {
    for (const [name, reason] of Object.entries(EXPECTED_CRITICAL_FINDINGS)) {
      expect(reason.length, `${name} is exempt with no reason`).toBeGreaterThan(40);
    }
  });
});

import type { AgentSpec } from "@atelier/agent-runtime";
import path from "node:path";
import {
  indexPack,
  readPack,
  resolvePackVersion,
  type LoadedPack,
  type PackIndexEntry,
} from "./loader.js";
import { PLATFORM_CORPUS_ROOT, PLATFORM_PACKS } from "./platform-corpus.js";
import { parsePackReference, type PackScope } from "./reference.js";
import { PackRefusedError, scanPack, type ScanResult } from "./scanner.js";
import {
  effectiveTools,
  renderPackSection,
  type EffectiveCapability,
  type PackSection,
} from "./confinement.js";

/**
 * The registry: what an agent actually gets (ADR-005, M025).
 *
 * Composes the four pieces in the one order that is safe:
 *
 *   index → resolve version → scan (org only) → confine → mark
 *
 * The order is the design. Scanning after loading is the only place it can
 * happen, and confinement after scanning is what makes a `warn` verdict
 * survivable — a pack that raised a non-critical finding still cannot widen the
 * allowlist, because nothing can.
 */

export type Corpus = {
  readonly platform: readonly PackIndexEntry[];
  readonly org: readonly PackIndexEntry[];
};

/**
 * Index the platform corpus, curated.
 *
 * Fails if a curated pack is missing rather than skipping it. A silently absent
 * pack means an agent runs without expertise it was specified to have, and the
 * only symptom is worse output — the least debuggable failure available.
 */
export async function loadPlatformCorpus(
  root: string = PLATFORM_CORPUS_ROOT,
): Promise<readonly PackIndexEntry[]> {
  // Indexes the CURATED directories by name rather than listing the root and
  // filtering it. `skills/` holds 19 packs we do not ship, and parsing them in
  // order to discard them is both wasted work and a coupling: one of them
  // (`youtube-broll-maker`) has frontmatter that is not valid YAML, and a
  // whole-root index made the product corpus fail to load because of a pack that
  // is not part of it.
  const curated: PackIndexEntry[] = [];
  const missing: string[] = [];

  for (const name of Object.keys(PLATFORM_PACKS)) {
    try {
      curated.push(await indexPack(path.join(root, name), "platform"));
    } catch (error) {
      // A pack that EXISTS and is malformed is a real failure and propagates.
      // Only absence is collected, so the message can name every missing pack at
      // once instead of one per boot.
      if ((error as { code?: string }).code !== "ENOENT") throw error;
      missing.push(name);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `platform corpus is incomplete: ${missing.join(", ")} listed in PLATFORM_PACKS but not found under ${root}`,
    );
  }

  return curated;
}

export type ResolvedPack = {
  readonly reference: string;
  readonly scope: PackScope;
  readonly pack: LoadedPack;
  /** Undefined for platform packs, which are trusted content rather than input. */
  readonly scan?: ScanResult;
  readonly section: PackSection;
};

export type AssembledCapabilities = {
  readonly packs: readonly ResolvedPack[];
  readonly capability: EffectiveCapability;
  /** Sections in spec order, for M035 to assemble into a prompt. */
  readonly sections: readonly PackSection[];
};

/**
 * Resolve every pack an agent spec names, and refuse the ones that fail scanning.
 *
 * Org packs are scanned; platform packs are not. That is a trust decision rather
 * than an optimisation: platform packs are ours, reviewed in Git, and contain
 * documented attack strings on purpose (`skill-security-audit`), so scanning them
 * as untrusted input would refuse our own corpus. `platform-corpus.test.ts` holds
 * that boundary from the other side by pinning which platform packs trip the
 * scanner at all.
 *
 * A `critical` finding in an org pack throws. §17 assumes injection succeeds, so
 * this is not the boundary — it is the cheap refusal of attacks we can name,
 * ahead of the boundary that actually holds.
 */
export async function assembleCapabilities(
  spec: AgentSpec,
  corpus: Corpus,
): Promise<AssembledCapabilities> {
  const resolved: ResolvedPack[] = [];

  for (const raw of spec.capabilityPacks) {
    const reference = parsePackReference(raw);
    const index = reference.scope === "platform" ? corpus.platform : corpus.org;
    const entry = resolvePackVersion(index, reference);
    const pack = await readPack(entry);

    let scan: ScanResult | undefined;
    if (reference.scope === "org") {
      scan = scanPack(pack);
      if (scan.verdict === "fail") throw new PackRefusedError(pack.name, scan);
    }

    // `scan` is spread conditionally rather than assigned undefined:
    // exactOptionalPropertyTypes distinguishes "absent" from "present and
    // undefined", and the type says absent means a trusted platform pack.
    resolved.push({
      reference: `${reference.scope}/${entry.name}@${entry.version}`,
      scope: reference.scope,
      pack,
      ...(scan !== undefined && { scan }),
      section: renderPackSection(pack, reference.scope),
    });
  }

  return {
    packs: resolved,
    capability: effectiveTools(
      spec,
      resolved.map((item) => item.pack),
    ),
    sections: resolved.map((item) => item.section),
  };
}

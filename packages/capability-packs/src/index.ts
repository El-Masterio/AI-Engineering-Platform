/**
 * Capability packs: the platform corpus, the loader, and the injection scanner
 * (ADR-005, M025).
 *
 * The load-bearing sentence is ADR-005's: "a pack can never grant a tool the
 * agent's allowlist doesn't already have. Capability is granted by the agent
 * specification, never by a document." Everything here is arranged so that stays
 * true even when a pack is fully hostile — see `confinement.ts`.
 */
export {
  indexPack,
  indexPacks,
  readPack,
  resolvePackVersion,
  PackNotFoundError,
  PackVersionMismatchError,
  type LoadedPack,
  type PackIndexEntry,
} from "./loader.js";

export {
  formatPackReference,
  parsePackReference,
  InvalidPackReferenceError,
  PACK_SCOPES,
  type PackReference,
  type PackScope,
} from "./reference.js";

export {
  scanPack,
  PackRefusedError,
  SEVERITIES,
  type Finding,
  type ScanResult,
  type Severity,
  type Verdict,
} from "./scanner.js";

export {
  effectiveTools,
  renderPackSection,
  type EffectiveCapability,
  type PackSection,
  type RefusedToolRequest,
} from "./confinement.js";

export {
  assembleCapabilities,
  loadPlatformCorpus,
  type AssembledCapabilities,
  type Corpus,
  type ResolvedPack,
} from "./registry.js";

export {
  EXPECTED_CRITICAL_FINDINGS,
  PLATFORM_CORPUS_ROOT,
  PLATFORM_PACKS,
} from "./platform-corpus.js";

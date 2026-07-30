import { z } from "zod";

/**
 * `SKILL.md` frontmatter, as a runtime schema (ADR-005).
 *
 * Lives beside the agent-spec schema for the same reason: a capability pack may
 * be authored by a customer (§13's org packs), so this is a contract with
 * untrusted input rather than an internal type. M070 adds an upload endpoint,
 * and it must reuse this validator instead of growing a looser one.
 *
 * Deliberately TOLERANT of unknown keys, which is the opposite of the agent
 * spec's strictness — and the difference is worth stating. An agent spec grants
 * capability, so an unrecognised key there is a permission nobody reviewed. A
 * pack grants nothing: it is prose that influences behaviour, with the tool
 * allowlist as its hard ceiling. The 34 packs in `skills/` already carry
 * `argument-hint`, `auto-activate`, `user-invocable` and `license` in various
 * combinations, and rejecting a pack over a key we do not read would be strict
 * about the wrong thing.
 */

/** A pack name: the directory it lives in, and how a spec refers to it. */
const packName = z
  .string()
  .regex(/^[a-z][a-z0-9-]*[a-z0-9]$/, "must be lowercase letters, digits and hyphens");

export const capabilityPackFrontmatterSchema = z.looseObject({
  name: packName,
  /**
   * The disclosure decision is made from this text alone.
   *
   * It is the only part of a pack that sits in context permanently, so a vague
   * description means the pack is either never loaded or always loaded — and
   * both defeat progressive disclosure. The lower bound is a floor on
   * usefulness, not a style rule.
   */
  description: z.string().min(40, "must be specific enough to decide relevance from (40+ chars)"),
  /**
   * Optional, defaulting to 1.
   *
   * ADR-005 says frontmatter carries a version; the seed corpus predates that
   * and carries none. Defaulting is the honest reading of an unversioned
   * document rather than a reason to rewrite 34 files that are also in daily
   * use as developer tooling — and `resolvePackVersion` still refuses to
   * silently substitute one version for another.
   */
  version: z.number().int().min(1).default(1),
  /**
   * Tools the pack would LIKE the agent to have.
   *
   * Recorded, never honoured. ADR-005: "a pack can never grant a tool the
   * agent's allowlist doesn't already have. Capability is granted by the agent
   * specification, never by a document." This field exists so that a pack asking
   * for more becomes a visible finding instead of an invisible no-op.
   */
  "requests-tools": z.array(z.string().min(1)).optional(),
});

export type CapabilityPackFrontmatter = z.output<typeof capabilityPackFrontmatterSchema>;

/**
 * A rejection that names the file and every problem in it.
 *
 * Same shape as `InvalidAgentSpecError` on purpose: at boot both are "this file
 * on disk is wrong", and one message format for that is one thing to learn.
 */
export class InvalidCapabilityPackError extends Error {
  readonly source: string;
  readonly issues: readonly { readonly path: string; readonly message: string }[];

  constructor(source: string, issues: readonly { path: string; message: string }[]) {
    const problems = issues.map((issue) => `  ${issue.path}: ${issue.message}`).join("\n");
    super(`Invalid capability pack ${source}:\n${problems}`);
    this.name = "InvalidCapabilityPackError";
    this.source = source;
    this.issues = issues;
  }
}

export function parseCapabilityPackFrontmatter(
  input: unknown,
  source = "<inline>",
): CapabilityPackFrontmatter {
  const result = capabilityPackFrontmatterSchema.safeParse(input);
  if (result.success) return result.data;

  throw new InvalidCapabilityPackError(
    source,
    result.error.issues.map((issue) => ({
      path: issue.path.map(String).join(".") || "(root)",
      message: issue.message,
    })),
  );
}

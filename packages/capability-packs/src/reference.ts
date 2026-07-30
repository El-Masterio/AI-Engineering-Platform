/**
 * How an agent spec names a capability pack.
 *
 * §13 writes `platform/backend-engineering` and `org/<customer-authored>`, so
 * the scope is part of the reference rather than inferred from a lookup order.
 * That matters for trust: a resolver that searched platform first and org second
 * would let an organization shadow a platform pack by naming a directory the
 * same thing, and the agent would be reading customer prose where it expected
 * ours.
 */

/** Who authored a pack, which decides whether it is scanned before use. */
export const PACK_SCOPES = ["platform", "org"] as const;
export type PackScope = (typeof PACK_SCOPES)[number];

export type PackReference = {
  readonly scope: PackScope;
  readonly name: string;
  /**
   * Absent means "whatever is current".
   *
   * Present means the run is PINNED (§13 rule 6: capability-pack versions are
   * pinned and recorded, so a run from six weeks ago can be explained). A pinned
   * reference that does not match what is on disk is an error rather than a
   * fallback — silently loading v4 where v3 was recorded makes the recording a
   * lie.
   */
  readonly version?: number;
};

const REFERENCE = /^(platform|org)\/([a-z][a-z0-9-]*[a-z0-9])(?:@(\d+))?$/;

export class InvalidPackReferenceError extends Error {
  constructor(reference: string) {
    super(
      `"${reference}" is not a capability pack reference. ` +
        `Expected <platform|org>/<pack-name> with an optional @version, e.g. platform/api-design@3.`,
    );
    this.name = "InvalidPackReferenceError";
  }
}

export function parsePackReference(reference: string): PackReference {
  const match = REFERENCE.exec(reference);
  if (match === null) throw new InvalidPackReferenceError(reference);

  const [, scope, name, version] = match as unknown as [string, PackScope, string, string?];
  return version === undefined ? { scope, name } : { scope, name, version: Number(version) };
}

/** The canonical string form. Always includes the version once resolved. */
export function formatPackReference(reference: PackReference): string {
  const suffix = reference.version === undefined ? "" : `@${reference.version}`;
  return `${reference.scope}/${reference.name}${suffix}`;
}

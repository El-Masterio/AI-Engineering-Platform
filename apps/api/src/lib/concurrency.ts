import { createHash } from "node:crypto";
import { conflict } from "./errors.js";

/**
 * Optimistic concurrency (§16): mutable resources return `ETag`, `PATCH`
 * accepts `If-Match`, a mismatch is `409`.
 *
 * §16 names plan editing as the case that motivates it — two users editing a
 * milestone list at once. Without this the second write silently wins and the
 * first user's edit disappears with no error anywhere, which is the worst
 * possible failure: no signal, and the data is wrong.
 */

/**
 * A strong ETag for a resource version.
 *
 * Derived from `updated_at` rather than hashing the whole row: the timestamp is
 * already indexed and already changes on every write, and hashing the body
 * would make the tag depend on field selection (`?fields=id,title` would yield
 * a different tag for the same version).
 *
 * Quoted, per RFC 9110 — an unquoted ETag is invalid and some proxies drop it.
 */
export function etagFor(version: { id: string; updatedAt: Date | string }): string {
  const updated =
    version.updatedAt instanceof Date ? version.updatedAt.toISOString() : version.updatedAt;
  const digest = createHash("sha256").update(`${version.id}:${updated}`).digest("base64url");
  return `"${digest.slice(0, 27)}"`;
}

/**
 * Enforce `If-Match`, or throw 409.
 *
 * `If-Match` is **required** on a conditional update rather than optional-if-
 * absent. Treating a missing header as "no opinion, proceed" means the client
 * that forgot it is exactly the client that overwrites someone else's work —
 * the protection would be opt-in, and the callers who most need it are the ones
 * least likely to opt in.
 *
 * `*` is accepted because RFC 9110 defines it as "any current representation",
 * which is a deliberate "I know this exists and I don't care which version".
 */
export function requireIfMatch(header: string | undefined, current: string): void {
  if (header === undefined || header.trim() === "") {
    throw conflict(
      "if_match_required",
      "This request must carry an `If-Match` header with the resource's current ETag.",
    );
  }

  const candidates = new Set(header.split(",").map((value) => value.trim()));
  if (candidates.has("*")) return;

  // A weak validator (W/"…") is not sufficient for a conditional WRITE: it
  // asserts semantic equivalence, not byte equality, and a lost update is
  // exactly the case where the difference matters.
  if (!candidates.has(current)) {
    throw conflict(
      "version_conflict",
      "This resource has changed since you last read it. Fetch it again and re-apply your change.",
    );
  }
}

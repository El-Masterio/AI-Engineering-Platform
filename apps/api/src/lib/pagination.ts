import { badRequest } from "./errors.js";

/**
 * Cursor pagination (§16).
 *
 * Cursor-only, deliberately. Offset pagination breaks under concurrent inserts:
 * `?offset=50` after a row is added at the front returns a row the caller
 * already saw and skips one they never will. §16 notes our event streams insert
 * constantly, so this is the normal case rather than the edge case.
 *
 * NFR-PERF-9 makes an unpaginated list endpoint a build failure, so this helper
 * has to be pleasant enough that nobody routes around it.
 */

export const DEFAULT_LIMIT = 25;
export const MAX_LIMIT = 100;

export type Page<T> = {
  readonly data: readonly T[];
  readonly next_cursor: string | null;
  readonly has_more: boolean;
};

/**
 * The opaque part of a cursor.
 *
 * Base64url of a JSON object. Opaque to CLIENTS — a cursor is a position, not a
 * contract, and clients that parse them stop us changing sort order. It is not
 * a secret: anyone can decode it, so a cursor must never carry an id the caller
 * could not otherwise obtain.
 */
export type CursorPayload = Record<string, string | number>;

export function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

/**
 * Decode a cursor, or reject the request.
 *
 * A malformed cursor is the caller's fault (400), never a 500. It arrives from
 * hand-edited URLs constantly, and a stack trace on every one of them buries
 * the real errors.
 */
export function decodeCursor(cursor: string): CursorPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
  } catch {
    throw badRequest("invalid_cursor", "The cursor is not valid.");
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw badRequest("invalid_cursor", "The cursor is not valid.");
  }
  return parsed as CursorPayload;
}

/**
 * Validate `limit`, or reject.
 *
 * Over-limit is REFUSED rather than clamped. Silently returning 100 when 5000
 * was asked for means the caller believes they have the whole list, and the
 * bug surfaces much later as missing data. §16 sets the ceiling; the acceptance
 * criterion for this milestone is that it is enforced, not accommodated.
 */
const ABSENT = new Set<unknown>([undefined, null, ""]);

export function parseLimit(raw: unknown): number {
  if (ABSENT.has(raw)) return DEFAULT_LIMIT;

  const limit = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isSafeInteger(limit)) {
    throw badRequest("invalid_limit", "`limit` must be a whole number.");
  }
  if (limit < 1) {
    throw badRequest("invalid_limit", "`limit` must be at least 1.");
  }
  if (limit > MAX_LIMIT) {
    throw badRequest("invalid_limit", `\`limit\` may not exceed ${MAX_LIMIT}.`);
  }
  return limit;
}

/**
 * Build a page from rows fetched with `limit + 1`.
 *
 * Fetching one extra row is how `has_more` is answered without a second COUNT
 * query — and a COUNT over a large tenant-scoped table is exactly the query
 * that turns a list endpoint into a performance incident.
 */
export function toPage<T>(
  rows: readonly T[],
  limit: number,
  cursorFor: (row: T) => CursorPayload,
): Page<T> {
  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const last = data.at(-1);

  return {
    data,
    next_cursor: hasMore && last !== undefined ? encodeCursor(cursorFor(last)) : null,
    has_more: hasMore,
  };
}

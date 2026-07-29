import { describe, expect, it } from "vitest";
import { etagFor, requireIfMatch } from "./concurrency.js";
import { isApiError } from "./errors.js";

const version = { id: "org-1", updatedAt: new Date("2026-07-29T10:00:00Z") };

describe("etagFor", () => {
  it("is quoted, per RFC 9110", () => {
    // An unquoted ETag is invalid and some proxies drop it.
    expect(etagFor(version)).toMatch(/^".+"$/);
  });

  it("changes when the version changes", () => {
    const later = { id: "org-1", updatedAt: new Date("2026-07-29T10:00:01Z") };
    expect(etagFor(later)).not.toBe(etagFor(version));
  });

  it("differs between resources updated at the same instant", () => {
    const other = { id: "org-2", updatedAt: version.updatedAt };
    expect(etagFor(other)).not.toBe(etagFor(version));
  });

  it("is stable across equivalent Date and ISO string inputs", () => {
    expect(etagFor({ id: "org-1", updatedAt: "2026-07-29T10:00:00.000Z" })).toBe(etagFor(version));
  });
});

describe("requireIfMatch", () => {
  const current = etagFor(version);

  it("passes when the tag matches", () => {
    expect(() => requireIfMatch(current, current)).not.toThrow();
  });

  it("REQUIRES the header rather than proceeding without it", () => {
    // Treating a missing header as "no opinion, proceed" makes the protection
    // opt-in, and the caller who forgot it is the one who overwrites someone
    // else's work.
    for (const absent of [undefined, "", " ".repeat(3)]) {
      const error = capture(() => requireIfMatch(absent, current));
      expect(isApiError(error), `proceeded with ${JSON.stringify(absent)}`).toBe(true);
      expect((error as { code: string }).code).toBe("if_match_required");
    }
  });

  it("is a 409 on mismatch (§16)", () => {
    const error = capture(() => requireIfMatch('"stale-etag-value"', current));
    expect((error as { status: number }).status).toBe(409);
    expect((error as { code: string }).code).toBe("version_conflict");
  });

  it("accepts * as a deliberate override", () => {
    expect(() => requireIfMatch("*", current)).not.toThrow();
  });

  it("accepts a list containing the current tag", () => {
    expect(() => requireIfMatch(`"other", ${current}`, current)).not.toThrow();
  });

  it("rejects a WEAK validator for a conditional write", () => {
    // W/ asserts semantic equivalence, not byte equality, and a lost update is
    // exactly where the difference matters.
    const error = capture(() => requireIfMatch(`W/${current}`, current));
    expect(isApiError(error), "a weak validator was accepted for a write").toBe(true);
  });

  it("does not leak the current tag in the conflict message", () => {
    const error = capture(() => requireIfMatch('"stale"', current));
    expect((error as Error).message).not.toContain(current);
  });
});

function capture(run: () => unknown): unknown {
  try {
    run();
  } catch (error: unknown) {
    return error;
  }
  return undefined;
}

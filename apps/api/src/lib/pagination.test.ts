import { describe, expect, it } from "vitest";
import {
  DEFAULT_LIMIT,
  MAX_LIMIT,
  decodeCursor,
  encodeCursor,
  parseLimit,
  toPage,
} from "./pagination.js";
import { isApiError } from "./errors.js";

describe("parseLimit", () => {
  it("defaults to 25", () => {
    expect(parseLimit(undefined)).toBe(DEFAULT_LIMIT);
    expect(parseLimit("")).toBe(DEFAULT_LIMIT);
    expect(parseLimit(null)).toBe(DEFAULT_LIMIT);
  });

  it("accepts a value inside the range, as a string or a number", () => {
    expect(parseLimit("50")).toBe(50);
    expect(parseLimit(50)).toBe(50);
    expect(parseLimit(MAX_LIMIT)).toBe(MAX_LIMIT);
  });

  it("REFUSES over the maximum rather than clamping", () => {
    // The M016 acceptance criterion. Clamping would tell a caller asking for
    // 5000 that they have the whole list, and the bug surfaces much later as
    // missing data.
    const error = captureError(() => parseLimit(5000));
    expect(isApiError(error)).toBe(true);
    expect((error as { status: number }).status).toBe(400);
    expect((error as { code: string }).code).toBe("invalid_limit");
  });

  it("rejects zero, negatives and fractions", () => {
    for (const bad of [0, -1, 1.5, "1.5"]) {
      expect(isApiError(captureError(() => parseLimit(bad))), `accepted ${bad}`).toBe(true);
    }
  });

  it("rejects nonsense instead of coercing it to NaN", () => {
    expect(isApiError(captureError(() => parseLimit("all")))).toBe(true);
  });
});

describe("cursors", () => {
  it("round-trip", () => {
    const payload = { id: "abc", createdAt: 1_700_000_000_000 };
    expect(decodeCursor(encodeCursor(payload))).toEqual(payload);
  });

  it("are base64url, so they survive a query string unescaped", () => {
    const encoded = encodeCursor({ id: "a+b/c=d" });
    expect(encoded).not.toContain("+");
    expect(encoded).not.toContain("/");
    expect(encoded).not.toContain("=");
  });

  it("reject a malformed cursor as a 400, never a 500", () => {
    // Hand-edited URLs produce these constantly; a stack trace on each one
    // buries the real errors.
    for (const bad of ["not-base64!", "", encodeCursorRaw("[1,2,3]"), encodeCursorRaw("null")]) {
      const error = captureError(() => decodeCursor(bad));
      expect(isApiError(error), `accepted ${bad}`).toBe(true);
      expect((error as { status: number }).status).toBe(400);
    }
  });
});

describe("toPage", () => {
  const rows = Array.from({ length: 6 }, (_, i) => ({ id: `r${i}` }));

  it("reports has_more and trims the extra row when the page is full", () => {
    // Fetching limit+1 is how has_more is answered without a COUNT — and a
    // COUNT over a large tenant-scoped table is a performance incident.
    const page = toPage(rows, 5, (row) => ({ id: row.id }));
    expect(page.data).toHaveLength(5);
    expect(page.has_more).toBe(true);
    expect(page.next_cursor).not.toBeNull();
  });

  it("reports the end of the list", () => {
    const page = toPage(rows.slice(0, 3), 5, (row) => ({ id: row.id }));
    expect(page.data).toHaveLength(3);
    expect(page.has_more).toBe(false);
    expect(page.next_cursor).toBeNull();
  });

  it("points the cursor at the LAST returned row, not the extra one", () => {
    // Pointing at the unreturned row would skip it on the next page.
    const page = toPage(rows, 5, (row) => ({ id: row.id }));
    expect(decodeCursor(page.next_cursor as string)).toEqual({ id: "r4" });
  });

  it("handles an empty result", () => {
    const page = toPage([], 5, () => ({ id: "x" }));
    expect(page).toEqual({ data: [], next_cursor: null, has_more: false });
  });
});

function captureError(run: () => unknown): unknown {
  try {
    run();
  } catch (error: unknown) {
    return error;
  }
  return undefined;
}

function encodeCursorRaw(json: string): string {
  return Buffer.from(json, "utf8").toString("base64url");
}

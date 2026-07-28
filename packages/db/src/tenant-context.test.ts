import { describe, expect, it } from "vitest";
import { v7 as uuidv7 } from "uuid";
import {
  createTenantContext,
  isOrganizationId,
  toOrganizationId,
  type OrganizationId,
  type ScopedTransaction,
  type TenantContext,
} from "./tenant-context.js";
import { OrganizationRepository } from "./repository.js";

/**
 * M004 acceptance: "a repository call without `TenantContext` fails to compile."
 *
 * The assertions below are `@ts-expect-error`, which is a compile-time test in
 * disguise: if the line it guards ever STOPS being an error, `@ts-expect-error`
 * becomes an error itself and `pnpm typecheck` fails. So this file fails the
 * build both when the guard is too weak and when someone deletes it.
 *
 * That makes the criterion enforceable rather than a claim in a document. Note
 * these checks are not exercised by running the test — they are exercised by
 * type-checking the file, which `packages/db/tsconfig.json` includes.
 */

describe("OrganizationId is not just a string", () => {
  it("accepts a UUID", () => {
    const id = uuidv7();
    expect(isOrganizationId(id)).toBe(true);
    expect(toOrganizationId(id)).toBe(id);
  });

  it("rejects anything else, at the boundary rather than at the query", () => {
    for (const bad of ["", "acme", "not-a-uuid", "../../etc/passwd", "1 OR 1=1"]) {
      expect(isOrganizationId(bad)).toBe(false);
      expect(() => toOrganizationId(bad)).toThrow(TypeError);
    }
  });

  it("freezes the context so it cannot be re-pointed after construction", () => {
    const context = createTenantContext(uuidv7());
    expect(Object.isFrozen(context)).toBe(true);
  });
});

describe("compile-time guards", () => {
  it("documents what the type system rejects", () => {
    // Everything meaningful in this test happens at compile time; the runtime
    // body only exists so the file is also a test.
    expect(true).toBe(true);
  });
});

// ── Compile-time assertions ─────────────────────────────────────────────────
// Type-checked, never executed. The condition reads an environment variable
// that is never set, which the compiler cannot fold to `false` — so the body is
// fully checked. A literal `if (false)` would be neater but the base tsconfig
// sets `allowUnreachableCode: false`, and it is right to.
if (process.env["ATELIER_TYPE_GUARDS_UNREACHABLE"] === "1") {
  const scoped = {} as ScopedTransaction;
  const context: TenantContext = createTenantContext(uuidv7());
  const rawTransaction = {} as { unsafe: (q: string) => Promise<unknown> };

  // The safe call: both a scoped handle and a context.
  void OrganizationRepository.forTenant(scoped, context);

  // @ts-expect-error — a repository cannot be built without a TenantContext.
  void OrganizationRepository.forTenant(scoped);

  // @ts-expect-error — nor from an unscoped connection, however well-formed.
  void OrganizationRepository.forTenant(rawTransaction, context);

  // @ts-expect-error — a raw string is not an OrganizationId; it must be validated.
  const unchecked: OrganizationId = "11111111-1111-7111-8111-111111111111";
  void unchecked;

  // @ts-expect-error — nor can a context be assembled by hand around one.
  const handRolled: TenantContext = { organizationId: "acme" };
  void handRolled;

  // @ts-expect-error — the context is readonly; it cannot be swapped mid-flight.
  context.organizationId = toOrganizationId(uuidv7());
}

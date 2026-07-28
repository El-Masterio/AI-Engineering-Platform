import { describe, expect, it } from "vitest";
import { fixedClock, toTimestamp } from "../ports/clock.port.js";
import { isDomainError } from "../errors/domain-error.js";
import {
  changeEmail,
  isEmailVerified,
  isValidEmail,
  normalizeEmail,
  registerUser,
  renameUser,
  verifyEmail,
} from "./user.js";

const clock = fixedClock(toTimestamp(1_700_000_000_000));
const later = fixedClock(toTimestamp(1_700_000_060_000));

function expectDomainError(work: () => unknown, code: string): void {
  let thrown: unknown;
  try {
    work();
  } catch (error: unknown) {
    thrown = error;
  }
  expect(isDomainError(thrown), `expected a DomainError, got ${String(thrown)}`).toBe(true);
  expect((thrown as { code: string }).code).toBe(code);
}

describe("email validity", () => {
  it.each(["ada@example.test", "ada.lovelace@example.co.uk", "ada+tagged@example.test", "a@b.co"])(
    "accepts %s",
    (email) => {
      expect(isValidEmail(email)).toBe(true);
    },
  );

  it.each([
    ["", "empty"],
    ["ada", "no domain"],
    ["ada@", "no host"],
    ["@example.test", "no local part"],
    ["ada@example", "no TLD"],
    ["ada @example.test", "space"],
    ["two@at@example.test", "two ats"],
  ])("rejects %j (%s)", (email) => {
    expect(isValidEmail(email)).toBe(false);
  });

  it("rejects an address over the RFC 5321 length limit", () => {
    expect(isValidEmail(`${"x".repeat(250)}@example.test`)).toBe(false);
  });
});

describe("normalizeEmail", () => {
  it("lowercases and trims", () => {
    expect(normalizeEmail(`${" ".repeat(2)}Ada@Example.TEST `)).toBe("ada@example.test");
  });

  it("does NOT strip dots or +tags", () => {
    // Those are Gmail conventions, not standards. Treating a.b@ and ab@ as one
    // person merges two real accounts, which is worse than a duplicate signup.
    expect(normalizeEmail("a.b+tag@example.test")).toBe("a.b+tag@example.test");
  });
});

describe("registerUser", () => {
  it("stores the normalised address", () => {
    expect(
      registerUser({ id: "u1", email: `${" ".repeat(2)}Ada@Example.TEST ` }, clock).email,
    ).toBe("ada@example.test");
  });

  it("omits an empty name rather than storing one", () => {
    const user = registerUser({ id: "u1", email: "ada@example.test", name: " ".repeat(3) }, clock);
    expect(Object.hasOwn(user, "name")).toBe(false);
  });

  it("trims a name it keeps", () => {
    const user = registerUser({ id: "u1", email: "ada@example.test", name: " Ada " }, clock);
    expect(user.name).toBe("Ada");
  });

  it("rejects an invalid address", () => {
    expectDomainError(() => registerUser({ id: "u1", email: "nope" }, clock), "INVALID_EMAIL");
  });

  it("rejects an over-long name", () => {
    expectDomainError(
      () => registerUser({ id: "u1", email: "ada@example.test", name: "x".repeat(121) }, clock),
      "INVALID_NAME",
    );
  });

  it("starts unverified", () => {
    expect(isEmailVerified(registerUser({ id: "u1", email: "ada@example.test" }, clock))).toBe(
      false,
    );
  });
});

describe("verifyEmail", () => {
  it("stamps verification", () => {
    const verified = verifyEmail(
      registerUser({ id: "u1", email: "ada@example.test" }, clock),
      later,
    );
    expect(verified.emailVerifiedAt).toBe(later.now());
  });

  it("keeps the FIRST verification when called twice", () => {
    const once = verifyEmail(registerUser({ id: "u1", email: "ada@example.test" }, clock), clock);
    const twice = verifyEmail(once, later);

    expect(twice.emailVerifiedAt).toBe(clock.now());
    expect(twice).toBe(once);
  });
});

describe("changeEmail", () => {
  it("invalidates verification", () => {
    // Otherwise someone verifies a throwaway address and then swaps in one they
    // do not own.
    const verified = verifyEmail(
      registerUser({ id: "u1", email: "ada@example.test" }, clock),
      clock,
    );
    const changed = changeEmail(verified, "new@example.test", later);

    expect(isEmailVerified(changed)).toBe(false);
    expect(Object.hasOwn(changed, "emailVerifiedAt")).toBe(false);
  });

  it("is a no-op when the address only differs by case or spacing", () => {
    const verified = verifyEmail(
      registerUser({ id: "u1", email: "ada@example.test" }, clock),
      clock,
    );
    const same = changeEmail(verified, `${" ".repeat(2)}ADA@EXAMPLE.TEST${" ".repeat(2)}`, later);

    expect(same).toBe(verified);
    expect(isEmailVerified(same)).toBe(true);
  });

  it("rejects an invalid address", () => {
    const user = registerUser({ id: "u1", email: "ada@example.test" }, clock);
    expectDomainError(() => changeEmail(user, "nope", later), "INVALID_EMAIL");
  });
});

describe("renameUser", () => {
  it("trims", () => {
    const user = registerUser({ id: "u1", email: "ada@example.test" }, clock);
    expect(renameUser(user, `${" ".repeat(2)}Ada Lovelace${" ".repeat(2)}`, later).name).toBe(
      "Ada Lovelace",
    );
  });

  it("rejects blank and over-long names", () => {
    const user = registerUser({ id: "u1", email: "ada@example.test" }, clock);
    expectDomainError(() => renameUser(user, " ".repeat(3), later), "INVALID_NAME");
    expectDomainError(() => renameUser(user, "x".repeat(121), later), "INVALID_NAME");
  });

  it("does not mutate the original", () => {
    const user = registerUser({ id: "u1", email: "ada@example.test", name: "Ada" }, clock);
    renameUser(user, "Grace", later);
    expect(user.name).toBe("Ada");
  });
});

import { describe, expect, it } from "vitest";
import { RESERVED_SLUGS, isValidSlug } from "./organization.js";
import { personalOrganizationName, personalOrganizationSlug } from "./personal-organization.js";

describe("personalOrganizationSlug", () => {
  it("uses the local part of the address", () => {
    expect(personalOrganizationSlug("ada@example.test")).toBe("ada");
  });

  it("drops a +tag, because two addresses differing only by tag are one person", () => {
    expect(personalOrganizationSlug("ada+work@example.test")).toBe("ada");
    expect(personalOrganizationSlug("ada+work@example.test")).toBe(
      personalOrganizationSlug("ada@example.test"),
    );
  });

  it("turns dots and other punctuation into single hyphens", () => {
    expect(personalOrganizationSlug("Ada.Lovelace@example.test")).toBe("ada-lovelace");
    expect(personalOrganizationSlug("ada..lovelace@example.test")).toBe("ada-lovelace");
    expect(personalOrganizationSlug("ada_lovelace@example.test")).toBe("ada-lovelace");
  });

  it("lowercases", () => {
    expect(personalOrganizationSlug("ADA@EXAMPLE.TEST")).toBe("ada");
  });

  it("never starts or ends with a hyphen", () => {
    expect(personalOrganizationSlug("-ada-@example.test")).toBe("ada");
    expect(personalOrganizationSlug("...ada...@example.test")).toBe("ada");
  });

  it("falls back to a usable name when the local part yields nothing", () => {
    // An address of pure punctuation would otherwise produce an empty slug and
    // a constraint violation at insert time.
    expect(personalOrganizationSlug("+++@example.test")).toBe("workspace");
    expect(isValidSlug(personalOrganizationSlug("...@example.test"))).toBe(true);
  });

  it("disambiguates a RESERVED slug on the first attempt", () => {
    // `admin@example.test` is a real address shape. Offering `admin` and having
    // it rejected would waste a round trip on every such signup.
    for (const reserved of ["admin", "api", "settings", "www"]) {
      const slug = personalOrganizationSlug(`${reserved}@example.test`);
      expect(slug, `${reserved} was offered unchanged`).not.toBe(reserved);
      expect(isValidSlug(slug)).toBe(true);
    }
  });

  it("produces a different slug for each attempt", () => {
    const slugs = [0, 1, 2, 3].map((attempt) =>
      personalOrganizationSlug("ada@example.test", attempt),
    );
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(slugs[0]).toBe("ada");
  });

  it("stays a valid slug at every attempt", () => {
    for (let attempt = 0; attempt < 25; attempt++) {
      expect(isValidSlug(personalOrganizationSlug("ada@example.test", attempt))).toBe(true);
    }
  });

  it("respects the 63-character limit even with a suffix", () => {
    const long = `${"a".repeat(200)}@example.test`;
    for (const attempt of [0, 1, 99]) {
      const slug = personalOrganizationSlug(long, attempt);
      expect(slug.length).toBeLessThanOrEqual(63);
      expect(isValidSlug(slug), `attempt ${attempt} produced ${slug}`).toBe(true);
    }
  });

  it("never truncates into a trailing hyphen", () => {
    // Slicing a long seed can land exactly on a separator, which would make an
    // invalid slug out of a valid one.
    const seed = `${"ab-".repeat(40)}@example.test`;
    for (let attempt = 0; attempt < 10; attempt++) {
      expect(personalOrganizationSlug(seed, attempt)).not.toMatch(/-$/);
    }
  });

  it("rejects a nonsense attempt rather than guessing", () => {
    expect(() => personalOrganizationSlug("ada@example.test", -1)).toThrow(RangeError);
    expect(() => personalOrganizationSlug("ada@example.test", 1.5)).toThrow(RangeError);
  });

  it("never produces a reserved slug at any attempt", () => {
    for (const reserved of RESERVED_SLUGS) {
      for (let attempt = 0; attempt < 3; attempt++) {
        expect(personalOrganizationSlug(`${reserved}@example.test`, attempt)).not.toBe(reserved);
      }
    }
  });
});

describe("personalOrganizationName", () => {
  it("prefers the user's name", () => {
    expect(personalOrganizationName({ name: "Ada Lovelace", slug: "ada" })).toBe("Ada Lovelace");
  });

  it("trims", () => {
    expect(
      personalOrganizationName({ name: `${" ".repeat(2)}Ada${" ".repeat(2)}`, slug: "ada" }),
    ).toBe("Ada");
  });

  it("falls back to the SLUG, never the email address", () => {
    // An organization name is shown to everyone invited into it later.
    expect(personalOrganizationName({ slug: "ada" })).toBe("ada");
    expect(personalOrganizationName({ name: " ".repeat(3), slug: "ada" })).toBe("ada");
  });
});

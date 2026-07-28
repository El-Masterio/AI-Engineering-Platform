import { describe, expect, it } from "vitest";
import { fixedClock, toTimestamp } from "../ports/clock.port.js";
import { isDomainError } from "../errors/domain-error.js";
import {
  archiveOrganization,
  assertValidName,
  changePlan,
  createOrganization,
  isArchived,
  isValidSlug,
  renameOrganization,
  restoreOrganization,
  type OrganizationPlan,
} from "./organization.js";

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

const valid = { id: "org-1", slug: "northwind", name: "Northwind Traders" };

describe("slug rules", () => {
  it.each(["a", "ab", "north-wind", "acme2", "a-b-c", "x".repeat(63)])("accepts %s", (slug) => {
    expect(isValidSlug(slug)).toBe(true);
  });

  it.each([
    ["", "empty"],
    ["-leading", "leading hyphen"],
    ["trailing-", "trailing hyphen"],
    ["Upper", "uppercase"],
    ["has space", "space"],
    ["under_score", "underscore"],
    ["dot.dot", "dot"],
    ["x".repeat(64), "too long"],
  ])("rejects %j (%s)", (slug) => {
    expect(isValidSlug(slug)).toBe(false);
    expectDomainError(() => createOrganization({ ...valid, slug }, clock), "INVALID_SLUG");
  });

  it.each(["admin", "api", "settings", "login", "www"])("rejects the reserved slug %s", (slug) => {
    // These would collide with routes, or read as system pages in a URL.
    expect(isValidSlug(slug)).toBe(false);
    expectDomainError(() => createOrganization({ ...valid, slug }, clock), "INVALID_SLUG");
  });
});

describe("name rules", () => {
  it("rejects blank and whitespace-only names", () => {
    for (const name of ["", " ".repeat(3), "\t\n"]) {
      expectDomainError(() => assertValidName(name), "INVALID_NAME");
    }
  });

  it("rejects a name over 120 characters", () => {
    expectDomainError(() => assertValidName("x".repeat(121)), "INVALID_NAME");
  });

  it("trims on the way in", () => {
    // Leading whitespace is invisible and breaks sorting; every caller would
    // otherwise have to remember to handle it.
    const organization = createOrganization(
      { ...valid, name: `${" ".repeat(2)}Northwind${" ".repeat(2)}` },
      clock,
    );
    expect(organization.name).toBe("Northwind");
  });
});

describe("createOrganization", () => {
  it("defaults to the free plan", () => {
    expect(createOrganization(valid, clock).plan).toBe("free");
  });

  it("stamps both timestamps from the injected clock", () => {
    const organization = createOrganization(valid, clock);
    expect(organization.createdAt).toBe(clock.now());
    expect(organization.updatedAt).toBe(clock.now());
  });

  it("rejects an unknown plan", () => {
    expectDomainError(
      () => createOrganization({ ...valid, plan: "unlimited" as OrganizationPlan }, clock),
      "INVALID_PLAN",
    );
  });
});

describe("mutating operations return new values", () => {
  it("renameOrganization does not touch the original", () => {
    const original = createOrganization(valid, clock);
    const renamed = renameOrganization(original, "Northwind Ltd", later);

    expect(original.name).toBe("Northwind Traders");
    expect(renamed.name).toBe("Northwind Ltd");
    expect(renamed.updatedAt).toBe(later.now());
    expect(renamed.createdAt).toBe(original.createdAt);
  });

  it("changePlan does not touch the original", () => {
    const original = createOrganization(valid, clock);
    const upgraded = changePlan(original, "team", later);

    expect(original.plan).toBe("free");
    expect(upgraded.plan).toBe("team");
  });

  it("rejects an invalid rename", () => {
    const organization = createOrganization(valid, clock);
    expectDomainError(() => renameOrganization(organization, " ".repeat(2), later), "INVALID_NAME");
  });

  it("rejects an invalid plan change", () => {
    const organization = createOrganization(valid, clock);
    expectDomainError(
      () => changePlan(organization, "platinum" as OrganizationPlan, later),
      "INVALID_PLAN",
    );
  });
});

describe("archiving", () => {
  it("marks the organization archived", () => {
    const archived = archiveOrganization(createOrganization(valid, clock), later);
    expect(isArchived(archived)).toBe(true);
    expect(archived.archivedAt).toBe(later.now());
  });

  it("refuses to archive twice", () => {
    // Re-archiving usually means two operators are acting on the same thing, or
    // a retry is doing something it should not. Saying so beats silence.
    const archived = archiveOrganization(createOrganization(valid, clock), later);
    expectDomainError(() => archiveOrganization(archived, later), "ALREADY_ARCHIVED");
  });

  it("restores, clearing the marker entirely", () => {
    const archived = archiveOrganization(createOrganization(valid, clock), later);
    const restored = restoreOrganization(archived, later);

    expect(isArchived(restored)).toBe(false);
    expect(Object.hasOwn(restored, "archivedAt")).toBe(false);
  });

  it("restoring a live organization is a no-op rather than an error", () => {
    const organization = createOrganization(valid, clock);
    expect(restoreOrganization(organization, later)).toBe(organization);
  });
});

import { DomainError } from "../errors/domain-error.js";
import type { Clock, Timestamp } from "../ports/clock.port.js";

/**
 * Organization — the tenant.
 *
 * Immutable. Every operation returns a new value rather than mutating, so a
 * caller cannot hold a reference that changes underneath it and no invariant
 * can be bypassed by assigning to a field. The cost is an object allocation;
 * the benefit is that "how did this end up in that state" always has an answer.
 *
 * Validation lives in the constructor functions, not in the type. A
 * `Organization` that exists is one that satisfied its invariants when it was
 * made — there is no other way to obtain one.
 */

export const ORGANIZATION_PLANS = ["free", "team", "enterprise"] as const;
export type OrganizationPlan = (typeof ORGANIZATION_PLANS)[number];

export type Organization = {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly plan: OrganizationPlan;
  readonly createdAt: Timestamp;
  readonly updatedAt: Timestamp;
  readonly archivedAt?: Timestamp;
};

/**
 * DNS-label shape: it appears in URLs and, later, in subdomains.
 * Lowercase, alphanumeric and single hyphens, never leading or trailing.
 */
const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/** Postgres would reject longer, and a 300-character name is a display bug. */
const NAME_MAX_LENGTH = 120;

/** Reserved because they would collide with routes or be confusing in a URL. */
export const RESERVED_SLUGS = new Set([
  "admin",
  "api",
  "app",
  "assets",
  "auth",
  "billing",
  "dashboard",
  "docs",
  "help",
  "internal",
  "login",
  "logout",
  "new",
  "settings",
  "signup",
  "static",
  "status",
  "support",
  "system",
  "www",
]);

export function isValidSlug(value: string): boolean {
  return SLUG_PATTERN.test(value) && !RESERVED_SLUGS.has(value);
}

/** @throws {DomainError} INVALID_SLUG */
export function assertValidSlug(value: string): void {
  if (!SLUG_PATTERN.test(value)) {
    throw new DomainError(
      "INVALID_SLUG",
      "A slug must be 1–63 characters of lowercase letters, digits and hyphens, " +
        "and may not start or end with a hyphen.",
      "slug",
    );
  }
  if (RESERVED_SLUGS.has(value)) {
    throw new DomainError("INVALID_SLUG", `"${value}" is reserved.`, "slug");
  }
}

/** @throws {DomainError} INVALID_NAME */
export function assertValidName(value: string): void {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new DomainError("INVALID_NAME", "A name cannot be blank.", "name");
  }
  if (trimmed.length > NAME_MAX_LENGTH) {
    throw new DomainError(
      "INVALID_NAME",
      `A name cannot exceed ${NAME_MAX_LENGTH} characters.`,
      "name",
    );
  }
}

export type CreateOrganizationInput = {
  id: string;
  slug: string;
  name: string;
  plan?: OrganizationPlan;
};

/**
 * @throws {DomainError} INVALID_SLUG, INVALID_NAME, INVALID_PLAN
 */
export function createOrganization(input: CreateOrganizationInput, clock: Clock): Organization {
  assertValidSlug(input.slug);
  assertValidName(input.name);

  const plan = input.plan ?? "free";
  if (!ORGANIZATION_PLANS.includes(plan)) {
    throw new DomainError("INVALID_PLAN", `Unknown plan "${plan}".`, "plan");
  }

  const now = clock.now();
  return {
    id: input.id,
    slug: input.slug,
    // Stored trimmed. Leading whitespace in a display name is invisible and
    // breaks sorting, and every caller would otherwise have to remember.
    name: input.name.trim(),
    plan,
    createdAt: now,
    updatedAt: now,
  };
}

/** @throws {DomainError} INVALID_NAME */
export function renameOrganization(
  organization: Organization,
  name: string,
  clock: Clock,
): Organization {
  assertValidName(name);
  return { ...organization, name: name.trim(), updatedAt: clock.now() };
}

/** @throws {DomainError} INVALID_PLAN */
export function changePlan(
  organization: Organization,
  plan: OrganizationPlan,
  clock: Clock,
): Organization {
  if (!ORGANIZATION_PLANS.includes(plan)) {
    throw new DomainError("INVALID_PLAN", `Unknown plan "${plan}".`, "plan");
  }
  return { ...organization, plan, updatedAt: clock.now() };
}

export function isArchived(organization: Organization): boolean {
  return organization.archivedAt !== undefined;
}

/**
 * Archiving is idempotent in effect but not silently so.
 *
 * Re-archiving usually means two operators are acting on the same thing, or a
 * retry is doing something it should not. Saying so is more useful than
 * quietly returning the same value.
 *
 * @throws {DomainError} ALREADY_ARCHIVED
 */
export function archiveOrganization(organization: Organization, clock: Clock): Organization {
  if (isArchived(organization)) {
    throw new DomainError("ALREADY_ARCHIVED", `"${organization.slug}" is already archived.`);
  }
  const now = clock.now();
  return { ...organization, archivedAt: now, updatedAt: now };
}

export function restoreOrganization(organization: Organization, clock: Clock): Organization {
  if (!isArchived(organization)) return organization;
  const { archivedAt: _archivedAt, ...rest } = organization;
  return { ...rest, updatedAt: clock.now() };
}

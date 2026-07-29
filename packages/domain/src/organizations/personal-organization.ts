import { RESERVED_SLUGS, isValidSlug } from "./organization.js";

/**
 * The organization every user gets on signup (FR-ORG-1).
 *
 * FR-ORG-1 says a user belongs to at least one organization from the moment
 * they exist. That is not a convenience: FR-ORG-2 scopes **all** domain data by
 * `organization_id`, so a user with no organization is a user who cannot own
 * anything. The alternative — nullable tenancy until someone creates an org —
 * puts a null check on every scoped query forever.
 *
 * This file derives the *name* of that organization and nothing else. Creating
 * it is the database's job, because it has to be atomic with the membership.
 */

/** Postgres would reject longer; §15's slug column allows 63. */
const SLUG_MAX_LENGTH = 63;

/**
 * The local part of an email, reduced to a DNS label.
 *
 * Deliberately lossy. `Ada.Lovelace+work@example.test` becomes `ada-lovelace`:
 * the tag is dropped because it is routing information rather than identity,
 * and dots become hyphens because a slug appears in a URL and later in a
 * subdomain.
 */
function slugSeedFromEmail(email: string): string {
  const [localPart = ""] = email.split("@", 1);

  const [beforeTag = ""] = localPart.toLowerCase().split("+", 1);

  const cleaned = beforeTag
    // Anything that is not a DNS label character becomes a separator.
    .replaceAll(/[^a-z0-9]+/g, "-")
    // Collapse runs and trim, so `a..b` and `a-b` agree, and `-a-` loses both.
    .replaceAll(/-{2,}/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "")
    .slice(0, SLUG_MAX_LENGTH);

  // An address made entirely of punctuation leaves nothing usable.
  return cleaned.length === 0 ? "workspace" : cleaned;
}

/**
 * Candidate slugs for a personal organization, in preference order.
 *
 * A generator rather than a single value because slugs are unique and the
 * caller cannot know what is taken without asking the database. Returning one
 * value would push a retry loop into every call site, and each site would
 * invent a different disambiguator.
 *
 * `attempt` 0 is the bare seed; later attempts append a numeric suffix. The
 * sequence is deterministic, which is what makes the retry testable.
 *
 * @throws {RangeError} if `attempt` is not a non-negative integer.
 */
export function personalOrganizationSlug(email: string, attempt = 0): string {
  if (!Number.isSafeInteger(attempt) || attempt < 0) {
    throw new RangeError(`attempt must be a non-negative integer, got ${attempt}`);
  }

  const seed = slugSeedFromEmail(email);

  // A seed that collides with a reserved word is disambiguated on the FIRST
  // attempt rather than being offered and rejected — `admin@example.test`
  // would otherwise always waste a round trip.
  const suffix = attempt === 0 ? "" : `-${attempt + 1}`;
  const requiresSuffix = suffix !== "" || RESERVED_SLUGS.has(seed);
  const resolvedSuffix = requiresSuffix && suffix === "" ? "-1" : suffix;

  // Trim the seed, not the suffix: the suffix is what makes it unique.
  const room = SLUG_MAX_LENGTH - resolvedSuffix.length;
  const candidate = `${seed.slice(0, room).replace(/-+$/, "")}${resolvedSuffix}`;

  // Defensive: every path above should already produce a valid slug, and if one
  // ever does not, failing here beats writing an unusable row.
  if (!isValidSlug(candidate)) {
    throw new RangeError(`derived an invalid slug from ${JSON.stringify(email)}: ${candidate}`);
  }
  return candidate;
}

/**
 * Display name for the personal organization.
 *
 * The user's name when there is one, because "Ada Lovelace" reads better in a
 * switcher than "ada-lovelace". Falls back to the slug rather than to the email
 * address — an organization name is shown to other people once anyone is
 * invited, and leaking an address there is a privacy problem nobody asked for.
 */
export function personalOrganizationName(input: { name?: string; slug: string }): string {
  const trimmed = input.name?.trim();
  return trimmed !== undefined && trimmed.length > 0 ? trimmed : input.slug;
}

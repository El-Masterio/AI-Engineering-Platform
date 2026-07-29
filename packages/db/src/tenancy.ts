import { and, eq, isNull } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { personalOrganizationName, personalOrganizationSlug } from "@atelier/domain";
import { memberships, organizations } from "./schema/tenancy.js";
import {
  createTenantContext,
  withTenant,
  type Database,
  type OrganizationId,
  type TenantContext,
} from "./tenant-context.js";

/**
 * Putting tenancy into the product rather than only the schema (M015).
 *
 * Two operations live here, and both are shaped by the same constraint: RLS is
 * already on, so neither can be written the obvious way.
 *
 *   provisionPersonalOrganization  creates a tenant that does not exist yet
 *   resolveTenant                  proves a user may act as one that does
 */

/** Postgres unique-violation. */
const UNIQUE_VIOLATION = "23505";

/**
 * Is this a unique-violation, wherever the driver put it?
 *
 * Drizzle wraps driver errors in a `DrizzleQueryError`, so the Postgres code is
 * on `.cause` and not on the error itself. Checking only the top level made the
 * retry below dead code — the first slug collision rethrew instead of trying
 * the next candidate, and the only reason that was noticed is a test that
 * forced a collision. A retry loop nobody exercises is a retry loop that does
 * not work.
 */
function isUniqueViolation(error: unknown): boolean {
  for (let current = error, depth = 0; current !== undefined && depth < 5; depth++) {
    if ((current as { code?: string }).code === UNIQUE_VIOLATION) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

/** How many slug candidates to try before giving up. */
const MAX_SLUG_ATTEMPTS = 25;

export type ProvisionPersonalOrganizationInput = {
  readonly userId: string;
  readonly email: string;
  readonly name?: string;
};

export type ProvisionedOrganization = {
  readonly organizationId: OrganizationId;
  readonly slug: string;
};

/**
 * Create the organization a user gets on signup (FR-ORG-1).
 *
 * **The claim is set to an organization that does not exist yet**, which looks
 * wrong and is the point. The M004 policy is:
 *
 *   WITH CHECK (id = app_current_organization_id())
 *
 * so an insert is permitted exactly when the row being written is the tenant
 * currently claimed. Generating the id first and claiming it means the ordinary
 * application role can bootstrap a tenant with **no new grant and no policy
 * change** — the alternative was widening `atelier_app`, which would have
 * loosened the boundary for every other query to solve a once-per-user problem.
 *
 * Organization and membership are written in ONE transaction. An organization
 * with no owner is unadministrable (see the last-owner invariant in
 * `@atelier/domain`), and a failure between two statements is exactly how one
 * gets created.
 *
 * Slug collisions are retried with the next candidate. The unique index is the
 * arbiter rather than a pre-flight SELECT: checking first and inserting after
 * is a race, and under concurrency it is a race that loses silently.
 */
export async function provisionPersonalOrganization(
  db: Database,
  input: ProvisionPersonalOrganizationInput,
): Promise<ProvisionedOrganization> {
  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt++) {
    const slug = personalOrganizationSlug(input.email, attempt);
    const organizationId = uuidv7();
    const context = createTenantContext(organizationId);

    try {
      return await withTenant(db, context, async (tx) => {
        await tx.insert(organizations).values({
          id: organizationId,
          slug,
          name: personalOrganizationName({
            ...(input.name !== undefined && { name: input.name }),
            slug,
          }),
        });

        await tx.insert(memberships).values({
          id: uuidv7(),
          organizationId,
          userId: input.userId,
          // Owner: they are the only member, and an organization without an
          // owner cannot be administered.
          role: "owner",
          // Accepted immediately — nobody invited them to their own workspace,
          // so leaving this null would show a pending invitation to yourself.
          acceptedAt: new Date(),
        });

        return { organizationId: context.organizationId, slug };
      });
    } catch (error: unknown) {
      if (isUniqueViolation(error)) continue;
      throw error;
    }
  }

  throw new Error(
    `Could not find a free slug for ${input.email} after ${MAX_SLUG_ATTEMPTS} attempts.`,
  );
}

/**
 * Prove that a user may act as an organization, and return the scoped context.
 *
 * This is the acceptance criterion — *"a user cannot address an org they don't
 * belong to"* — and the implementation is deliberately the shape of the claim
 * it makes: **set the tenant claim to the requested organization, then look for
 * the caller's membership**. RLS filters that lookup to the claimed tenant, so
 * a row comes back only if the membership genuinely exists there.
 *
 * Written that way, the check cannot pass by accident. The naive version —
 * `SELECT organization_id FROM memberships WHERE user_id = ?` — is worse in two
 * ways: with no claim set it returns nothing at all (RLS), and if someone
 * "fixed" that by widening the policy, an attacker-supplied organization id
 * would never be tested against anything.
 *
 * Returns undefined rather than throwing. Whether that is a 403 or a 404 is the
 * API layer's decision (§16), and the two leak different amounts about which
 * organizations exist.
 */
export async function resolveTenant(
  db: Database,
  input: { userId: string; organizationId: string },
): Promise<TenantContext | undefined> {
  let context: TenantContext;
  try {
    context = createTenantContext(input.organizationId);
  } catch {
    // Not a UUID. An attacker-supplied path segment reaches here constantly;
    // it is a miss, not an error worth raising.
    return undefined;
  }

  const membership = await withTenant(db, context, async (tx) => {
    const rows = await tx
      .select({ role: memberships.role })
      .from(memberships)
      .where(
        and(
          eq(memberships.userId, input.userId),
          // Soft-deleted memberships do not grant access; §15 keeps this in one
          // place rather than scattered, and forgetting it here would let a
          // removed member keep working.
          isNull(memberships.deletedAt),
        ),
      )
      .limit(1);
    return rows[0];
  });

  return membership === undefined ? undefined : context;
}

// NOT here: "the organizations a user belongs to".
//
// That is a cross-tenant read — it spans every tenant they belong to, so no
// single value of `app.current_organization_id` can authorise it. Doing it
// properly needs a second session claim (`app.current_user_id`) and a policy
// admitting a user to their own membership rows: additive to M004, but a change
// to the security boundary and therefore an ADR.
//
// M015 does not need it. Its acceptance is that every request resolves exactly
// ONE organization and that a user cannot address one they do not belong to,
// both of which `resolveTenant` satisfies without touching a policy. The
// feature that needs a list is the organization switcher, which can arrive with
// the decision it deserves rather than riding in on this one.

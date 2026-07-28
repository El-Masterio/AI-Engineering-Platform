import { and, eq, isNull } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { memberships, organizations, users } from "./schema/tenancy.js";
import type { Membership, NewMembership, NewUser, Organization, User } from "./schema/tenancy.js";
import type { ScopedTransaction, TenantContext } from "./tenant-context.js";

/**
 * Tenant-scoped repository base (§15 layer 2).
 *
 * The constructor takes a {@link ScopedTransaction}, which only
 * `withTenant()` can produce, and a {@link TenantContext}. Both are required,
 * so there is no expressible way to build a repository that is not scoped —
 * the guard is structural rather than a rule people have to remember.
 *
 * Soft delete is applied here, once. §15: "`deleted_at IS NULL` in a view or
 * repository filter; never scattered ad hoc." Scattering it is how one query
 * eventually forgets and starts returning deleted rows.
 */
export abstract class TenantRepository {
  /**
   * The scoped transaction IS the query handle — it is not re-wrapped.
   *
   * An earlier version called `drizzle(tx)` in this constructor, which throws
   * at runtime: the postgres-js adapter expects the client (it reads
   * `client.options.parsers`), not a transaction. More importantly, wrapping
   * would have produced a SECOND handle on a different connection, outside the
   * transaction that carries the tenant claim — so every query would have run
   * unscoped. The type error was hiding a tenant-isolation bug.
   */
  protected constructor(
    protected readonly db: ScopedTransaction,
    protected readonly context: TenantContext,
  ) {}
}

/** UUIDv7: time-ordered, so index locality without exposing a sequence count (§15). */
export function newId(): string {
  return uuidv7();
}

/**
 * Reference implementation of the pattern, and what the isolation tests drive.
 *
 * Note what is absent: not one method takes an `organizationId` argument. The
 * scope comes from the context the repository was built with, and RLS enforces
 * it in the database. A method that accepted an id would let a caller pass
 * someone else's.
 */
export class OrganizationRepository extends TenantRepository {
  static forTenant(tx: ScopedTransaction, context: TenantContext): OrganizationRepository {
    return new OrganizationRepository(tx, context);
  }

  /** The current tenant, or undefined. RLS makes any other organization invisible. */
  async current(): Promise<Organization | undefined> {
    const rows = await this.db
      .select()
      .from(organizations)
      .where(
        and(eq(organizations.id, this.context.organizationId), isNull(organizations.deletedAt)),
      )
      .limit(1);
    return rows[0];
  }

  /** Every organization this connection can see — one, if RLS is doing its job. */
  async listVisible(): Promise<Organization[]> {
    return this.db.select().from(organizations).where(isNull(organizations.deletedAt));
  }
}

export class MembershipRepository extends TenantRepository {
  static forTenant(tx: ScopedTransaction, context: TenantContext): MembershipRepository {
    return new MembershipRepository(tx, context);
  }

  async listVisible(): Promise<Membership[]> {
    return this.db.select().from(memberships).where(isNull(memberships.deletedAt));
  }

  async add(membership: Omit<NewMembership, "id" | "organizationId">): Promise<Membership> {
    const rows = await this.db
      .insert(memberships)
      .values({ ...membership, id: newId(), organizationId: this.context.organizationId })
      .returning();
    const created = rows[0];
    if (created === undefined) throw new Error("Insert returned no row");
    return created;
  }
}

export class UserRepository extends TenantRepository {
  static forTenant(tx: ScopedTransaction, context: TenantContext): UserRepository {
    return new UserRepository(tx, context);
  }

  /** Only people who share an organization with the caller — enforced by policy. */
  async listVisible(): Promise<User[]> {
    return this.db.select().from(users).where(isNull(users.deletedAt));
  }

  /**
   * Identity creation. Not tenant-scoped, by design: a person exists before
   * they belong anywhere, which is why the `users` INSERT policy is open. See
   * the migration for the reasoning.
   */
  async register(user: Omit<NewUser, "id">): Promise<User> {
    const rows = await this.db
      .insert(users)
      .values({ ...user, id: newId() })
      .returning();
    const created = rows[0];
    if (created === undefined) throw new Error("Insert returned no row");
    return created;
  }
}

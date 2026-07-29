/**
 * Drizzle schema, migrations, and tenant-scoped repositories.
 *
 * Nothing here exposes an unscoped query handle. The only route to the database
 * is `withTenant()`, which returns a `ScopedTransaction` — the type every
 * repository requires (§15 layer 2).
 */

export { createClient, type ClientOptions } from "./client.js";

export {
  seed,
  SEED_ORGANIZATIONS,
  SEED_USERS,
  SEED_MEMBERSHIPS,
  type SeedSummary,
} from "./seed.js";

export {
  loadMigrations,
  appliedMigrations,
  migrateUp,
  migrateDown,
  type Migration,
  type MigrationRecord,
} from "./migrate.js";

export {
  createDatabase,
  createTenantContext,
  isOrganizationId,
  toOrganizationId,
  withTenant,
  type Database,
  type OrganizationId,
  type ScopedTransaction,
  type TenantContext,
} from "./tenant-context.js";

export {
  TenantRepository,
  OrganizationRepository,
  MembershipRepository,
  UserRepository,
  newId,
} from "./repository.js";

export {
  organizations,
  users,
  memberships,
  MEMBERSHIP_ROLES,
  ORGANIZATION_PLANS,
  type Organization,
  type NewOrganization,
  type User,
  type NewUser,
  type Membership,
  type NewMembership,
  type MembershipRole,
  type OrganizationPlan,
  idempotencyKeys,
} from "./schema/tenancy.js";

export { sessions, accounts, verifications } from "./schema/authentication.js";

export {
  withIdempotency,
  sweepIdempotencyKeys,
  hashRequest,
  type IdempotencyOutcome,
} from "./idempotency.js";

export {
  provisionPersonalOrganization,
  resolveTenant,
  type ProvisionPersonalOrganizationInput,
  type ProvisionedOrganization,
} from "./tenancy.js";

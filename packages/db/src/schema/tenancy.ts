import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Drizzle definitions for the tenancy and identity core.
 *
 * These describe the schema; they do not create it. DDL lives in
 * migrations/0001_create_tenancy_and_identity.up.sql, per §15's requirement for
 * named, reviewed, reversible migrations. What lives here is the typed surface
 * queries are written against.
 *
 * The two can drift, and drift here means a query that compiles and fails at
 * runtime. schema-drift.integration.test.ts introspects the migrated database
 * and fails if this file and the SQL disagree.
 */

/** Columns every domain table carries (§15 conventions). */
const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
};

export const organizations = pgTable(
  "organizations",
  {
    id: uuid("id").primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    settings: jsonb("settings").notNull().default({}),
    plan: text("plan").notNull().default("free"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("uq_organizations_slug")
      .on(table.slug)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey(),
    email: text("email").notNull(),
    name: text("name"),
    avatarUrl: text("avatar_url"),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    /**
     * Better Auth's core schema requires a boolean (ADR-010, migration 0003).
     * A database trigger keeps this and `emailVerifiedAt` in agreement, and a
     * CHECK constraint refuses any row where they disagree — so this is a
     * projection of the timestamp, never an independent fact.
     */
    emailVerified: boolean("email_verified").notNull().default(false),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("uq_users_email")
      .on(sql`lower(${table.email})`)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

/** The join every RLS policy resolves through (§15). */
export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"),
    invitedBy: uuid("invited_by").references(() => users.id, { onDelete: "set null" }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("uq_memberships_organization_user")
      .on(table.organizationId, table.userId)
      .where(sql`${table.deletedAt} IS NULL`),
    index("idx_memberships_organization_id_user_id").on(table.organizationId, table.userId),
    index("idx_memberships_user_id").on(table.userId),
    index("idx_memberships_invited_by").on(table.invitedBy),
  ],
);

export const MEMBERSHIP_ROLES = ["owner", "admin", "member", "viewer"] as const;
export type MembershipRole = (typeof MEMBERSHIP_ROLES)[number];

export const ORGANIZATION_PLANS = ["free", "team", "enterprise"] as const;
export type OrganizationPlan = (typeof ORGANIZATION_PLANS)[number];

export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Membership = typeof memberships.$inferSelect;
export type NewMembership = typeof memberships.$inferInsert;

/**
 * Idempotency records (§16, migration 0005).
 *
 * Here rather than in a file of its own because the table is tenant-scoped and
 * shares this file's policy shape — it is tenancy infrastructure, not a domain
 * concept.
 */
export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    id: uuid("id").primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    route: text("route").notNull(),
    /** SHA-256 of the body, so a key reused with different content is caught. */
    requestHash: text("request_hash").notNull(),
    responseStatus: integer("response_status"),
    responseBody: jsonb("response_body"),
    /** Null means in flight — what makes a CONCURRENT duplicate detectable. */
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("uq_idempotency_keys_scope").on(table.organizationId, table.route, table.key),
    index("idx_idempotency_keys_expires_at").on(table.expiresAt),
  ],
);

/**
 * Audit log (§17 Control 8, migration 0006).
 *
 * Range-partitioned by month in the database; Drizzle sees the parent, which is
 * what queries address. The application role holds SELECT and INSERT only, so
 * there is deliberately no update or delete path to express here either.
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").notNull().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    /** Null for system actions — not every state change has a human behind it. */
    actorUserId: uuid("actor_user_id"),
    actorType: text("actor_type").notNull().default("user"),
    action: text("action").notNull(),
    resourceKind: text("resource_kind"),
    resourceId: text("resource_id"),
    outcome: text("outcome").notNull(),
    /** Ties an audit row to the §16 error envelope a user was shown. */
    requestId: text("request_id"),
    ipAddress: text("ip_address"),
    /** Redacted BEFORE it arrives — an audit row is a log kept forever. */
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_audit_log_org_created").on(table.organizationId, table.createdAt),
    index("idx_audit_log_org_actor").on(table.organizationId, table.actorUserId, table.createdAt),
    index("idx_audit_log_org_action").on(table.organizationId, table.action, table.createdAt),
  ],
);

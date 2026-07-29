import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./tenancy.js";

/**
 * Drizzle definitions for the authentication tables (ADR-010).
 *
 * As with tenancy: these describe the schema, they do not create it. DDL is
 * migrations/0002_create_authentication.up.sql, and schema-drift.integration
 * fails if the two disagree.
 *
 * Note there is no `deletedAt` here. Soft delete is a tenancy convention for
 * things a user can restore; a revoked session and a consumed token are not
 * restorable by design, and giving them a `deleted_at` would invite exactly
 * that. They carry `revokedAt` / `consumedAt` instead, which say what happened.
 */

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** The cookie value — deliberately not the primary key. */
    token: text("token").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    /** Explicit revocation, independent of expiry (FR-AUTH-3). */
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("uq_sessions_token").on(table.token),
    index("idx_sessions_user_id").on(table.userId),
    index("idx_sessions_expires_at")
      .on(table.expiresAt)
      .where(sql`${table.revokedAt} IS NULL`),
  ],
);

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    providerId: text("provider_id").notNull(),
    accountId: text("account_id").notNull(),
    /** Argon2id PHC string (FR-AUTH-1); null for OAuth accounts. */
    passwordHash: text("password_hash"),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    idToken: text("id_token"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_accounts_provider_account").on(table.providerId, table.accountId),
    index("idx_accounts_user_id").on(table.userId),
  ],
);

export const verifications = pgTable(
  "verifications",
  {
    id: uuid("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    /** Single use (FR-AUTH-5): set on redemption. */
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // NOT unique — see migration 0004. `value` holds the subject (a user id
    // for a reset), not the token, so it repeats legitimately.
    index("idx_verifications_value").on(table.value),
    index("idx_verifications_identifier").on(table.identifier),
    index("idx_verifications_expires_at")
      .on(table.expiresAt)
      .where(sql`${table.consumedAt} IS NULL`),
  ],
);

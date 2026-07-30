import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { organizations } from "./tenancy.js";

/**
 * Agent definitions (§13, migration 0009).
 *
 * The typed surface for the table that makes agents versioned data rather than
 * code. As everywhere in this package, the SQL migration is the source of truth
 * and schema-drift.integration.test.ts fails if the two disagree.
 */

/** Who authored a definition. */
export const AGENT_ORIGINS = ["platform", "organization"] as const;
export type AgentOrigin = (typeof AGENT_ORIGINS)[number];

export const agentDefinitions = pgTable(
  "agent_definitions",
  {
    id: uuid("id").primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    agentId: text("agent_id").notNull(),
    /**
     * Part of the identity, not metadata.
     *
     * A run pins the version it started with, so a role changes by gaining a
     * version rather than by having one edited.
     */
    version: integer("version").notNull(),
    origin: text("origin").notNull(),
    spec: jsonb("spec").notNull(),
    /**
     * Set the first time a run references this version; the row is frozen from
     * then on, by trigger.
     */
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_agent_definitions_identity").on(
      table.organizationId,
      table.agentId,
      table.version,
    ),
    index("idx_agent_definitions_latest").on(
      table.organizationId,
      table.agentId,
      table.version.desc(),
    ),
  ],
);

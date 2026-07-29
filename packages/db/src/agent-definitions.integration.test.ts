import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  PublishedDefinitionConflictError,
  findAgentDefinition,
  findLatestAgentDefinition,
  isImmutabilityViolation,
  listAgentDefinitions,
  pinForRun,
  upsertAgentDefinition,
} from "./agent-definitions.js";
import { provisionPersonalOrganization } from "./tenancy.js";
import { createTenantContext, withTenant, type TenantContext } from "./tenant-context.js";
import { startHarness, type Harness } from "./testing/harness.js";

/**
 * M024's third acceptance criterion: versions immutable once referenced by a run.
 *
 * The reason it matters: a run pins the agent version it started with, and the
 * audit trail says "this run used backend-engineer v3". If v3 can be edited
 * afterwards, that sentence stops being true and "why did the agent do that"
 * becomes unanswerable — which is the difference between an auditable system and
 * one that merely has logs.
 *
 * Everything runs as `atelier_app`. The harness asserts that role is not a
 * superuser: a superuser bypasses RLS unconditionally, and the isolation cases
 * below would pass no matter how broken the policy was.
 */

let h: Harness;
let alice: TenantContext;
let bob: TenantContext;

const SPEC = {
  id: "backend-engineer",
  version: 1,
  role: "Backend Engineer",
  model: { tier: "implementation", effort: "high" },
  systemPrompt: "Write services.",
  capabilityPacks: ["platform/backend-engineering"],
  tools: [{ name: "read" }, { name: "write" }, { name: "edit" }],
  budget: { maxTokensPerRun: 400_000, maxWallClockMs: 2_700_000, maxRetries: 3 },
  permissions: {
    canWriteCode: true,
    canWriteTests: false,
    canReview: false,
    canDeploy: false,
    canMigrateSchema: false,
    requiresApprovalFor: [],
  },
  outputContract: { type: "task_result", schema: "TaskResultSchema" },
};

async function makeTenant(email: string): Promise<TenantContext> {
  const id = crypto.randomUUID();
  await h.owner`INSERT INTO users (id, email) VALUES (${id}, ${email})`;
  const org = await provisionPersonalOrganization(h.appDb, { userId: id, email });
  return createTenantContext(org.organizationId);
}

beforeAll(async () => {
  h = await startHarness();
  alice = await makeTenant("alice-agents@example.test");
  bob = await makeTenant("bob-agents@example.test");
}, 240_000);

afterAll(async () => {
  await h?.stop();
}, 60_000);

describe("storing a definition", () => {
  it("stores it once and is a no-op on an identical reload", async () => {
    // The loader runs on every boot with the same files. A boot that rewrote
    // rows it did not need to would churn updated_at on every deploy.
    const first = await withTenant(h.appDb, alice, (tx) =>
      upsertAgentDefinition(tx, {
        agentId: "reload-me",
        version: 1,
        origin: "platform",
        spec: { ...SPEC, id: "reload-me" },
      }),
    );

    const second = await withTenant(h.appDb, alice, (tx) =>
      upsertAgentDefinition(tx, {
        agentId: "reload-me",
        version: 1,
        origin: "platform",
        // Same content, REVERSED key order. JSON.stringify preserves insertion
        // order, so a string comparison would call these two specs different and
        // the loader would try to rewrite the row on every boot — and would fail
        // outright once the version was published. Equality is decided by
        // Postgres comparing jsonb, which normalises order.
        spec: Object.fromEntries(Object.entries({ ...SPEC, id: "reload-me" }).toReversed()),
      }),
    );

    expect(second.id).toBe(first.id);
    expect(second.publishedAt).toBeNull();
  });

  it("lets an unpublished definition be edited freely", async () => {
    // A role under development is edited constantly. Freezing before first use
    // would make authoring one intolerable.
    await withTenant(h.appDb, alice, (tx) =>
      upsertAgentDefinition(tx, {
        agentId: "draft",
        version: 1,
        origin: "organization",
        spec: { ...SPEC, id: "draft", systemPrompt: "First attempt." },
      }),
    );

    const edited = await withTenant(h.appDb, alice, (tx) =>
      upsertAgentDefinition(tx, {
        agentId: "draft",
        version: 1,
        origin: "organization",
        spec: { ...SPEC, id: "draft", systemPrompt: "Second attempt." },
      }),
    );

    expect((edited.spec as { systemPrompt: string }).systemPrompt).toBe("Second attempt.");
  });
});

describe("versions are immutable once referenced by a run", () => {
  it("refuses an edit after a run has pinned the version", async () => {
    await withTenant(h.appDb, alice, (tx) =>
      upsertAgentDefinition(tx, {
        agentId: "pinned",
        version: 1,
        origin: "platform",
        spec: { ...SPEC, id: "pinned", systemPrompt: "As it ran." },
      }),
    );

    const pinned = await withTenant(h.appDb, alice, (tx) => pinForRun(tx, "pinned", 1));
    expect(pinned.publishedAt).not.toBeNull();

    await expect(
      withTenant(h.appDb, alice, (tx) =>
        upsertAgentDefinition(tx, {
          agentId: "pinned",
          version: 1,
          origin: "platform",
          spec: { ...SPEC, id: "pinned", systemPrompt: "Rewritten history." },
        }),
      ),
    ).rejects.toThrow(PublishedDefinitionConflictError);

    // And the stored spec is untouched.
    const stored = await withTenant(h.appDb, alice, (tx) => findAgentDefinition(tx, "pinned", 1));
    expect((stored?.spec as { systemPrompt: string }).systemPrompt).toBe("As it ran.");
  });

  it("refuses a raw UPDATE that bypasses the repository entirely", async () => {
    // The adversarial case, and the one that decides whether the guarantee is
    // real. The application check above is for the human; this trigger is what
    // makes the property true regardless of which code path issues the write —
    // including a migration, a psql session, or a future repository nobody has
    // written yet.
    await withTenant(h.appDb, alice, (tx) =>
      upsertAgentDefinition(tx, {
        agentId: "trigger-guard",
        version: 1,
        origin: "platform",
        spec: { ...SPEC, id: "trigger-guard" },
      }),
    );
    await withTenant(h.appDb, alice, (tx) => pinForRun(tx, "trigger-guard", 1));

    let caught: unknown;
    try {
      await h.owner`
        UPDATE agent_definitions
        SET spec = '{"tampered": true}'::jsonb
        WHERE agent_id = 'trigger-guard'
      `;
    } catch (error) {
      caught = error;
    }

    expect(caught, "a published spec was rewritten by the table owner").toBeDefined();
    expect(isImmutabilityViolation(caught)).toBe(true);
  });

  it("refuses a DELETE of a published version", async () => {
    // Freezing UPDATE alone leaves DELETE-then-INSERT as a way to rewrite
    // history that passes every other check.
    await withTenant(h.appDb, alice, (tx) =>
      upsertAgentDefinition(tx, {
        agentId: "no-delete",
        version: 1,
        origin: "platform",
        spec: { ...SPEC, id: "no-delete" },
      }),
    );
    await withTenant(h.appDb, alice, (tx) => pinForRun(tx, "no-delete", 1));

    let caught: unknown;
    try {
      await h.owner`DELETE FROM agent_definitions WHERE agent_id = 'no-delete'`;
    } catch (error) {
      caught = error;
    }

    expect(caught, "a published definition was deleted").toBeDefined();
    expect(isImmutabilityViolation(caught)).toBe(true);
  });

  it("does not move published_at when a second run pins the same version", async () => {
    // Two runs starting concurrently on the same version is normal, and "when
    // was this first used" is a fact rather than a field to refresh. The trigger
    // treats a changed published_at as a change, so a naive second write would
    // raise rather than no-op.
    await withTenant(h.appDb, alice, (tx) =>
      upsertAgentDefinition(tx, {
        agentId: "twice",
        version: 1,
        origin: "platform",
        spec: { ...SPEC, id: "twice" },
      }),
    );

    const first = await withTenant(h.appDb, alice, (tx) => pinForRun(tx, "twice", 1));
    const second = await withTenant(h.appDb, alice, (tx) => pinForRun(tx, "twice", 1));

    expect(second.publishedAt?.getTime()).toBe(first.publishedAt?.getTime());
  });

  it("lets a NEW version be authored after one is published", async () => {
    // The escape hatch that makes immutability tolerable: a role changes by
    // gaining a version, never by having one edited.
    await withTenant(h.appDb, alice, (tx) =>
      upsertAgentDefinition(tx, {
        agentId: "versioned",
        version: 1,
        origin: "platform",
        spec: { ...SPEC, id: "versioned", systemPrompt: "v1" },
      }),
    );
    await withTenant(h.appDb, alice, (tx) => pinForRun(tx, "versioned", 1));

    await withTenant(h.appDb, alice, (tx) =>
      upsertAgentDefinition(tx, {
        agentId: "versioned",
        version: 2,
        origin: "platform",
        spec: { ...SPEC, id: "versioned", version: 2, systemPrompt: "v2" },
      }),
    );

    const latest = await withTenant(h.appDb, alice, (tx) =>
      findLatestAgentDefinition(tx, "versioned"),
    );

    expect(latest?.version).toBe(2);
    // v1 is still readable exactly as it ran.
    const v1 = await withTenant(h.appDb, alice, (tx) => findAgentDefinition(tx, "versioned", 1));
    expect((v1?.spec as { systemPrompt: string }).systemPrompt).toBe("v1");
  });

  it("refuses to pin a version this organization does not have", async () => {
    await expect(
      withTenant(h.appDb, alice, (tx) => pinForRun(tx, "never-authored", 1)),
    ).rejects.toThrow(/no agent definition/);
  });
});

describe("definitions are tenant-scoped without exception", () => {
  it("does not show one organization's definitions to another", async () => {
    await withTenant(h.appDb, alice, (tx) =>
      upsertAgentDefinition(tx, {
        agentId: "alices-own",
        version: 1,
        origin: "organization",
        spec: { ...SPEC, id: "alices-own" },
      }),
    );

    const bobsView = await withTenant(h.appDb, bob, (tx) =>
      findAgentDefinition(tx, "alices-own", 1),
    );
    expect(bobsView).toBeUndefined();

    // Not vacuous: Alice sees her own.
    const alicesView = await withTenant(h.appDb, alice, (tx) =>
      findAgentDefinition(tx, "alices-own", 1),
    );
    expect(alicesView).toBeDefined();
  });

  it("lets two organizations hold the same agent id and version independently", async () => {
    // The reason the built-in roles are materialised per tenant rather than
    // stored once with a null organization_id: a global row would be readable
    // with no tenant claim set, which is the one thing ADR-003's model promises
    // never happens.
    for (const tenant of [alice, bob]) {
      await withTenant(h.appDb, tenant, (tx) =>
        upsertAgentDefinition(tx, {
          agentId: "shared-id",
          version: 1,
          origin: "platform",
          spec: { ...SPEC, id: "shared-id" },
        }),
      );
    }

    const alices = await withTenant(h.appDb, alice, (tx) =>
      findAgentDefinition(tx, "shared-id", 1),
    );
    const bobs = await withTenant(h.appDb, bob, (tx) => findAgentDefinition(tx, "shared-id", 1));

    expect(alices?.id).not.toBe(bobs?.id);
    expect(alices?.organizationId).not.toBe(bobs?.organizationId);
  });

  it("pins only within the caller's tenant", async () => {
    // Publishing another tenant's definition would freeze a row they are still
    // editing, from outside their organization entirely.
    await withTenant(h.appDb, alice, (tx) =>
      upsertAgentDefinition(tx, {
        agentId: "alices-draft",
        version: 1,
        origin: "organization",
        spec: { ...SPEC, id: "alices-draft" },
      }),
    );

    await expect(
      withTenant(h.appDb, bob, (tx) => pinForRun(tx, "alices-draft", 1)),
    ).rejects.toThrow(/no agent definition/);

    const stillDraft = await withTenant(h.appDb, alice, (tx) =>
      findAgentDefinition(tx, "alices-draft", 1),
    );
    expect(stillDraft?.publishedAt).toBeNull();
  });

  it("lists only the caller's definitions", async () => {
    const bobsList = await withTenant(h.appDb, bob, (tx) => listAgentDefinitions(tx));

    expect(bobsList.length).toBeGreaterThan(0);
    for (const record of bobsList) {
      expect(record.organizationId).toBe(bob.organizationId);
    }
  });
});

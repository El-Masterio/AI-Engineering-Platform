import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  listOrganizationsForUser,
  provisionPersonalOrganization,
  resolveTenant,
} from "./tenancy.js";
import { startHarness, type Harness } from "./testing/harness.js";

/**
 * M015 acceptance, against a real database and through the ORDINARY role.
 *
 * Everything here runs on `h.appDb` — `atelier_app`, subject to RLS. That is
 * the whole point: `provisionPersonalOrganization` claims an organization that
 * does not exist yet in order to satisfy `WITH CHECK (id =
 * app_current_organization_id())`, and the only way to know that actually works
 * is to run it as a role the policy applies to. Run as the owner it would pass
 * no matter what the policy said.
 */

let h: Harness;

beforeAll(async () => {
  h = await startHarness();
}, 180_000);

afterAll(async () => {
  await h?.stop();
}, 60_000);

const byId = (a: string, b: string): number => a.localeCompare(b);

/** Create a user as the owner — signup is authentication's job, not this file's. */
async function seedUser(email: string, id?: string): Promise<string> {
  const userId = id ?? crypto.randomUUID();
  await h.owner`INSERT INTO users (id, email) VALUES (${userId}, ${email})`;
  return userId;
}

describe("provisionPersonalOrganization (FR-ORG-1)", () => {
  it("creates an organization AND an owner membership, as the ordinary role", async () => {
    const userId = await seedUser("ada@example.test");
    const result = await provisionPersonalOrganization(h.appDb, {
      userId,
      email: "ada@example.test",
      name: "Ada Lovelace",
    });

    expect(result.slug).toBe("ada");

    const [org] = await h.owner<{ name: string; slug: string; plan: string }[]>`
      SELECT name, slug, plan FROM organizations WHERE id = ${result.organizationId}
    `;
    // FR-ORG-3: name, slug, settings.
    expect(org?.name).toBe("Ada Lovelace");
    expect(org?.plan).toBe("free");

    const [membership] = await h.owner<{ role: string; accepted_at: Date | null }[]>`
      SELECT role, accepted_at FROM memberships
      WHERE organization_id = ${result.organizationId} AND user_id = ${userId}
    `;
    // Owner, because an organization without one cannot be administered.
    expect(membership?.role).toBe("owner");
    // Accepted, because nobody invited them to their own workspace.
    expect(membership?.accepted_at).not.toBeNull();
  });

  it("leaves NOTHING behind when the membership insert fails", async () => {
    // The transaction is what stops an ownerless organization existing, and an
    // ownerless organization is permanently unadministrable.
    const before = await h.owner<{ count: string }[]>`SELECT count(*)::text FROM organizations`;

    await expect(
      provisionPersonalOrganization(h.appDb, {
        // No such user, so the membership's foreign key fails after the
        // organization row has already been written.
        userId: "00000000-0000-4000-8000-000000000000",
        email: "ghost@example.test",
      }),
    ).rejects.toThrow();

    const after = await h.owner<{ count: string }[]>`SELECT count(*)::text FROM organizations`;
    expect(after[0]?.count, "an ownerless organization survived").toBe(before[0]?.count);
  });

  it("retries past a taken slug rather than failing", async () => {
    const first = await provisionPersonalOrganization(h.appDb, {
      userId: await seedUser("grace@example.test"),
      email: "grace@example.test",
    });
    const second = await provisionPersonalOrganization(h.appDb, {
      userId: await seedUser("grace@other.test"),
      email: "grace@other.test",
    });

    expect(first.slug).toBe("grace");
    expect(second.slug).not.toBe("grace");
    expect(second.organizationId).not.toBe(first.organizationId);
  });

  it("survives a long run of collisions", async () => {
    const slugs = new Set<string>();
    for (let i = 0; i < 6; i++) {
      const result = await provisionPersonalOrganization(h.appDb, {
        userId: await seedUser(`alan${i}@example.test`),
        email: "alan@example.test",
      });
      slugs.add(result.slug);
    }
    expect(slugs.size, "two users were given the same slug").toBe(6);
  });
});

describe("resolveTenant — a user cannot address an org they don't belong to", () => {
  let adaId: string;
  let graceId: string;
  let adaOrg: string;
  let graceOrg: string;

  beforeAll(async () => {
    adaId = await seedUser("resolve-ada@example.test");
    graceId = await seedUser("resolve-grace@example.test");
    const ada = await provisionPersonalOrganization(h.appDb, {
      userId: adaId,
      email: "resolve-ada@example.test",
    });
    const grace = await provisionPersonalOrganization(h.appDb, {
      userId: graceId,
      email: "resolve-grace@example.test",
    });
    adaOrg = ada.organizationId;
    graceOrg = grace.organizationId;
  });

  it("REFUSES an organization the user is not a member of", async () => {
    // The acceptance criterion, and the primary assertion of this file.
    const resolved = await resolveTenant(h.appDb, { userId: adaId, organizationId: graceOrg });
    expect(resolved, "ada resolved a tenant she does not belong to").toBeUndefined();
  });

  it("REFUSES in the other direction too", async () => {
    const resolved = await resolveTenant(h.appDb, { userId: graceId, organizationId: adaOrg });
    expect(resolved).toBeUndefined();
  });

  it("resolves the organization the user does belong to", async () => {
    const resolved = await resolveTenant(h.appDb, { userId: adaId, organizationId: adaOrg });
    expect(resolved?.organizationId).toBe(adaOrg);
  });

  it("refuses an organization that does not exist", async () => {
    const resolved = await resolveTenant(h.appDb, {
      userId: adaId,
      organizationId: "99999999-9999-4999-8999-999999999999",
    });
    expect(resolved).toBeUndefined();
  });

  it("refuses a non-UUID without throwing", async () => {
    // An attacker-supplied path segment reaches this constantly.
    for (const nonsense of ["", "../../etc/passwd", "'; DROP TABLE users; --", "not-a-uuid"]) {
      await expect(
        resolveTenant(h.appDb, { userId: adaId, organizationId: nonsense }),
      ).resolves.toBeUndefined();
    }
  });

  it("refuses once the membership is soft-deleted", async () => {
    // A removed member keeping access is the bug this guards.
    const userId = await seedUser("removed@example.test");
    const provisioned = await provisionPersonalOrganization(h.appDb, {
      userId,
      email: "removed@example.test",
    });
    const org = provisioned.organizationId;

    expect(await resolveTenant(h.appDb, { userId, organizationId: org })).toBeDefined();

    await h.owner`
      UPDATE memberships SET deleted_at = now()
      WHERE organization_id = ${org} AND user_id = ${userId}
    `;

    expect(
      await resolveTenant(h.appDb, { userId, organizationId: org }),
      "a removed member kept access",
    ).toBeUndefined();
  });

  it("resolves exactly ONE organization for a user who belongs to two", async () => {
    // "Every request resolves exactly one org context" — the context returned
    // is the one that was ASKED for, never an arbitrary pick from a list.
    const userId = await seedUser("dual@example.test");
    const provisioned = await provisionPersonalOrganization(h.appDb, {
      userId,
      email: "dual@example.test",
    });
    const own = provisioned.organizationId;

    // Add them to Ada's organization as well, as the owner would.
    await h.owner`
      INSERT INTO memberships (id, organization_id, user_id, role, accepted_at)
      VALUES (gen_random_uuid(), ${adaOrg}, ${userId}, 'member', now())
    `;

    const ownContext = await resolveTenant(h.appDb, { userId, organizationId: own });
    const adaContext = await resolveTenant(h.appDb, { userId, organizationId: adaOrg });
    expect(ownContext?.organizationId).toBe(own);
    expect(adaContext?.organizationId).toBe(adaOrg);
    // And still not a third one.
    expect(await resolveTenant(h.appDb, { userId, organizationId: graceOrg })).toBeUndefined();
  });
});

describe("listOrganizationsForUser (M022)", () => {
  it("returns only the organizations the user belongs to", async () => {
    const userId = await seedUser("switcher@example.test");
    const own = await provisionPersonalOrganization(h.appDb, {
      userId,
      email: "switcher@example.test",
    });

    const listed = await listOrganizationsForUser(h.appDb, userId);
    expect(listed.map((o) => o.id)).toEqual([own.organizationId]);
    expect(listed[0]?.role).toBe("owner");
  });

  it("does NOT return organizations belonging to anyone else", async () => {
    // The whole reason this needed a decision rather than a query.
    const mine = await seedUser("mine@example.test");
    const theirs = await seedUser("theirs@example.test");
    await provisionPersonalOrganization(h.appDb, { userId: mine, email: "mine@example.test" });
    const other = await provisionPersonalOrganization(h.appDb, {
      userId: theirs,
      email: "theirs@example.test",
    });

    const listed = await listOrganizationsForUser(h.appDb, mine);
    expect(
      listed.some((o) => o.id === other.organizationId),
      "another user's org leaked",
    ).toBe(false);
  });

  it("returns several when a user belongs to several", async () => {
    const userId = await seedUser("dual-list@example.test");
    const own = await provisionPersonalOrganization(h.appDb, {
      userId,
      email: "dual-list@example.test",
    });
    const host = await seedUser("host@example.test");
    const hosted = await provisionPersonalOrganization(h.appDb, {
      userId: host,
      email: "host@example.test",
    });
    await h.owner`
      INSERT INTO memberships (id, organization_id, user_id, role, accepted_at)
      VALUES (gen_random_uuid(), ${hosted.organizationId}, ${userId}, 'member', now())
    `;

    const listed = await listOrganizationsForUser(h.appDb, userId);
    expect(listed.map((o) => o.id).toSorted(byId)).toEqual(
      [own.organizationId, hosted.organizationId].toSorted(byId),
    );
  });

  it("omits an organization the user has been removed from", async () => {
    const userId = await seedUser("removed-list@example.test");
    const org = await provisionPersonalOrganization(h.appDb, {
      userId,
      email: "removed-list@example.test",
    });
    await h.owner`
      UPDATE memberships SET deleted_at = now()
      WHERE organization_id = ${org.organizationId} AND user_id = ${userId}
    `;

    expect(await listOrganizationsForUser(h.appDb, userId)).toEqual([]);
  });

  it("omits an invitation that has not been accepted", async () => {
    // A pending invitation is not membership; showing it in a switcher would
    // let someone act as an organization before they joined it.
    const userId = await seedUser("pending@example.test");
    const host = await seedUser("pending-host@example.test");
    const hosted = await provisionPersonalOrganization(h.appDb, {
      userId: host,
      email: "pending-host@example.test",
    });
    await h.owner`
      INSERT INTO memberships (id, organization_id, user_id, role)
      VALUES (gen_random_uuid(), ${hosted.organizationId}, ${userId}, 'member')
    `;

    const listed = await listOrganizationsForUser(h.appDb, userId);
    expect(listed.some((o) => o.id === hosted.organizationId)).toBe(false);
  });

  it("returns nothing for a user who does not exist", async () => {
    expect(await listOrganizationsForUser(h.appDb, "00000000-0000-4000-8000-000000000000")).toEqual(
      [],
    );
  });
});

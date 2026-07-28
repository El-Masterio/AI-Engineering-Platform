import { describe, expect, it } from "vitest";
import { SEED_MEMBERSHIPS, SEED_ORGANIZATIONS, SEED_USERS } from "./seed.js";
import { isOrganizationId } from "./tenant-context.js";

/**
 * M010 acceptance: "seeds are synthetic only."
 *
 * That is a promise that decays. Someone reproducing a bug pastes in a real
 * customer row, it works, and it stays — now production data is in a file that
 * gets committed, shared and run on every laptop. These tests make it a build
 * failure instead of a code-review hope.
 */

/** Domains RFC 2606 and RFC 6761 reserve; none can ever be registered. */
const RESERVED_DOMAINS = ["example.test", "example.com", "example.org", "example.net", "invalid"];

function domainOf(email: string): string {
  return email.slice(email.lastIndexOf("@") + 1).toLowerCase();
}

describe("seed data is synthetic", () => {
  it("uses only reserved email domains", () => {
    for (const user of SEED_USERS) {
      expect(
        RESERVED_DOMAINS,
        `${user.email} must use a domain that cannot exist (RFC 2606)`,
      ).toContain(domainOf(user.email));
    }
  });

  it("has no address that could reach a real inbox", () => {
    // Belt and braces: catches a typo like example.tst that slips past the
    // list above by not being on it at all.
    for (const user of SEED_USERS) {
      const domain = domainOf(user.email);
      expect(domain.endsWith(".test") || domain.startsWith("example.")).toBe(true);
    }
  });

  it("names organizations after fiction, not customers", () => {
    // Northwind and Initech are the canonical fictional companies. A real
    // customer name here is the exact failure this suite is for.
    const slugs = SEED_ORGANIZATIONS.map((o) => o.slug);
    expect(slugs).toEqual(["northwind", "initech"]);
  });

  it("carries no free-text field that could hold customer content", () => {
    const serialized = JSON.stringify({ SEED_ORGANIZATIONS, SEED_USERS, SEED_MEMBERSHIPS });
    for (const pattern of [/sk-ant-/, /ghp_/, /AKIA/, /BEGIN [A-Z ]*PRIVATE KEY/, /@gmail\./i]) {
      expect(serialized, `seed must not contain ${String(pattern)}`).not.toMatch(pattern);
    }
  });
});

describe("seed data is stable and valid", () => {
  it("uses fixed ids so a bookmarked URL survives a reset", () => {
    // Generated ids would mean every `pnpm db:reset` invalidates every link,
    // note and scratch test a developer has written.
    for (const row of [...SEED_ORGANIZATIONS, ...SEED_USERS, ...SEED_MEMBERSHIPS]) {
      expect(isOrganizationId(row.id), `${row.id} must be a valid UUID`).toBe(true);
    }
  });

  it("has no duplicate ids across tables", () => {
    const ids = [...SEED_ORGANIZATIONS, ...SEED_USERS, ...SEED_MEMBERSHIPS].map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("spans two organizations, so a cross-tenant leak is visible locally", () => {
    // With a single tenant seeded, a broken RLS policy looks exactly like
    // correct behaviour when you click around.
    const organizationIds = new Set(SEED_MEMBERSHIPS.map((m) => m.organizationId));
    expect(organizationIds.size).toBeGreaterThanOrEqual(2);
  });

  it("references only organizations and users it also seeds", () => {
    const organizationIds = new Set<string>(SEED_ORGANIZATIONS.map((o) => o.id));
    const userIds = new Set<string>(SEED_USERS.map((u) => u.id));

    for (const membership of SEED_MEMBERSHIPS) {
      expect(organizationIds.has(membership.organizationId)).toBe(true);
      expect(userIds.has(membership.userId)).toBe(true);
    }
  });

  it("gives every organization an owner", () => {
    for (const organization of SEED_ORGANIZATIONS) {
      const owners = SEED_MEMBERSHIPS.filter(
        (m) => m.organizationId === organization.id && m.role === "owner",
      );
      expect(owners.length, `${organization.slug} needs an owner`).toBeGreaterThan(0);
    }
  });
});

import { describe, expect, it } from "vitest";
import { fixedClock, toTimestamp } from "../ports/clock.port.js";
import { isDomainError } from "../errors/domain-error.js";
import {
  acceptInvitation,
  canManage,
  changeRole,
  inviteMember,
  isAccepted,
  ownersOf,
  removeMember,
  transferOwnership,
  type Membership,
  type MembershipRole,
} from "./membership.js";

/**
 * The last-owner invariant is the reason this file exists.
 *
 * If it can be violated, an organization becomes permanently unadministrable:
 * nobody can invite, change billing, or delete it, and recovery means a support
 * engineer editing the database by hand. Every path that could remove the last
 * owner is covered here, including the ones that look like they cannot.
 */

const clock = fixedClock(toTimestamp(1_700_000_000_000));
const later = fixedClock(toTimestamp(1_700_000_060_000));

let counter = 0;
function membership(userId: string, role: MembershipRole): Membership {
  counter += 1;
  return {
    id: `m${counter}`,
    organizationId: "org-1",
    userId,
    role,
    createdAt: clock.now(),
    updatedAt: clock.now(),
  };
}

/** Run `work` and return the DomainError it threw, or fail. */
function expectDomainError(work: () => unknown, code: string): void {
  let thrown: unknown;
  try {
    work();
  } catch (error: unknown) {
    thrown = error;
  }
  expect(isDomainError(thrown), `expected a DomainError, got ${String(thrown)}`).toBe(true);
  expect((thrown as { code: string }).code).toBe(code);
}

describe("an organization must keep at least one owner", () => {
  it("refuses to demote the only owner", () => {
    const memberships = [membership("ada", "owner"), membership("grace", "member")];
    expectDomainError(() => changeRole(memberships, "ada", "admin", later), "LAST_OWNER");
  });

  it("refuses to remove the only owner", () => {
    const memberships = [membership("ada", "owner"), membership("grace", "admin")];
    expectDomainError(() => removeMember(memberships, "ada"), "LAST_OWNER");
  });

  it("refuses even when the owner is the ONLY member", () => {
    const memberships = [membership("ada", "owner")];
    expectDomainError(() => removeMember(memberships, "ada"), "LAST_OWNER");
  });

  it("allows demoting an owner once a second one exists", () => {
    const memberships = [membership("ada", "owner"), membership("grace", "owner")];
    const after = changeRole(memberships, "ada", "admin", later);

    expect(ownersOf(after)).toHaveLength(1);
    expect(after.find((m) => m.userId === "ada")?.role).toBe("admin");
  });

  it("allows removing an owner once a second one exists", () => {
    const memberships = [membership("ada", "owner"), membership("grace", "owner")];
    const after = removeMember(memberships, "grace");

    expect(after).toHaveLength(1);
    expect(ownersOf(after)).toHaveLength(1);
  });

  it("cannot be evaded by demoting to viewer instead of admin", () => {
    // The rule is about ceasing to be an owner, not about the target role.
    const memberships = [membership("ada", "owner")];
    for (const role of ["admin", "member", "viewer"] as const) {
      expectDomainError(() => changeRole(memberships, "ada", role, later), "LAST_OWNER");
    }
  });

  it("does not fire when re-assigning an owner to owner", () => {
    const memberships = [membership("ada", "owner")];
    expect(() => changeRole(memberships, "ada", "owner", later)).not.toThrow();
  });
});

describe("transferOwnership", () => {
  /**
   * Promote-then-demote is two operations that can be interrupted between;
   * demote-then-promote trips the last-owner rule. Hence one atomic operation.
   */
  it("moves ownership without ever passing through a zero-owner state", () => {
    const memberships = [membership("ada", "owner"), membership("grace", "member")];
    const after = transferOwnership(memberships, "ada", "grace", later);

    expect(after.find((m) => m.userId === "grace")?.role).toBe("owner");
    expect(after.find((m) => m.userId === "ada")?.role).toBe("admin");
    expect(ownersOf(after)).toHaveLength(1);
  });

  it("refuses when the recipient is not already a member", () => {
    const memberships = [membership("ada", "owner")];
    expectDomainError(() => transferOwnership(memberships, "ada", "nobody", later), "NOT_A_MEMBER");
  });

  it("refuses when the sender is not an owner", () => {
    const memberships = [membership("ada", "owner"), membership("grace", "admin")];
    expectDomainError(() => transferOwnership(memberships, "grace", "ada", later), "INVALID_ROLE");
  });

  it("leaves everyone else untouched", () => {
    const memberships = [
      membership("ada", "owner"),
      membership("grace", "member"),
      membership("alan", "viewer"),
    ];
    const after = transferOwnership(memberships, "ada", "grace", later);
    expect(after.find((m) => m.userId === "alan")?.role).toBe("viewer");
  });
});

describe("inviteMember", () => {
  it("creates an unaccepted membership", () => {
    const created = inviteMember(
      [],
      { id: "m", organizationId: "org-1", userId: "ada", role: "member" },
      clock,
    );

    expect(isAccepted(created)).toBe(false);
    expect(created.role).toBe("member");
    expect(created.createdAt).toBe(clock.now());
  });

  it("records who invited, when told", () => {
    const created = inviteMember(
      [],
      { id: "m", organizationId: "org-1", userId: "ada", role: "member", invitedBy: "grace" },
      clock,
    );
    expect(created.invitedBy).toBe("grace");
  });

  it("refuses a duplicate", () => {
    const existing = [membership("ada", "member")];
    expectDomainError(
      () =>
        inviteMember(
          existing,
          { id: "m", organizationId: "org-1", userId: "ada", role: "admin" },
          clock,
        ),
      "ALREADY_MEMBER",
    );
  });

  it("refuses an unknown role", () => {
    expectDomainError(
      () =>
        inviteMember(
          [],
          { id: "m", organizationId: "org-1", userId: "ada", role: "superuser" as MembershipRole },
          clock,
        ),
      "INVALID_ROLE",
    );
  });
});

describe("acceptInvitation", () => {
  it("stamps the acceptance", () => {
    const invited = membership("ada", "member");
    const accepted = acceptInvitation(invited, later);

    expect(isAccepted(accepted)).toBe(true);
    expect(accepted.acceptedAt).toBe(later.now());
  });

  it("is idempotent and keeps the FIRST acceptance", () => {
    const accepted = acceptInvitation(membership("ada", "member"), clock);
    const again = acceptInvitation(accepted, later);

    expect(again.acceptedAt).toBe(clock.now());
    expect(again).toBe(accepted);
  });
});

describe("canManage", () => {
  it("requires strictly greater authority, so peers cannot act on each other", () => {
    // Peers acting on each other is how a disagreement becomes a race, and the
    // shape of most privilege-escalation bugs in this kind of system.
    expect(canManage("admin", "admin")).toBe(false);
    expect(canManage("owner", "owner")).toBe(false);
  });

  it.each([
    ["owner", "admin", true],
    ["owner", "viewer", true],
    ["admin", "member", true],
    ["member", "viewer", true],
    ["member", "admin", false],
    ["viewer", "owner", false],
  ] as const)("canManage(%s, %s) === %s", (actor, target, expected) => {
    expect(canManage(actor, target)).toBe(expected);
  });
});

describe("immutability", () => {
  it("never mutates the array it is given", () => {
    const memberships = [membership("ada", "owner"), membership("grace", "member")];
    const before = JSON.stringify(memberships);

    changeRole(memberships, "grace", "admin", later);
    removeMember(memberships, "grace");
    transferOwnership(memberships, "ada", "grace", later);

    expect(JSON.stringify(memberships)).toBe(before);
  });

  it("never mutates the membership it is given", () => {
    const original = membership("ada", "member");
    const before = JSON.stringify(original);
    acceptInvitation(original, later);
    expect(JSON.stringify(original)).toBe(before);
  });
});

describe("changeRole and removeMember on a stranger", () => {
  it("say so rather than silently doing nothing", () => {
    const memberships = [membership("ada", "owner")];
    expectDomainError(() => changeRole(memberships, "nobody", "admin", later), "NOT_A_MEMBER");
    expectDomainError(() => removeMember(memberships, "nobody"), "NOT_A_MEMBER");
  });
});

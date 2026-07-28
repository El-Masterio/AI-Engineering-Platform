import { DomainError } from "../errors/domain-error.js";
import type { Clock, Timestamp } from "../ports/clock.port.js";

/**
 * Membership — the join between a person and a tenant, and where the only
 * genuinely interesting rule in this milestone lives.
 *
 * **An organization must always keep at least one owner.** Without it, the last
 * owner can demote or remove themselves and the organization becomes
 * permanently unadministrable: nobody can invite, nobody can change billing,
 * nobody can delete it. Recovering means a support engineer editing the
 * database by hand, which is exactly the kind of operation that should never
 * be routine.
 *
 * The rule is enforced over the whole membership SET, not on a single
 * membership, because that is the level it is true at. A function that took one
 * membership could not see the others and could not enforce it.
 */

export const MEMBERSHIP_ROLES = ["owner", "admin", "member", "viewer"] as const;
export type MembershipRole = (typeof MEMBERSHIP_ROLES)[number];

/** Ordered strongest first. Position is meaningful — see {@link canManage}. */
const ROLE_RANK: Record<MembershipRole, number> = {
  owner: 0,
  admin: 1,
  member: 2,
  viewer: 3,
};

export type Membership = {
  readonly id: string;
  readonly organizationId: string;
  readonly userId: string;
  readonly role: MembershipRole;
  readonly invitedBy?: string;
  readonly acceptedAt?: Timestamp;
  readonly createdAt: Timestamp;
  readonly updatedAt: Timestamp;
};

export function isValidRole(value: string): value is MembershipRole {
  return (MEMBERSHIP_ROLES as readonly string[]).includes(value);
}

/** @throws {DomainError} INVALID_ROLE */
export function assertValidRole(value: string): void {
  if (!isValidRole(value)) {
    throw new DomainError(
      "INVALID_ROLE",
      `Unknown role "${value}". Expected one of ${MEMBERSHIP_ROLES.join(", ")}.`,
      "role",
    );
  }
}

/**
 * Can `actor` act on `target`?
 *
 * Strictly stronger, not equal: an admin cannot demote another admin. Peers
 * acting on each other is how a disagreement becomes a race, and it is the
 * shape of most privilege-escalation bugs in this kind of system.
 *
 * Authorization proper is the policy engine's job (§17). This is the domain
 * rule the policy engine will consult, not a replacement for it.
 */
export function canManage(actor: MembershipRole, target: MembershipRole): boolean {
  return ROLE_RANK[actor] < ROLE_RANK[target];
}

export function isAccepted(membership: Membership): boolean {
  return membership.acceptedAt !== undefined;
}

export function ownersOf(memberships: readonly Membership[]): Membership[] {
  return memberships.filter((m) => m.role === "owner");
}

export type InviteMemberInput = {
  id: string;
  organizationId: string;
  userId: string;
  role: MembershipRole;
  invitedBy?: string;
};

/**
 * @throws {DomainError} INVALID_ROLE, ALREADY_MEMBER
 */
export function inviteMember(
  existing: readonly Membership[],
  input: InviteMemberInput,
  clock: Clock,
): Membership {
  assertValidRole(input.role);

  if (existing.some((m) => m.userId === input.userId)) {
    throw new DomainError("ALREADY_MEMBER", "That person is already a member.", "userId");
  }

  const now = clock.now();
  return {
    id: input.id,
    organizationId: input.organizationId,
    userId: input.userId,
    role: input.role,
    ...(input.invitedBy !== undefined && { invitedBy: input.invitedBy }),
    createdAt: now,
    updatedAt: now,
  };
}

/** An invitation becomes a membership only when accepted. Idempotent. */
export function acceptInvitation(membership: Membership, clock: Clock): Membership {
  if (isAccepted(membership)) return membership;
  const now = clock.now();
  return { ...membership, acceptedAt: now, updatedAt: now };
}

/**
 * Change one member's role, checked against the whole set.
 *
 * @throws {DomainError} INVALID_ROLE, NOT_A_MEMBER, LAST_OWNER
 */
export function changeRole(
  memberships: readonly Membership[],
  userId: string,
  role: MembershipRole,
  clock: Clock,
): Membership[] {
  assertValidRole(role);

  const target = memberships.find((m) => m.userId === userId);
  if (target === undefined) {
    throw new DomainError("NOT_A_MEMBER", "That person is not a member.", "userId");
  }

  // Demoting the last owner leaves nobody who can administer the organization.
  if (role !== "owner" && target.role === "owner" && ownersOf(memberships).length === 1) {
    throw new DomainError(
      "LAST_OWNER",
      "An organization must keep at least one owner. Promote someone else first.",
      "role",
    );
  }

  if (target.role === role) return [...memberships];

  const updated: Membership = { ...target, role, updatedAt: clock.now() };
  return memberships.map((m) => (m.userId === userId ? updated : m));
}

/**
 * @throws {DomainError} NOT_A_MEMBER, LAST_OWNER
 */
export function removeMember(memberships: readonly Membership[], userId: string): Membership[] {
  const target = memberships.find((m) => m.userId === userId);
  if (target === undefined) {
    throw new DomainError("NOT_A_MEMBER", "That person is not a member.", "userId");
  }

  // Same rule as demotion, and the more likely way to hit it: someone leaving.
  if (target.role === "owner" && ownersOf(memberships).length === 1) {
    throw new DomainError(
      "LAST_OWNER",
      "An organization must keep at least one owner. Transfer ownership first.",
      "userId",
    );
  }

  return memberships.filter((m) => m.userId !== userId);
}

/**
 * Hand ownership over in one step.
 *
 * Exists because doing it as promote-then-demote is two operations that can be
 * interrupted between, and doing it as demote-then-promote trips the
 * last-owner rule. Neither is a good answer, so the domain provides the atomic
 * one.
 *
 * @throws {DomainError} NOT_A_MEMBER
 */
export function transferOwnership(
  memberships: readonly Membership[],
  fromUserId: string,
  toUserId: string,
  clock: Clock,
): Membership[] {
  const from = memberships.find((m) => m.userId === fromUserId);
  const to = memberships.find((m) => m.userId === toUserId);

  if (from === undefined || to === undefined) {
    throw new DomainError("NOT_A_MEMBER", "Both people must already be members.", "userId");
  }
  if (from.role !== "owner") {
    throw new DomainError("INVALID_ROLE", "Only an owner can transfer ownership.", "role");
  }

  const now = clock.now();
  return memberships.map((m) => {
    if (m.userId === toUserId) return { ...m, role: "owner", updatedAt: now };
    if (m.userId === fromUserId) return { ...m, role: "admin", updatedAt: now };
    return m;
  });
}

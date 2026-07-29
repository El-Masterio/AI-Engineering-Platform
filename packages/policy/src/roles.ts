import { ACTIONS, APPROVAL_GATED_ACTIONS, type Action } from "./actions.js";

/**
 * Role → permitted actions (FR-ORG-5).
 *
 * Written as an explicit grant per role rather than as inheritance. "Admin is
 * Owner minus billing" is shorter and is how permission models rot: every later
 * exception has to be expressed as a subtraction, and eventually nobody can say
 * what a role actually permits without running the code.
 *
 * The matrix is the documentation, and the test asserts every cell.
 */

export const ROLES = ["owner", "admin", "member", "viewer"] as const;
export type Role = (typeof ROLES)[number];

/** Everything a viewer may do: read, and nothing else. */
const VIEWER: readonly Action[] = [
  "organization:read",
  "project:read",
  "run:read",
  "plan:read",
  "memory:read",
];

/** A member does the work: starts runs, writes memory, but approves nothing. */
const MEMBER: readonly Action[] = [
  ...VIEWER,
  "project:create",
  "project:update",
  "run:start",
  "run:interrupt",
  "memory:write",
  "cost:read",
];

/**
 * An admin runs the organization day to day, but cannot delete it.
 *
 * Three approval-gated actions are within an admin's remit *with* an approval;
 * the rest (deleting data, overriding a budget, granting a capability, dropping
 * a table) stay with the owner.
 */
const ADMIN: readonly Action[] = [
  ...MEMBER,
  "deploy:production",
  "branch:force_push",
  "content:publish_external",
  "organization:update",
  "member:invite",
  "member:remove",
  "member:change_role",
  "project:archive",
  "plan:approve",
  "milestone:approve",
  "audit:read",
];

/**
 * An owner may do everything, including the approval-gated actions.
 *
 * Granting them here is NOT a way around §17 Control 7, and the distinction is
 * the heart of this file: the role says **who may perform** the action, the
 * approval says **a human signed off on this instance**. Both are required and
 * neither substitutes for the other, which is why `createPolicy` checks the
 * gate before it consults this matrix.
 *
 * The first version withheld these from every role, reasoning that "not
 * overridable" meant "nobody may". That made the gate unusable — an approval
 * could be presented and the action still refused for lack of a role — so the
 * control was not stricter, it was broken. A test asking for the approved path
 * is what showed it.
 */
const OWNER: readonly Action[] = [
  ...ADMIN,
  "organization:delete",
  "project:delete",
  ...APPROVAL_GATED_ACTIONS,
];

export const ROLE_PERMISSIONS: Readonly<Record<Role, ReadonlySet<Action>>> = Object.freeze({
  owner: new Set(OWNER),
  admin: new Set(ADMIN),
  member: new Set(MEMBER),
  viewer: new Set(VIEWER),
});

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

/**
 * Actions no role grants — expected to be EMPTY.
 *
 * An action added to the catalogue and forgotten in every role is denied by
 * default, which is safe and invisible: it looks like a deliberate restriction
 * and behaves like a job nobody can do. The test asserts this list is empty so
 * the omission is caught at build time instead.
 */
export function actionsNoRoleGrants(): readonly Action[] {
  return ACTIONS.filter((action) => ROLES.every((role) => !ROLE_PERMISSIONS[role].has(action)));
}

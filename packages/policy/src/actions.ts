/**
 * The action catalogue.
 *
 * Every authorization question in the system is "may this principal perform
 * this action on this resource?", and this file is the closed set of actions.
 * Closed on purpose: a string parameter would let a caller invent an action
 * nobody wrote a rule for, and deny-by-default would then reject it at runtime
 * — correct, but discovered by a user rather than by the compiler.
 *
 * Named `resource:verb`, matching §16's API-key scopes so a scope and a policy
 * action are the same vocabulary rather than two that drift.
 */

export const ACTIONS = [
  // Organizations (FR-ORG-3, FR-ORG-5)
  "organization:read",
  "organization:update",
  "organization:delete",
  "member:invite",
  "member:remove",
  "member:change_role",

  // Projects (§16 scopes: projects:read, projects:write)
  "project:read",
  "project:create",
  "project:update",
  "project:archive",
  "project:delete",

  // Runs (§16 scopes: runs:start, runs:read)
  "run:read",
  "run:start",
  "run:interrupt",

  // Plans and milestones
  "plan:read",
  "plan:approve",
  "milestone:approve",

  // Memory, cost, audit (§16 scopes)
  "memory:read",
  "memory:write",
  "cost:read",
  "audit:read",

  // §17 Control 7 — human approval gates.
  "deploy:production",
  "migration:destructive",
  "branch:force_push",
  "data:delete",
  "budget:override",
  "capability:grant",
  "content:publish_external",
] as const;

export type Action = (typeof ACTIONS)[number];

const ACTION_SET = new Set<string>(ACTIONS);

export function isAction(value: unknown): value is Action {
  return typeof value === "string" && ACTION_SET.has(value);
}

/**
 * Actions §17 Control 7 gates behind an explicit human approval.
 *
 * "**Not overridable by configuration at any autonomy level.**" So these are
 * not "owner may do this" — they are "nobody may do this on role alone". An
 * owner asking to deploy production still needs an approval event; the role
 * decides who may *request* it, never who may skip it.
 *
 * Getting this wrong is subtle and total: granting `deploy:production` to the
 * owner role reads as reasonable and silently deletes the control.
 */
export const APPROVAL_GATED_ACTIONS = new Set<Action>([
  "deploy:production",
  "migration:destructive",
  "branch:force_push",
  "data:delete",
  "budget:override",
  "capability:grant",
  "content:publish_external",
]);

export function requiresHumanApproval(action: Action): boolean {
  return APPROVAL_GATED_ACTIONS.has(action);
}

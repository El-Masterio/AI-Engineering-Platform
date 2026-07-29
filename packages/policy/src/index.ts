/**
 * Authorization — the single decision point (§16, §17).
 *
 * Every handler calls `policy.assert(principal, action, resource)`. Inline role
 * checks are prohibited and lint-enforced: scattered permission logic cannot be
 * audited or tested, and this is a security boundary.
 */
export {
  createPolicy,
  AuthorizationError,
  type Policy,
  type PolicyOptions,
  type Principal,
  type Resource,
  type Decision,
  type DecisionSink,
  type DenialReason,
} from "./policy.js";
export {
  ACTIONS,
  APPROVAL_GATED_ACTIONS,
  isAction,
  requiresHumanApproval,
  type Action,
} from "./actions.js";
export { ROLES, ROLE_PERMISSIONS, actionsNoRoleGrants, isRole, type Role } from "./roles.js";

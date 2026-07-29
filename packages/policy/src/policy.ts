import { isAction, requiresHumanApproval, type Action } from "./actions.js";
import { ROLE_PERMISSIONS, isRole, type Role } from "./roles.js";

/**
 * The single decision point (§16: "Authorization is one call").
 *
 * `if (user.role === "owner")` in a handler is prohibited, and a lint rule
 * enforces it, because scattered permission logic cannot be audited or tested —
 * and this system's permission model is a security boundary (§17).
 *
 * Deny-by-default is structural rather than a final `else`. Every path that is
 * not an explicit grant returns a denial with a reason, so a new action added to
 * the catalogue and forgotten in the matrix is refused rather than permitted.
 */

export type Principal = {
  readonly userId: string;
  readonly organizationId: string;
  /** Undefined when the caller has no membership in this organization. */
  readonly role?: Role;
  /**
   * Scopes, when the principal is an API key rather than a session (§16).
   *
   * A key is bounded by BOTH its scopes and the role of whoever owns it —
   * intersection, never union. A key cannot grant its holder more than the
   * person who created it has, or "least privilege by default" is decorative.
   */
  readonly scopes?: readonly string[];
  /**
   * Proof that a human approved THIS action (§17 Control 7).
   *
   * Deliberately not a boolean: "approved" without saying what was approved is
   * how one approval generalises to the next action, which §17 forbids in as
   * many words.
   */
  readonly approval?: { readonly action: Action; readonly approvedBy: string };
};

export type Resource = {
  readonly organizationId: string;
  readonly kind?: string;
  readonly id?: string;
};

export type Decision =
  | { readonly allowed: true; readonly action: Action; readonly principal: Principal }
  | {
      readonly allowed: false;
      readonly action: string;
      readonly principal: Principal;
      readonly reason: DenialReason;
    };

export type DenialReason =
  | "unknown_action"
  | "no_membership"
  | "unknown_role"
  | "role_lacks_permission"
  | "wrong_tenant"
  | "scope_lacks_permission"
  | "human_approval_required"
  | "approval_mismatch";

/**
 * Where decisions go. §17: "all policy denials" are audited.
 *
 * A port because the audit log is M018 and this is M017 — and because the sink
 * must not be able to change the decision. It receives what was decided; it
 * does not participate.
 */
export type DecisionSink = (decision: Decision) => void;

export class AuthorizationError extends Error {
  override readonly name = "AuthorizationError";

  constructor(
    readonly action: string,
    readonly reason: DenialReason,
  ) {
    // The message is deliberately uninformative. §16: a 403 must not reveal
    // which of "you may not" and "it does not exist" applies, and a reason
    // like "role_lacks_permission" confirms the resource is real.
    super("You do not have access to this resource.");
  }
}

export type PolicyOptions = {
  /** Called with every decision, allowed or denied. */
  readonly onDecision?: DecisionSink;
};

export type Policy = {
  /** @throws {AuthorizationError} when denied. */
  assert: (principal: Principal, action: Action, resource: Resource) => void;
  /** Same rules, returning the decision instead of throwing. */
  check: (principal: Principal, action: string, resource: Resource) => Decision;
};

/**
 * The decision itself, at module scope.
 *
 * Kept out of `createPolicy` so there is exactly ONE implementation regardless
 * of how many policy instances exist — a closure per instance is a place for
 * per-instance state to appear, and per-instance state in an authorization
 * decision is how two callers get different answers.
 */
function decide(principal: Principal, action: string, resource: Resource): Decision {
  const deny = (reason: DenialReason): Decision => ({
    allowed: false,
    action,
    principal,
    reason,
  });

  // An action outside the catalogue is refused before anything else. A typo
  // in a handler must not be a permission.
  if (!isAction(action)) return deny("unknown_action");

  // Tenant first. Even a correct role in the wrong organization is a denial,
  // and checking it here means the policy engine agrees with RLS instead of
  // relying on it.
  if (principal.organizationId !== resource.organizationId) return deny("wrong_tenant");

  if (principal.role === undefined) return deny("no_membership");
  if (!isRole(principal.role)) return deny("unknown_role");

  /**
   * §17 Control 7, checked BEFORE the role matrix.
   *
   * Order matters: if the role were consulted first, granting one of these to
   * a role by accident would silently disable the gate. Checking here means the
   * gate holds even if the matrix is wrong.
   */
  if (requiresHumanApproval(action)) {
    if (principal.approval === undefined) return deny("human_approval_required");
    // An approval for one action never generalises to the next (§17).
    if (principal.approval.action !== action) return deny("approval_mismatch");
  }

  if (!ROLE_PERMISSIONS[principal.role].has(action)) return deny("role_lacks_permission");

  // Scopes narrow, never widen. Absent scopes means a session principal, which
  // is bounded by its role alone.
  if (principal.scopes !== undefined && !principal.scopes.includes(action)) {
    return deny("scope_lacks_permission");
  }

  return { allowed: true, action, principal };
}

export function createPolicy(options: PolicyOptions = {}): Policy {
  return {
    check(principal, action, resource) {
      const decision = decide(principal, action, resource);
      options.onDecision?.(decision);
      return decision;
    },
    assert(principal, action, resource) {
      const decision = decide(principal, action, resource);
      options.onDecision?.(decision);
      if (!decision.allowed) throw new AuthorizationError(action, decision.reason);
    },
  };
}

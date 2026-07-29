import { describe, expect, it } from "vitest";
import {
  ACTIONS,
  APPROVAL_GATED_ACTIONS,
  ROLES,
  ROLE_PERMISSIONS,
  actionsNoRoleGrants,
  AuthorizationError,
  createPolicy,
  DEFAULT_SCOPES,
  type Principal,
  type Role,
} from "./index.js";

/**
 * M017 acceptance: "exhaustive authorization matrix tests · deny by default
 * verified · every denial audited".
 *
 * Exhaustive means every (role × action) cell, generated from the catalogue
 * rather than listed by hand — a hand-written list stops being exhaustive the
 * moment someone adds an action, and does so silently.
 */

const ORG = "11111111-1111-4111-8111-111111111111";
const resource = { organizationId: ORG };

function principal(role: Role, extra: Partial<Principal> = {}): Principal {
  return { userId: "u1", organizationId: ORG, role, ...extra };
}

function reasonOf(decision: { allowed: boolean; reason?: string }): string {
  return decision.allowed ? "(allowed)" : (decision.reason ?? "");
}

describe("the matrix covers every role × action pair", () => {
  it.each(ROLES.flatMap((role) => ACTIONS.map((action) => [role, action] as const)))(
    "%s → %s",
    (role, action) => {
      const decision = createPolicy().check(principal(role), action, resource);

      // The expected answer is derived from the matrix and Control 7 — the two
      // places that are supposed to decide — so this asserts they AGREE with
      // the engine rather than restating the engine's logic.
      const isGated = APPROVAL_GATED_ACTIONS.has(action);
      const isGranted = ROLE_PERMISSIONS[role].has(action);
      expect(decision.allowed).toBe(!isGated && isGranted);
    },
  );

  it("gives viewers no write action at all", () => {
    const writes = ACTIONS.filter((a) => !a.endsWith(":read"));
    for (const action of writes) {
      expect(ROLE_PERMISSIONS.viewer.has(action), `viewer may ${action}`).toBe(false);
    }
  });

  it("makes each role a superset of the one below it", () => {
    // Not inheritance in the code — asserted here so a deliberate exception is
    // a failing test rather than an accident nobody notices.
    const order: Role[] = ["viewer", "member", "admin", "owner"];
    for (let i = 1; i < order.length; i++) {
      const lower = ROLE_PERMISSIONS[order[i - 1]!];
      for (const action of lower) {
        expect(ROLE_PERMISSIONS[order[i]!].has(action), `${order[i]!} lost ${action}`).toBe(true);
      }
    }
  });
});

describe("deny by default", () => {
  it("refuses an action outside the catalogue", () => {
    // A typo in a handler must not be a permission.
    const decision = createPolicy().check(principal("owner"), "project:destroy", resource);
    expect(decision.allowed).toBe(false);
    expect(reasonOf(decision)).toBe("unknown_action");
  });

  it("refuses a principal with no membership", () => {
    const decision = createPolicy().check(
      { userId: "u1", organizationId: ORG },
      "project:read",
      resource,
    );
    expect(reasonOf(decision)).toBe("no_membership");
  });

  it("refuses an unknown role", () => {
    const decision = createPolicy().check(principal("superuser" as Role), "project:read", resource);
    expect(reasonOf(decision)).toBe("unknown_role");
  });

  it("refuses a correct role in the WRONG tenant", () => {
    // The policy engine agrees with RLS rather than relying on it.
    const decision = createPolicy().check(principal("owner"), "project:read", {
      organizationId: "22222222-2222-4222-8222-222222222222",
    });
    expect(reasonOf(decision)).toBe("wrong_tenant");
  });

  it("refuses an action a role does not hold", () => {
    // The property that makes deny-by-default real, checked on a real cell:
    // a viewer is not silently upgraded by anything.
    const decision = createPolicy().check(principal("viewer"), "project:create", resource);
    expect(reasonOf(decision)).toBe("role_lacks_permission");
  });

  it("has NO action missing from every role", () => {
    // An action added to the catalogue and forgotten in the matrix is denied by
    // default — safe, and invisible: it looks like a deliberate restriction and
    // behaves like a job nobody can do. Caught here instead.
    expect(actionsNoRoleGrants(), "action(s) no role can perform").toEqual([]);
  });
});

describe("Control 7 — approval gates are not overridable", () => {
  it.each([...APPROVAL_GATED_ACTIONS])("an OWNER alone may not %s", (action) => {
    // "Not overridable by configuration at any autonomy level." Granting one of
    // these to the owner role reads as reasonable and deletes the control.
    const decision = createPolicy().check(principal("owner"), action, resource);
    expect(reasonOf(decision)).toBe("human_approval_required");
  });

  it("allows the action when a matching approval is present", () => {
    const decision = createPolicy().check(
      principal("owner", { approval: { action: "deploy:production", approvedBy: "ada" } }),
      "deploy:production",
      resource,
    );
    expect(decision.allowed).toBe(true);
  });

  it("does NOT let one approval generalise to another action", () => {
    // §17: "An approval for one action never generalizes to the next."
    const decision = createPolicy().check(
      principal("owner", { approval: { action: "deploy:production", approvedBy: "ada" } }),
      "data:delete",
      resource,
    );
    expect(reasonOf(decision)).toBe("approval_mismatch");
  });

  it("checks the gate BEFORE the role, so a mis-granted role cannot open it", () => {
    const decision = createPolicy().check(
      principal("viewer", { approval: { action: "data:delete", approvedBy: "ada" } }),
      "data:delete",
      resource,
    );
    expect(reasonOf(decision)).toBe("role_lacks_permission");
  });
});

describe("API-key scopes narrow, never widen", () => {
  it("refuses an action the role allows but the scope omits", () => {
    const decision = createPolicy().check(
      principal("owner", { scopes: ["projects:read"] }),
      "project:create",
      resource,
    );
    expect(reasonOf(decision)).toBe("scope_lacks_permission");
  });

  it("cannot grant more than the role holds", () => {
    // A key must not let its holder exceed the person who created it.
    const decision = createPolicy().check(
      principal("viewer", { scopes: ["projects:write"] }),
      "project:delete",
      resource,
    );
    expect(decision.allowed).toBe(false);
  });

  it("permits what both allow", () => {
    const decision = createPolicy().check(
      principal("member", { scopes: ["projects:read"] }),
      "project:read",
      resource,
    );
    expect(decision.allowed).toBe(true);
  });
});

describe("every decision reaches the sink (§17 audit coverage)", () => {
  it("records denials", () => {
    const seen: { allowed: boolean }[] = [];
    createPolicy({
      onDecision: (decision) => {
        seen.push(decision);
      },
    }).check(principal("viewer"), "project:delete", resource);

    expect(seen).toHaveLength(1);
    expect(seen[0]?.allowed).toBe(false);
  });

  it("records allows too, so the log is not only failures", () => {
    const seen: { allowed: boolean }[] = [];
    createPolicy({
      onDecision: (decision) => {
        seen.push(decision);
      },
    }).check(principal("owner"), "project:read", resource);

    expect(seen[0]?.allowed).toBe(true);
  });

  it("records a decision made through assert(), not only check()", () => {
    const seen: unknown[] = [];
    const policy = createPolicy({
      onDecision: (decision) => {
        seen.push(decision);
      },
    });

    expect(() => policy.assert(principal("viewer"), "project:delete", resource)).toThrow(
      AuthorizationError,
    );
    expect(seen, "assert() bypassed the audit sink").toHaveLength(1);
  });

  it("carries the reason and the principal, for an operator", () => {
    const seen: { reason?: string; principal?: { userId: string } }[] = [];
    createPolicy({
      onDecision: (decision) => {
        seen.push(decision);
      },
    }).check(principal("viewer"), "project:delete", resource);

    expect(seen[0]?.reason).toBe("role_lacks_permission");
    expect(seen[0]?.principal?.userId).toBe("u1");
  });
});

describe("AuthorizationError says nothing useful to an attacker", () => {
  it("does not reveal WHY, which would confirm the resource exists", () => {
    // §16: a 403 must not distinguish "you may not" from "it is not there".
    const thrown = capture(() =>
      createPolicy().assert(principal("viewer"), "project:delete", resource),
    );
    expect((thrown as Error).message).toBe("You do not have access to this resource.");
    expect((thrown as Error).message).not.toContain("role");
    expect((thrown as Error).message).not.toContain("project:delete");
  });

  it("still carries the reason as a FIELD, for the audit record", () => {
    const thrown = capture(() =>
      createPolicy().assert(principal("viewer"), "project:delete", resource),
    );
    expect((thrown as AuthorizationError).reason).toBe("role_lacks_permission");
  });

  it("allows a permitted action without throwing", () => {
    expect(() => createPolicy().assert(principal("owner"), "project:read", resource)).not.toThrow();
  });
});

function capture(run: () => unknown): unknown {
  try {
    run();
  } catch (error: unknown) {
    return error;
  }
  return undefined;
}

describe("scopes are BUNDLES of actions, not action names (§16)", () => {
  it("lets a projects:write key perform every project write", () => {
    // The bug this corrects: comparing scopes to action names directly would
    // have refused every write the key was created to perform.
    for (const action of ["project:create", "project:update", "project:archive"] as const) {
      const decision = createPolicy().check(
        principal("owner", { scopes: ["projects:write"] }),
        action,
        resource,
      );
      expect(decision.allowed, `projects:write was refused ${action}`).toBe(true);
    }
  });

  it("does not let a read scope perform a write", () => {
    const decision = createPolicy().check(
      principal("owner", { scopes: ["projects:read"] }),
      "project:update",
      resource,
    );
    expect(reasonOf(decision)).toBe("scope_lacks_permission");
  });

  it("ignores an unknown scope rather than failing the request", () => {
    // A key carrying a scope from a future release must degrade to LESS access,
    // never to an error that takes the caller's whole request down.
    const decision = createPolicy().check(
      principal("owner", { scopes: ["telepathy:read", "projects:read"] }),
      "project:read",
      resource,
    );
    expect(decision.allowed).toBe(true);
  });

  it("grants nothing for an empty scope list", () => {
    const decision = createPolicy().check(
      principal("owner", { scopes: [] }),
      "project:read",
      resource,
    );
    expect(reasonOf(decision)).toBe("scope_lacks_permission");
  });

  it("still cannot exceed the role", () => {
    const decision = createPolicy().check(
      principal("viewer", { scopes: ["projects:write"] }),
      "project:create",
      resource,
    );
    expect(reasonOf(decision)).toBe("role_lacks_permission");
  });

  it("defaults a new key to read-only (§16 least privilege)", () => {
    for (const scope of DEFAULT_SCOPES) {
      expect(scope.endsWith(":read"), `${scope} is not read-only`).toBe(true);
    }
  });
});

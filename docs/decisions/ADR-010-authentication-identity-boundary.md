# ADR-010 — Authentication reads identity through a dedicated database role

**Status:** Accepted
**Date:** 2026-07-29
**Deciders:** Project owner; Lead Architect

## Context

M004 put `users`, `organizations` and `memberships` under `FORCE ROW LEVEL SECURITY`, with
tenant isolation keyed on a session variable:

```sql
CREATE POLICY users_visible_through_membership ON users FOR SELECT
  USING (EXISTS (SELECT 1 FROM memberships m
    WHERE m.user_id = users.id
      AND m.organization_id = app_current_organization_id()
      AND m.deleted_at IS NULL));
```

You may see a person only if they share an organization with your current tenant. That is the
correct rule for the product and it is exactly wrong for authentication.

**Authentication has no tenant context by definition.** A sign-in request carries an email address
and a password. To verify them the system must locate the user — but `app.current_organization_id`
is unset, `app_current_organization_id()` returns NULL, the `EXISTS` subquery matches nothing, and
the lookup returns zero rows. Not "denied": *empty*, which an application will happily report as
"no such user" for every user in the database.

This is not a gap that later milestones close. Tenant resolution middleware is **M015** and the API
layer is **M016**; authentication is M014 and necessarily runs first. There is no ordering of the
roadmap in which a sign-in request already knows its tenant, because the tenant is a property of the
*session that authentication creates*.

The schema anticipated the distinction in a comment — *"identity is global while visibility is
not"* — and implemented only half of it. `users` INSERT is already open (`WITH CHECK (true)`) for
precisely this reason: a person exists before they belong anywhere. What was never built is the
matching **read** path for global identity.

What we knew at decision time: Better Auth is §14's choice and is an ORM-driven library that emits
its own SQL against its own schema; it cannot be redirected through hand-written functions without
replacing its adapter. NFR-SEC-1 requires RLS **and** an application-layer guard — defence in depth,
not either/or. Redis and Postgres are provisioned on staging (ADR-009). What we did not know: how
much of the eventual policy engine (M017) will want to express identity-level rules in SQL rather
than in application code.

## Options considered

### Option A — A dedicated `atelier_auth` database role with role-scoped policies

The auth module connects as its own Postgres role. `users` keeps `FORCE ROW LEVEL SECURITY` and
keeps every existing policy; an additional policy grants the auth role unfiltered access to identity
tables *only*. The role receives no grant at all on tenant-scoped tables.

| | |
|---|---|
| **Advantages** | The bypass is **explicit, named, and bounded** — it appears in the schema as a policy with a role on it, not as an absence. Least privilege is enforceable and, more importantly, *testable*: the isolation suite can assert that `atelier_auth` gets `permission denied` on `organizations`. `atelier_app` keeps its tenant-scoped view completely unchanged, so no existing guarantee is weakened. Blast radius of a leaked auth credential is identity data, never customer work. |
| **Disadvantages** | A second connection pool and a second credential to provision, rotate and keep out of logs. Two roles is more surface than one. Someone must remember that new identity tables need grants on both roles or neither. |
| **Alternatives within this option** | Same role, separate *schema* (`auth.*`) rather than role-scoped policies — rejected because schema separation controls namespacing, not row visibility, and `users` must stay in `public` where the foreign keys already point. |
| **Scalability** | Two pools against one database; the auth pool is small and short-lived. No contention concern at any plausible MVP scale. |
| **Community** | Role-scoped RLS policies (`CREATE POLICY … TO role`) are a first-class Postgres feature, not a trick. |
| **Maintenance** | The rule to remember is one sentence: *identity tables are granted to `atelier_auth`; everything else is granted to `atelier_app`.* Enforced by test, not by memory. |
| **Licensing** | None. |
| **Cost** | Zero — same database instance. |
| **Future-proofing** | Extends cleanly. When M017's policy engine or Phase 7's WorkOS SSO arrives, identity access already has a named principal to attach rules to. |

### Option B — `SECURITY DEFINER` functions for the pre-auth lookups

Keep one role. Owner-privileged functions (`app_find_user_for_authentication(email)`) perform the
narrow reads that authentication needs, returning only the columns required.

| | |
|---|---|
| **Advantages** | One role, one pool, one credential. The exposed surface is a function signature — the narrowest possible contract, and each function is individually reviewable. |
| **Disadvantages** | **Better Auth does not call it.** Its database adapter emits `SELECT … FROM "user" WHERE email = $1` directly. Routing that through functions means writing and owning a custom adapter for the library's core path — the single most security-critical code in the system, maintained by us, diverging from upstream on every release. `SECURITY DEFINER` also carries its own footgun class (`search_path` injection) that must be got right in every function. |
| **Alternatives within this option** | Views with `security_invoker = false` — same adapter problem, plus writes become harder. |
| **Scalability** | Fine. |
| **Community** | Standard Postgres pattern, well documented. |
| **Maintenance** | Poor *in this context*: the maintenance burden is a forked auth adapter, which is precisely the thing §14 chose Better Auth to avoid ("Roll our own — no"). |
| **Licensing** | None. |
| **Cost** | Zero in infrastructure, high in engineering time. |
| **Future-proofing** | Every Better Auth plugin (2FA, SSO, SCIM — FR-AUTH-6/7/8) ships its own queries and would need the same treatment, forever. |

### Option C — Remove RLS from `users`, rely on the application-layer guard

| | |
|---|---|
| **Advantages** | Simplest. No second role, no policies to reason about, no adapter work. |
| **Disadvantages** | Deletes one of the two layers NFR-SEC-1 explicitly requires. The RLS layer is the one that holds when application code is wrong, which is the case it exists for. Would require an ADR superseding ADR-003 and a rewrite of the M004 isolation suite — the suite whose entire point is that a superuser bypass made the control look present while doing nothing. |
| **Alternatives within this option** | `NO FORCE` instead of dropping policies — the same hole, less visibly. |
| **Scalability** | Irrelevant. |
| **Community** | — |
| **Maintenance** | Cheapest to maintain and most expensive to be wrong about. |
| **Licensing** | None. |
| **Cost** | Zero now; a cross-tenant identity leak later. |
| **Future-proofing** | Actively bad: every future table would face the same argument with the precedent already set. |

## Decision

**Option A.** Authentication connects as a dedicated `atelier_auth` Postgres role, which is granted
identity tables (`users`, `sessions`, `accounts`, `verifications`) and nothing else. `users` retains
`FORCE ROW LEVEL SECURITY` and every policy it already has; a role-scoped policy grants
`atelier_auth` unfiltered access to it.

Credentials — password hashes and OAuth tokens — live in `accounts`, which `atelier_app` has **no
grant on whatsoever**. The application role cannot read a password hash even by accident.

## Consequences

**Positive**

- The tenant-isolation guarantee proved in M004 is untouched. No existing policy changes.
- The bypass is a named principal with an asserted blast radius, not an exception buried in
  application code. It can be audited by reading one migration.
- Password hashes become unreachable from the role that serves ordinary requests — a stronger
  position than before this milestone, not a weaker one.
- `DATABASE_URL` and the new `AUTH_DATABASE_URL` differ only in credentials, so ADR-009's
  cloud-agnostic property survives.

**Negative**

- Two connection pools and two credentials. Both are secrets under §17 and both are added to
  `SECRET_VARIABLES` in the env schema so neither can be echoed in an error.
- A new identity table needs a deliberate grant decision. Mitigated by the drift test in M004's
  suite, extended here to assert the grant matrix rather than trusting review.

**Neutral / to revisit**

- If M017's policy engine wants identity-level rules in SQL, `atelier_auth` is where they attach.
- Phase 7's WorkOS SSO (§14) provisions users through the same identity tables; it inherits this
  boundary rather than needing a new one.

**The test that makes this real.** A role-scoped policy is exactly the kind of control that looks
correct and does nothing — the failure mode this project has already shipped four times. The
isolation suite therefore asserts the *negative* case as its primary assertion: connected as
`atelier_auth`, `SELECT` on `organizations`, `projects` and `runs` must raise `permission denied`,
and connected as `atelier_app`, `SELECT` on `accounts` must do the same. A test that only proves
auth can read `users` would pass just as well if the role were a superuser.

## Related

- [ADR-003](ADR-003-postgres-primary-datastore.md) — Postgres and RLS as the isolation primitive
- [ADR-011](ADR-011-transactional-email.md) — the other M014 decision
- [§15 Database Strategy](../02-architecture/15-database-strategy.md)
- [§17 Security Strategy](../02-architecture/17-security-strategy.md) — NFR-SEC-1, defence in depth

# ADR-013 — Agent definitions are per-tenant rows materialised from an on-disk corpus

**Status:** Accepted
**Date:** 2026-07-30
**Deciders:** Lead Architect (M024 implementation)

## Context

§13 says every agent — built-in or customer-authored — is one specification object, and M024's
acceptance criteria are that a new role is added by authoring a file with no code change, that
versions are immutable once referenced by a run, and that an invalid spec is rejected at load.

Immutability needs persistence: a run pins the version it started with, and the audit trail says
"this run used `backend-engineer` v3". If v3 can be edited afterwards, that sentence stops being
true and "why did the agent do that" becomes unanswerable.

So the specs must be in the database. The question is what the row's tenancy is, and the platform's
own six roles are the awkward case — they belong to us, not to any organization.

## Options considered

### Option A — One global row per built-in role (`organization_id IS NULL`)

| | |
|---|---|
| **Advantages** | Six rows, not six per tenant. A version bump is one UPDATE. |
| **Disadvantages** | The RLS policy becomes `organization_id IS NULL OR organization_id = app_current_organization_id()`, and that first clause makes rows readable **with no tenant claim set at all**. ADR-003's model promises exactly the opposite, and `cross-tenant.integration.test.ts` asserts it for every table — this table would have needed a documented exemption from the suite that exists to prevent exemptions. It also needs `WITH CHECK` narrower than `USING`, or an organization could insert a platform-wide agent visible to every tenant. |

This was written first, and rejected on review.

### Option B — Built-ins materialised per organization on first use

| | |
|---|---|
| **Advantages** | `organization_id` is `NOT NULL` with no exceptions, so the policy is the same one every other table has and no RLS invariant is weakened. The row records something truer: not "the platform defines an architect" but "this organization ran exactly this spec". An `origin` column (`platform` / `organization`) keeps the two kinds distinct, so a tenant cannot claim authorship of a built-in and an upgrade can refresh platform rows without touching customer ones. |
| **Disadvantages** | Duplication — one row per organization per version actually used. Bounded by real use rather than by tenant count, but it is real. A platform version bump writes N rows instead of one. |
| **Cost** | Negligible. A spec is a few kilobytes of `jsonb`. |

### Option C — No table; load from disk on every run

| | |
|---|---|
| **Advantages** | No duplication at all. |
| **Disadvantages** | Fails the immutability criterion outright. The file is the only record, so editing it rewrites the history of every completed run, and a customer-authored spec (FR-ORG-6) has no file on our disk to load. |

## Decision

**Option B.** `agent_definitions` is an ordinary tenant-scoped table with `organization_id NOT NULL`.
The platform's corpus lives in `packages/agent-runtime/roles/*.yaml` and is materialised into a
tenant's rows the first time that tenant uses a role.

Two further parts of the same decision:

1. **The authored format is §13's, verbatim** — snake_case keys, `max_wall_clock: 45m` as a duration
   string, `bash:` as a nested mapping with its allowlist. It is what a customer copies out of the
   documentation, so it is what we accept; `parseAgentSpecFile` translates it into the internal
   camelCase type. A bare number where a duration belongs is rejected rather than assumed to be
   milliseconds.

2. **Immutability is enforced twice.** The repository raises
   `PublishedDefinitionConflictError` with an actionable message, and a `BEFORE UPDATE` /
   `BEFORE DELETE` trigger refuses the write regardless of which code path issued it — including a
   migration, a `psql` session, or a repository nobody has written yet. Freezing UPDATE alone would
   leave DELETE-then-INSERT as a way to rewrite history that passes every other check.

## Consequences

**Positive**

- No table in the schema is readable without a tenant claim. The cross-tenant suite needs no new
  exemption, which keeps the exemption list meaningful.
- A completed run's spec is readable exactly as it ran, indefinitely.
- Adding a role is authoring a file. The loader lists a directory; nothing names a role.

**Negative**

- Platform version bumps fan out across tenants. The write is idempotent and content-compared in
  Postgres (`jsonb`, not `JSON.stringify` — key order would otherwise make every boot look like an
  edit), so a redundant boot writes nothing, but the fan-out is real work at scale.
- Two representations of the vocabulary exist: the port's dependency-free `MODEL_TIERS` type and the
  Zod enum that validates files. `adr-004-alignment.test.ts` pins both to ADR-004's table.

**Neutral**

- `origin` is a text column with a CHECK rather than an enum, matching §15's existing convention.

## Reversal cost

**Low.** The table is additive, the corpus is six files, and the loader is one module. Moving to
global built-in rows later is a migration plus an RLS policy change — and would require accepting
the invariant this ADR declined to weaken.

## Revisit triggers

- **A tenant count where per-tenant materialisation is measurably expensive.** The fix is a lazy
  materialisation on first use — which is already the design — not a global row.
- **A built-in role needs to change retroactively for compliance reasons.** That contradicts
  immutability, and the correct response is a documented data-correction procedure with an audit
  entry, not a relaxed trigger.
- **The API grows a definition-authoring endpoint (FR-ORG-6).** It must reuse
  `parseAgentSpecFile`; a second, looser validator on the HTTP path would defeat the point of the
  first.

## Related

- [ADR-003](ADR-003-postgres-primary-datastore.md) — the tenancy invariant Option A would have weakened
- [ADR-004](ADR-004-model-tiering.md) — owns the tier vocabulary a spec may name
- [ADR-012](ADR-012-agent-runtime-port.md) — the `AgentSpec` type these files parse into
- [§13 Agent Architecture](../02-architecture/13-agent-architecture.md) — the specification format
- [§15 Database Strategy](../02-architecture/15-database-strategy.md) — migration conventions

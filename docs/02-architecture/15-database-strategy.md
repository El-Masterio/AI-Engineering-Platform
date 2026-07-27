# 15. Database Strategy

## Principles

1. **One source of truth.** Domain state, audit log, and cost ledger live in the same Postgres so
   they share transactions. An action and its audit record cannot diverge.
2. **Tenant isolation at the data layer.** `organization_id` on every domain table, enforced by
   row-level security *and* an application guard. Two independent mechanisms, because this is the one
   failure we cannot recover from.
3. **Append-only where truth matters.** Audit records, cost entries, and memory versions are never
   updated or deleted — enforced by database privileges, not convention.
4. **Additive migrations only.** Every migration must be deployable before the code that uses it and
   safe to roll back. Destructive changes go through an expand/contract cycle with a human gate.
5. **No unbounded growth without a plan.** Every high-volume table has a partitioning or archival
   strategy defined before it ships.

## Conventions (binding)

| Concern | Convention |
|---|---|
| Table names | `snake_case`, plural — `agent_runs`, `milestone_tasks` |
| Column names | `snake_case` |
| Primary keys | `id`, UUIDv7 (time-ordered — index locality without exposing sequence counts) |
| Foreign keys | `<singular_table>_id` — `project_id` |
| Timestamps | `created_at`, `updated_at`, `deleted_at` — all `timestamptz`, always UTC |
| Soft delete | `deleted_at IS NULL` in a view or repository filter; never scattered ad hoc |
| Booleans | `is_`/`has_` prefix — `is_archived` |
| Enums | Postgres native enum where the set is stable; `text` + check constraint where it will churn |
| JSON | `jsonb` only, never `json`; index with GIN when queried |
| Money | `numeric(19,6)` for cost — never float. Credits stored as integers |
| Tokens/counts | `bigint` |
| Indexes | `idx_<table>_<columns>`; every FK indexed; every `organization_id` in a composite leading position |
| Constraints | `chk_`, `uq_`, `fk_` prefixes |
| Migrations | `NNNN_verb_noun.sql`, forward-only, reviewed by the Database Engineer role |

## Core schema (MVP)

Abbreviated — types and columns that carry design intent only.

### Tenancy & identity

```
organizations       id, slug (uq), name, settings jsonb, plan, deleted_at
users               id, email (uq), name, avatar_url, email_verified_at, deleted_at
memberships         id, organization_id, user_id, role, invited_by, accepted_at
                    uq (organization_id, user_id)
sessions            id, user_id, token_hash, expires_at, revoked_at, ip, user_agent
```

`memberships` is the join that RLS policies read. Every policy resolves through it.

### Projects & repositories

```
projects            id, organization_id, name, slug, goal text,
                    tech_stack jsonb, conventions jsonb,
                    autonomy_level, budget_ceiling_credits, is_archived
                    uq (organization_id, slug)
repositories        id, organization_id, project_id, provider, external_id,
                    default_branch, installation_id
                    -- NO TOKEN COLUMN. Credentials live in the vault. See §17.
```

The absent token column is deliberate and load-bearing: there is no code path that could leak a
repository credential from our database, because it isn't there.

### Planning

```
milestones          id, organization_id, project_id, sequence, external_ref,
                    title, objective, complexity, status,
                    estimated_credits, actual_credits,
                    acceptance_criteria jsonb, deliverables jsonb,
                    approved_by, approved_at, started_at, completed_at
                    uq (project_id, sequence)

milestone_deps      milestone_id, depends_on_milestone_id
                    pk (milestone_id, depends_on_milestone_id)
                    chk (milestone_id <> depends_on_milestone_id)

tasks               id, organization_id, milestone_id, agent_role,
                    title, objective, status, sequence,
                    input jsonb, result jsonb,
                    attempt_count, max_attempts, quarantined_at

task_deps           task_id, depends_on_task_id  (same shape/guard as above)
```

Cycle prevention on the dependency graph is enforced in the service layer with a topological check
before insert, plus a recursive-CTE assertion in tests. A cyclic plan is the most likely way an
orchestrator deadlocks.

### Agents & runs

```
agent_definitions   id, organization_id (null = platform-provided), key, version,
                    role, model_tier, effort, system_prompt,
                    capability_packs jsonb, tools jsonb, permissions jsonb,
                    budget jsonb, is_active
                    uq (organization_id, key, version)

agent_runs          id, organization_id, project_id, task_id,
                    agent_definition_id, agent_version,      -- PINNED for reproducibility
                    runtime_session_id,                       -- external runtime handle
                    status, stop_reason,
                    started_at, ended_at,
                    input_tokens, cache_read_tokens, cache_write_tokens,
                    output_tokens, cost_usd numeric(19,6),
                    model_id, error jsonb

run_events          id, organization_id, agent_run_id, sequence,
                    type, payload jsonb, occurred_at
                    uq (agent_run_id, sequence)          -- ordering + dedupe on replay
                    PARTITION BY RANGE (occurred_at)
```

`agent_version` is denormalized onto the run on purpose: the definition may be updated later, and a
historical run must still explain itself.

`run_events` is the highest-volume table in the system. Monthly range partitions from day one, hot
partitions in Postgres, cold partitions exported to object storage after 90 days.

### Verification

```
reviews             id, organization_id, task_id, reviewer_run_id,
                    reviewed_run_id, verdict, findings jsonb, created_at
                    chk (reviewer_run_id <> reviewed_run_id)   -- self-review impossible
test_runs           id, organization_id, task_id, agent_run_id,
                    framework, command, passed int, failed int, skipped int,
                    output_ref, exit_code, created_at
```

The `chk` constraint on `reviews` is the database-level backstop for FR-AGENT-5. The orchestrator
enforces it, the policy engine enforces it, and the database refuses it. Three layers, because
"nothing self-approves" is the product.

### Memory & knowledge

```
memory_entries      id, organization_id, project_id, path, kind,
                    summary, content text, current_version_id, deleted_at
                    uq (project_id, path) where deleted_at is null

memory_versions     id, organization_id, memory_entry_id, version,
                    operation, content text, content_sha256,
                    actor_type, actor_id, agent_run_id,
                    redacted_at, redacted_by, created_at
                    -- APPEND ONLY

documents           id, organization_id, project_id, title, source, mime_type,
                    storage_ref, status, created_at
doc_chunks          id, organization_id, document_id, ordinal,
                    content text, embedding vector(1536), token_count
                    index: HNSW on embedding, filtered by organization_id
```

`memory_versions` gives us the audit trail and the redaction path (clear content, keep actor and
timestamps) required by FR-MEM-5 and GDPR erasure.

### Cost & audit

```
cost_entries        id, organization_id, project_id, milestone_id, task_id,
                    agent_run_id, model_id, model_tier,
                    input_tokens, cache_read_tokens, cache_write_tokens,
                    output_tokens, cost_usd numeric(19,6), credits int,
                    occurred_at
                    -- APPEND ONLY. PARTITION BY RANGE (occurred_at)

audit_log           id, organization_id, actor_type, actor_id,
                    action, resource_type, resource_id,
                    metadata jsonb, request_id, ip, user_agent, occurred_at
                    -- APPEND ONLY. PARTITION BY RANGE (occurred_at)
                    -- REVOKE UPDATE, DELETE from the application role
```

Rollups (`project.actual_credits`, dashboard aggregates) are derived from `cost_entries`, never
authoritative. If a rollup and the ledger disagree, the ledger wins and the rollup is rebuilt.

### Outbox

```
outbox_events       id, organization_id, aggregate_type, aggregate_id,
                    type, payload jsonb, created_at,
                    processed_at, attempts, last_error
```

Written in the same transaction as the state change it describes; a relay publishes it. This is how
notifications, webhooks, and search indexing happen reliably without a distributed transaction.

## Tenant isolation

**Layer 1 — Row-level security.** Every domain table has RLS enabled with a policy resolving through
`memberships` against a session-local claim:

```sql
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects FORCE ROW LEVEL SECURITY;   -- applies to the table owner too

CREATE POLICY tenant_isolation ON projects
  USING (organization_id = current_setting('app.current_organization_id')::uuid);
```

The application sets `app.current_organization_id` per transaction. `FORCE ROW LEVEL SECURITY`
matters — without it, the owning role bypasses policies.

**Layer 2 — Application guard.** Every repository method requires an explicit `TenantContext`. A lint
rule fails the build on any query builder used without one. Belt and braces: if a policy is
misconfigured, the guard catches it; if the guard is bypassed, RLS catches it.

**Layer 3 — Tests.** A dedicated cross-tenant test suite attempts to read and write every table as
the wrong tenant and asserts zero rows and denied writes. It runs on every commit and is a release
blocker (NFR-SEC-1, 95% coverage floor).

## Migration policy

**Expand → migrate → contract**, always:

1. **Expand** — add the new nullable column/table. Deploy. Old code unaffected.
2. **Migrate** — backfill in batches, off the request path.
3. **Dual-write / dual-read** — new code writes both, reads new with fallback.
4. **Contract** — drop the old column in a *separate, later* release.

Rules:
- No migration may take a long-lived exclusive lock on a table with traffic.
- Index creation is always `CONCURRENTLY`.
- Every destructive migration requires human approval (NFR-SEC-8) and a tested rollback.
- Migrations are reviewed by the Database Engineer role from Phase 3 onward.
- Migration tests run against a snapshot of production-shaped data volume, not an empty schema.

## Performance strategy

| Concern | Approach |
|---|---|
| Indexing | Every FK indexed; composite indexes lead with `organization_id`; partial indexes for soft-delete filters |
| N+1 queries | Explicit batch loading in repositories; a query-count assertion in integration tests catches regressions |
| Hot tables | `run_events`, `cost_entries`, `audit_log` range-partitioned monthly |
| Connection management | PgBouncer in transaction mode; app pool sized to it |
| Read scaling | Read replicas for dashboards and analytics from Phase 6; the run path always reads primary |
| Vector search | HNSW index, always pre-filtered by `organization_id` before ANN search |
| Slow queries | `pg_stat_statements` monitored; anything > 100 ms p95 gets a ticket, not a shrug |

## Backup & recovery

| | |
|---|---|
| Continuous WAL archiving | Point-in-time recovery, RPO ≤ 5 min (NFR-AVAIL-5) |
| Daily full snapshots | 30-day retention |
| Restore drills | Monthly at MVP, weekly at scale — **an untested backup is not a backup** |
| Cross-region replica | From Phase 6 |
| Erasure from backups | Honored on the backup rotation window, documented to customers (NFR-COMP-4) |

## Scaling triggers (documented, not guessed)

| Trigger | Action |
|---|---|
| Write IOPS > 60% sustained | Vertical scale, then evaluate write sharding by `organization_id` |
| `run_events` > 500 M rows | Shorten hot-partition retention; accelerate cold export |
| Vector search p95 > 200 ms | Extract embeddings to a dedicated vector store behind the existing retrieval port |
| Dashboard queries impacting run-path latency | Move all analytics reads to a replica |
| Single-region latency complaints from EU customers | Phase 7 regional deployment — the residency work already requires it |

## Related

- [12. High-Level System Architecture](12-system-architecture.md)
- [17. Security Strategy](17-security-strategy.md)
- [ADR-003 — Postgres as primary datastore](../decisions/ADR-003-postgres-primary-datastore.md)

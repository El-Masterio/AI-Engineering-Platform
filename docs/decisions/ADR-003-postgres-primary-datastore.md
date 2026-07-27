# ADR-003 — PostgreSQL + pgvector as the single primary datastore

**Status:** Accepted
**Date:** 2026-07-27
**Deciders:** Lead Architect (blueprint phase)

## Context

The system needs to store: multi-tenant domain state, an append-only audit log, an append-only cost
ledger, versioned project memory, high-volume run events, and vector embeddings for semantic search.

Two requirements dominate everything else:

1. **Transactional consistency between domain state, audit log, and cost ledger.** An action must not
   be able to exist without its audit record, and a model call must not be able to happen without its
   cost entry. If these live in separate stores, we need distributed transactions or we accept
   divergence — and divergence in an audit log is disqualifying for enterprise sale.
2. **Tenant isolation strong enough to bet the company on.** The one failure that cannot be fixed
   after the fact.

## Options considered

### Option A — PostgreSQL + pgvector, single primary

| | |
|---|---|
| **Advantages** | Transactional consistency across domain, audit, and cost. **Row-level security** provides tenant isolation at the data layer — a genuinely differentiated capability here. JSONB for flexible agent/run payloads. pgvector removes an entire service. Range partitioning for high-volume tables. Mature tooling, mature operations knowledge, mature managed offerings. |
| **Disadvantages** | Vertical write-scaling ceiling. Connection limits need pooling. pgvector slower than dedicated vector stores at very high volume. Requires real operational competence. |
| **Scalability** | Read replicas early; partition audit/event/cost tables; extract embeddings when measured to hurt. Write ceiling is high but real. |
| **Community** | Best-in-class. |
| **Maintenance** | Use a managed provider to avoid becoming a DBA. |
| **Licensing** | PostgreSQL License (permissive); pgvector likewise. |
| **Cost** | Low at MVP scale, predictable growth. |
| **Future-proofing** | Excellent — the safest infrastructure bet available. |

### Option B — PostgreSQL + a dedicated vector database

| | |
|---|---|
| **Advantages** | Better vector performance at scale; purpose-built ANN features. |
| **Disadvantages** | A second service to operate. A sync problem (embeddings must stay consistent with documents). A consistency problem (a document deleted in Postgres whose embedding survives is a data-leak vector across a GDPR erasure request). Added cost and failure domain on day one for a problem we don't have yet. |
| **Future-proofing** | Fine, but premature. |

### Option C — Polyglot persistence (Postgres + document store + time-series + vector)

Rejected. Optimizes each workload at the cost of the consistency guarantee that requirement 1 makes
non-negotiable, and multiplies operational surface for a team of 2–4.

### Option D — Distributed SQL (CockroachDB, Yugabyte)

| | |
|---|---|
| **Advantages** | Horizontal write scaling; multi-region primitives useful for Phase 7 residency. |
| **Disadvantages** | Higher cost, higher latency for common queries, smaller ecosystem, real operational complexity, and no RLS parity. Solving a scaling problem we are years from having. |
| **Future-proofing** | Genuine option later; wrong now. |

## Decision

**PostgreSQL 17 with pgvector as the single primary datastore**, on a managed provider, with:

- `organization_id` on every domain table and RLS with `FORCE ROW LEVEL SECURITY`
- Append-only tables (`audit_log`, `cost_entries`, `memory_versions`) with `UPDATE`/`DELETE` revoked
  from the application role at the database privilege level
- Range partitioning on `run_events`, `cost_entries`, `audit_log` from day one
- pgvector with HNSW indexes, **always pre-filtered by `organization_id`**
- PgBouncer in transaction mode
- Redis as cache/queue only — **never the sole source of truth for anything**

`FORCE ROW LEVEL SECURITY` matters specifically: without it, the table-owning role bypasses policies,
which quietly defeats the control.

## Consequences

### Positive

- An action and its audit record share a transaction. Neither can exist without the other.
- RLS gives a second, independent isolation mechanism beneath the application guard — defence in
  depth on the failure that matters most.
- One database to operate, back up, monitor, and restore.
- No embedding-sync problem, and GDPR erasure of a document removes its embeddings in the same
  transaction.
- Partitioning strategy defined before the tables are large, rather than as an emergency.

### Negative

- Write scaling has a ceiling we will eventually hit. Documented as debt D-001 with a trigger.
- pgvector performance will eventually be the reason to extract embeddings. Documented as D-003 with
  a measurable trigger (p95 > 200 ms).
- Connection management requires attention; a misconfigured pool is a common outage cause.
- RLS adds cognitive overhead — developers must understand why a query returns nothing.

### Neutral

- Managed-provider choice (Neon vs. RDS vs. equivalent) is deferred to M004 and is not
  architecturally significant.

## Reversal cost

**High** for the core datastore — data migration plus a rewrite of the isolation strategy.

**Low** for the *vector* portion specifically: retrieval sits behind a port, so extracting embeddings
to a dedicated store is a contained adapter change. This asymmetry is deliberate — we isolated the
part most likely to need to move.

## Revisit triggers

- Sustained write IOPS > 60% of provisioned capacity.
- Vector search p95 > 200 ms, or embedding load measurably affecting primary-DB latency.
- `run_events` exceeding 500 M rows with partition maintenance becoming burdensome.
- Phase 7 residency requirements demanding multi-region write capability.

## Related

- [§15 Database Strategy](../02-architecture/15-database-strategy.md)
- [§17 Security Strategy](../02-architecture/17-security-strategy.md)
- [§28 Technical Debt](../05-delivery/28-technical-debt-strategy.md) — D-001, D-003
- Backlog M004, M021, M069

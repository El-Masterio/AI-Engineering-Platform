# 12. High-Level System Architecture

## The organizing idea

**We separate the control plane from the execution plane, and we do not own the execution plane.**

The control plane is our product: the domain model, the orchestration logic, the policy engine, the
cost ledger, the audit trail, and the UI. It is boring, stateful, transactional software — and it is
where all the defensible value lives.

The execution plane is where untrusted generated code runs and where agent loops iterate. It is
hard, dangerous, expensive infrastructure. We rent it (see
[ADR-002](../decisions/ADR-002-managed-agents-runtime.md)) behind a port we control, so we can move
it in-house later without touching the domain.

## System context

```
┌──────────┐   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│  Users   │   │  GitHub App  │   │ Model + Agent│   │   Stripe     │
│(browser) │   │   (repos)    │   │   Platform   │   │  (billing)   │
└────┬─────┘   └──────┬───────┘   └──────┬───────┘   └──────┬───────┘
     │                │                  │                  │
     ▼                ▼                  ▼                  ▼
┌──────────────────────────────────────────────────────────────────────┐
│                          A T E L I E R                               │
│                                                                      │
│   Control plane (ours)                Execution plane (rented)        │
│   ─────────────────────                ──────────────────────         │
│   domain · orchestration       ⇄       agent loop · sandbox           │
│   policy · cost · audit                container · tool exec          │
└──────────────────────────────────────────────────────────────────────┘
     │
     ▼
┌──────────────┐  ┌──────────┐  ┌──────────────┐  ┌──────────────┐
│  PostgreSQL  │  │  Redis   │  │ Object store │  │  OTel / logs │
└──────────────┘  └──────────┘  └──────────────┘  └──────────────┘
```

## Container view

```
                            ┌─────────────────────────┐
   Browser  ──── HTTPS ────▶│  Web App (Next.js)      │
                            │  RSC + client islands   │
                            └───────────┬─────────────┘
                                        │ REST + SSE
                            ┌───────────▼─────────────┐
                            │  API Service (Fastify)  │◀──── Webhooks
                            │  auth · RBAC · domain   │      (Git, agent
                            │  validation · REST      │       platform,
                            └─┬────────┬────────────┬─┘       Stripe)
                              │        │            │
              ┌───────────────▼──┐  ┌──▼─────────┐  │
              │ Orchestrator     │  │  Realtime  │  │
              │ (durable jobs)   │  │  Gateway   │  │
              │ task graph       │  │  SSE fan-  │  │
              │ retries · gates  │  │  out       │  │
              └────┬─────────┬───┘  └────────────┘  │
                   │         │                      │
    ┌──────────────▼──┐   ┌──▼───────────────┐      │
    │ AgentRuntime    │   │ Policy Engine    │      │
    │ port (adapter)  │   │ tool allowlist   │      │
    └────────┬────────┘   │ approval gates   │      │
             │            │ budget ceilings  │      │
             │            └──────────────────┘      │
             ▼                                      ▼
   ┌────────────────────┐              ┌──────────────────────┐
   │ Managed Agent      │              │ PostgreSQL           │
   │ Platform           │              │ + pgvector           │
   │ ┌────────────────┐ │              │ (RLS per tenant)     │
   │ │ per-run sandbox│ │              └──────────────────────┘
   │ │ bash·files·git │ │              ┌──────────────────────┐
   │ └────────────────┘ │              │ Redis (queue, cache, │
   │ vault · memory     │              │ locks, rate limits)  │
   └────────────────────┘              └──────────────────────┘
```

## Components

### Web App — Next.js
Server Components for data-dense reads; client components only where interactivity demands it.
Streams agent output over SSE. Owns no business logic — it calls the API.

### API Service — Fastify
The only writer to the database. Responsibilities: authentication, authorization, request
validation, domain service invocation, REST surface, SSE endpoints, webhook receipt. Stateless and
horizontally scalable.

### Orchestrator
Owns the lifecycle of a milestone: reads the task graph, dispatches ready tasks, enforces
dependencies, applies review and test gates, handles retries and backoff, quarantines poisoned
tasks, and drives the state machine. Runs as durable background jobs so a control-plane restart
does not lose in-flight work.

This is the most product-critical component we write. It is where "an organization, not an agent"
actually lives.

### Policy Engine
A single, centrally-tested decision point answering: *may this actor perform this action on this
resource right now?* Consulted for RBAC checks, agent tool allowlists, approval-gate requirements,
budget ceilings, and autonomy levels.

Deliberately **not** scattered across call sites — a permission system spread across 200 `if`
statements cannot be audited or tested. One module, exhaustive unit tests, 95% coverage floor.

### AgentRuntime port
The seam that makes ADR-002 reversible. A narrow interface:

```
defineAgent(spec)        → AgentRef      (versioned role definition)
startRun(agentRef, ctx)  → RunHandle     (provision sandbox, mount repo, attach memory)
sendEvent(run, event)                    (user message, tool result, approval, interrupt)
streamEvents(run)        → AsyncIterable (text, tool calls, results, status, usage)
interrupt(run)                           (stop at a safe boundary)
```

Two implementations planned: a managed adapter (Phase 1) and a self-hosted adapter (Phase 7). The
orchestrator only ever sees this interface.

### Realtime Gateway
Fans agent event streams out to connected browsers. Handles reconnection with replay-from-history so
a dropped connection never loses events — an SSE stream has no built-in replay, so this is a real
component, not a passthrough.

### Cost Ledger
Append-only accounting of every model call. Feeds budget enforcement, plan estimates, dashboards,
and billing. Written on the run path, so it must be cheap and must never block agent progress.

### Audit Log
Append-only, no update or delete path at the database privilege level. Written in the same
transaction as the action it records, so an action cannot exist without its audit entry.

## The critical flow: goal → delivered milestone

```
1  User submits goal
       ↓
2  API creates Project, enqueues PlanningRun
       ↓
3  Orchestrator → AgentRuntime: Director agent session
   Director reads project memory, repo summary, org capability packs
       ↓
4  Director emits architecture note + milestone plan + credit estimates
       ↓
5  ═══ HUMAN APPROVAL GATE ═══ (policy engine: required at autonomy L0–L1)
       ↓
6  Orchestrator materializes the task graph in Postgres
       ↓
7  ┌── loop per ready task ──────────────────────────────────────┐
   │  Policy engine authorizes: agent role, tool allowlist,      │
   │  budget ceiling                                              │
   │       ↓                                                      │
   │  AgentRuntime.startRun → sandbox provisioned, repo mounted   │
   │  on a milestone branch, vault credentials bound              │
   │       ↓                                                      │
   │  Agent works; every tool call authorized + audited;          │
   │  events stream to Realtime Gateway → browser                 │
   │       ↓                                                      │
   │  Cost ledger accumulates; budget ceiling enforced            │
   │       ↓                                                      │
   │  Task result committed atomically; memory updated            │
   └──────────────────────────────────────────────────────────────┘
       ↓
8  ═══ REVIEW GATE ═══  Code Reviewer, separate session,
   different agent instance, cannot be the author (FR-AGENT-5)
       ↓ fail → back to 7 (bounded retries + budget)
9  ═══ TEST GATE ═══  QA Engineer authors and runs tests
       ↓ fail → back to 7 (bounded)
10 Documentation updated · memory written · decisions recorded
       ↓
11 Branch pushed, pull request opened with completion report
       ↓
12 ═══ HUMAN MERGE ═══ (in GitHub — we don't replace their review tooling)
```

Steps 5, 8, 9, and 12 are the product. Steps 3 and 7 are the commodity.

## Architectural style

**Modular monolith, deployed as a small number of services.**

| Decision | Rationale |
|---|---|
| Modular monolith, not microservices | A pre-product-market-fit team cannot afford distributed-system overhead. Module boundaries are enforced by lint rules, so extraction later is mechanical. |
| API and Orchestrator as separate deployables | Different scaling and failure profiles: API is spiky and latency-sensitive; Orchestrator is long-running and throughput-oriented. This split is worth its cost. |
| Single Postgres as the source of truth | Transactional consistency between domain state, audit log, and cost ledger is worth more than premature polyglot persistence. |
| Event-driven internally via an outbox | Reliable side effects (notifications, webhooks, indexing) without a distributed transaction. |
| Hexagonal boundaries at every external edge | Model platform, Git host, billing, storage all sit behind ports. The AgentRuntime port is the load-bearing one. |

## What we deliberately did not build

| Not built | Instead | Revisit when |
|---|---|---|
| Firecracker/gVisor microVM fleet | Managed sandbox | Phase 7 self-hosted, or if managed cost/limits bind |
| Custom durable workflow engine (Temporal-class) | Durable background jobs + explicit state machine in Postgres | Orchestrator complexity outgrows it — Phase 5 |
| Dedicated vector database | pgvector in the primary Postgres | Embedding volume degrades primary DB performance |
| Kubernetes | Managed container platform | Phase 6, driven by scale and cost, not fashion |
| Custom secrets manager | Platform credential vault + cloud KMS | Never, hopefully |
| GraphQL / tRPC public surface | Versioned REST | Public API demand in Phase 8 |

Each of these is a decision to spend our scarce engineering capacity on orchestration, verification,
and governance instead of on infrastructure that is now purchasable.

## Failure domains

| Domain | Blast radius | Containment |
|---|---|---|
| One agent run | Single task | Sandbox is ephemeral and isolated; task state rolls back atomically |
| One tenant | That org only | RLS + app guard + per-org rate limits and budgets |
| Model provider outage | All runs pause | Runs pause and resume; no destructive failure; refusal-fallback configured |
| Sandbox platform outage | New runs cannot start | Existing state safe; queue drains when service returns |
| Postgres primary loss | Full outage | Automated failover; PITR; RPO ≤ 5 min |
| Redis loss | Queue and cache loss | Queue state is reconstructible from Postgres — Redis is never the sole source of truth |
| Compromised agent | One sandbox, one repo branch | No secrets in context; no default-branch write; egress allowlist; full audit |

## Related

- [13. AI Agent Architecture](13-agent-architecture.md)
- [14. Technology Stack](14-technology-stack.md)
- [17. Security Strategy](17-security-strategy.md)
- [ADR-002 — Managed Agents as the runtime](../decisions/ADR-002-managed-agents-runtime.md)

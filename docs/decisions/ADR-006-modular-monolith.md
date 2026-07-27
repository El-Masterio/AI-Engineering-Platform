# ADR-006 — Modular monolith with enforced boundaries, not microservices

**Status:** Accepted
**Date:** 2026-07-27
**Deciders:** Lead Architect (blueprint phase)

## Context

The system has components with genuinely different characteristics: an HTTP API (spiky,
latency-sensitive), an orchestrator (long-running, throughput-oriented), a web app (edge-cacheable),
and background relays. That difference invites a microservices architecture.

Against that: a team of 2–4 engineers pre-product-market-fit, and a requirement for transactional
consistency between domain state, audit log, and cost ledger (ADR-003).

## Options considered

### Option A — Single deployable monolith

| | |
|---|---|
| **Advantages** | Simplest possible deployment and local development. One process to debug. |
| **Disadvantages** | The orchestrator's long-running jobs and the API's latency-sensitive requests scale differently and fail differently. Coupling them means a queue backlog degrades API latency, and an API deploy interrupts in-flight agent runs. That last one is user-visible and unacceptable. |
| **Scalability** | Poor fit — forces scaling the whole thing for one component's load. |

### Option B — Microservices (service per module)

| | |
|---|---|
| **Advantages** | Independent scaling and deployment. Clear ownership at larger team sizes. Failure isolation. |
| **Disadvantages** | Distributed transactions or eventual consistency — which breaks the ADR-003 guarantee that an action and its audit record share a transaction. Network calls where function calls would do. Distributed tracing needed to debug anything. Local development requires orchestrating many services. Schema/contract versioning between services. **All of this cost, paid before we know whether the product works.** |
| **Scalability** | Excellent, eventually. |
| **Maintenance** | High — this is a full-time platform concern at small team size. |

### Option C — Modular monolith, deployed as a small number of services

| | |
|---|---|
| **Advantages** | Module boundaries enforced by tooling, so the *optionality* of extraction is preserved without paying for distribution now. Transactional consistency retained. Function calls, not network calls. Local dev is three processes. The two components with genuinely different profiles (API, orchestrator) are separate deployables — the split that actually earns its cost. |
| **Disadvantages** | Boundaries can erode without enforcement. Shared database means a bad migration affects everything. Not independently deployable per module. |
| **Scalability** | Sufficient to roughly 25 engineers and well past our expected load. |
| **Future-proofing** | Good, *conditional on the boundaries being real.* |

## Decision

**Modular monolith with lint-enforced boundaries, deployed as three services:** `web`, `api`,
`orchestrator` — plus one shared database.

**The boundaries are enforced, not documented:**

| Mechanism | Enforces |
|---|---|
| `eslint-plugin-boundaries` | Layer import rules (`domain` ← `app` ← `infra`); a violation fails the build |
| `dependency-cruiser` | Zero circular dependencies between packages; a cycle fails the build |
| `packages/domain` has zero external dependencies | Verified in CI; keeps business logic pure and extractable |
| Ports at every external edge | `AgentRuntime`, repository host, object store, clock |
| No shared mutable state between modules | Communication via the outbox pattern for side effects |

The rule that makes this work: **"we could extract this module into a service in a week" must remain
true at all times.** If it stops being true, boundaries have eroded and that is a defect, not a
natural consequence of growth.

## Consequences

### Positive

- An action and its audit record and cost entry share one transaction — the ADR-003 guarantee holds.
- Debugging is a stack trace, not a distributed trace, for most problems.
- Local development is three processes, not fifteen.
- API and orchestrator scale and deploy independently, which is the one split that matters: **an API
  deploy does not interrupt an in-flight agent run** (NFR-AVAIL-3).
- Cross-cutting changes land in one PR with one review.
- Extraction stays cheap because the boundaries are machine-verified rather than aspirational.

### Negative

- Boundary erosion is a constant pressure. Automated enforcement mitigates but does not eliminate it —
  someone can always add an exception.
- A shared database means a bad migration has a wide blast radius. Mitigated by expand/contract
  migrations (§15) and human approval on destructive changes.
- Not independently deployable per module. Accepted at this team size.
- A memory leak or crash loop in one module takes down its whole service.

### Neutral

- The three-service split may become four or five (e.g. a separate indexing worker) without changing
  this decision.

## Reversal cost

**Medium.** Extracting a module to a service requires: replacing function calls with a network client,
handling partial failure, splitting the schema or introducing an API between them, and adding
distributed tracing. Roughly 2–4 weeks per module *provided the boundaries held*.

The enforcement mechanisms are precisely what keeps this cost at medium rather than high. Their value
is realized only at the moment of extraction, which is why they are non-negotiable now.

## Revisit triggers

- Team exceeding ~25 engineers where independent deployment ownership outweighs shared-transaction
  benefits.
- One module needing independent scaling that the current split cannot provide.
- A module needing a different language (e.g. Python for ML work).
- Boundary violations requiring more than a handful of standing lint exceptions — that signals the
  boundaries are wrong, and the response may be to redraw them rather than to distribute.

## Related

- [§12 System Architecture](../02-architecture/12-system-architecture.md)
- [§19 Folder Structure](../04-engineering/19-folder-structure.md)
- [ADR-003 — Postgres primary datastore](ADR-003-postgres-primary-datastore.md)
- [§28 Technical Debt](../05-delivery/28-technical-debt-strategy.md) — D-001
- Backlog M002 (boundary enforcement), M011

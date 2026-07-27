# ADR-001 — TypeScript monorepo with pnpm + Turborepo

**Status:** Accepted
**Date:** 2026-07-27
**Deciders:** Lead Architect (blueprint phase)

## Context

We need a language and repository strategy for a product spanning a web dashboard, an HTTP API, a
background orchestrator, agent-facing code, and eventually a published SDK. The team is small (2–4
engineers plus agent assistance), so context-switching cost between stacks is a first-order concern
rather than a detail.

The workload is overwhelmingly I/O-bound: HTTP requests, database queries, model API calls, and event
streaming. CPU-bound work is limited to embedding generation and code indexing.

## Options considered

### Option A — TypeScript everywhere, single monorepo

| | |
|---|---|
| **Advantages** | One language across web, API, orchestrator, and SDK. Types shared end to end — an API contract change surfaces as a compile error in the frontend. Strongest agent/LLM tooling ecosystem. Largest hiring pool. Fast iteration. Structural typing suits the agent-spec-as-data model. |
| **Disadvantages** | Weaker than Python for ML/data work. Single-threaded per process. No true parallelism for CPU-bound tasks. |
| **Scalability** | Proven at large scale for I/O-bound services. |
| **Community** | Largest available. |
| **Maintenance** | Active; quarterly TS releases, predictable Node LTS. |
| **Licensing** | Apache-2.0 (TS), MIT (Node). |
| **Cost** | Free; lowest hiring cost of the options. |
| **Future-proofing** | Strong. Risk: Python pulls further ahead on AI tooling. |

### Option B — Python backend + TypeScript frontend

| | |
|---|---|
| **Advantages** | Best ML/data ecosystem. Strong async story with modern frameworks. |
| **Disadvantages** | Two languages, two toolchains, two dependency systems, duplicated type definitions at the boundary. For a 2–4 person team this is a persistent tax on every cross-cutting change. |
| **Scalability** | Good. |
| **Maintenance** | Higher — two ecosystems to track. |
| **Future-proofing** | Good, at the cost of permanent duplication. |

### Option C — Go backend + TypeScript frontend

| | |
|---|---|
| **Advantages** | Excellent concurrency for the orchestrator. Single static binary deployment. Low memory. |
| **Disadvantages** | Slower iteration. Weaker LLM tooling. Two languages. Verbose for domain modeling. |
| **Future-proofing** | Good, but the concurrency advantage matters less than expected for an I/O-bound workload. |

### Option D — Polyrepo instead of monorepo

Rejected without deep evaluation: cross-repo type sharing and coordinated changes are painful at this
team size, and the modular-monolith architecture (ADR-006) needs enforced boundaries within one build
graph.

## Decision

**TypeScript (strict mode) on Node 22 LTS, in a single pnpm + Turborepo monorepo.**

- **pnpm** for content-addressed storage, disk efficiency, and strict dependency isolation (which
  catches phantom dependencies that other package managers allow).
- **Turborepo** for content-hashed task caching and correct task graphs with minimal configuration.
- **Escape hatch:** if Python becomes necessary (embeddings, static analysis, ML), it runs as an
  isolated worker consuming a queue — never in the request path, never a second primary language.

## Consequences

### Positive

- One mental model, one toolchain, one dependency graph.
- API contract types shared between server and client; a breaking change is a compile error, not a
  runtime surprise.
- `packages/domain` with zero dependencies is straightforward, which is what makes the fast unit-test
  layer in §23 possible.
- Coordinated cross-cutting changes land in a single PR.
- Turborepo caching keeps CI within the < 8 min budget as the repo grows.

### Negative

- If we need real ML work later, it will feel awkward. The queue-worker escape hatch is a workaround,
  not a solution.
- Single-threaded per process means CPU-bound work must be moved off the request path deliberately.
- Turborepo is vendor-backed (Vercel) — a soft lock-in. Mitigated: it caches tasks, it doesn't shape
  our code, so replacing it is roughly a day of work.
- pnpm's strictness occasionally breaks packages with sloppy peer dependency declarations.

### Neutral

- Node LTS upgrade cadence becomes a recurring maintenance item.

## Reversal cost

**High.** Changing primary language is effectively a rewrite. Changing monorepo *tooling* is low cost
(days); changing the monorepo *structure* to polyrepo is medium (weeks).

Mitigation: strong module boundaries (§19, ADR-006) mean an individual package could be extracted and
rewritten in another language behind its port without touching the rest.

## Revisit triggers

- A hard requirement for ML work that cannot live in a queue worker.
- CPU-bound work becoming a significant share of the workload.
- Team growth past ~25 engineers where independent deployability outweighs shared-type benefits.

## Related

- [§14 Technology Stack](../02-architecture/14-technology-stack.md)
- [§19 Folder Structure](../04-engineering/19-folder-structure.md)
- [ADR-006 — Modular monolith](ADR-006-modular-monolith.md)
- Backlog M001, M002

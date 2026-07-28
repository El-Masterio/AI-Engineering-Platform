# ADR-009 — Railway for staging, GHCR for images

**Status:** Accepted
**Date:** 2026-07-28
**Deciders:** Project owner (decision), Lead Architect (implementation)
**Resolves:** the "managed containers vs. Kubernetes" pending decision, *for staging only*

## Context

M011 needs somewhere to deploy. Nothing in the project had chosen a host, and §24's stages 8–11
cannot be built — let alone verified — against a provider nobody picked.

The constraint that decides it: **this is a pre-product-market-fit team building a product, not an
infrastructure team.** Every hour spent on cluster mechanics is an hour not spent on the thing
customers would pay for, and at zero users a Kubernetes control plane costs money and attention to
run a workload that would fit on one small container.

## Decision

**Railway for the staging environment. GitHub Container Registry for images. No production
infrastructure yet.**

| | |
|---|---|
| **Host** | Railway — Docker-native, managed Postgres and Redis, health checks, per-deploy rollback |
| **Registry** | GHCR — free for this repository, authenticates with the workflow's own `GITHUB_TOKEN`, no extra account |
| **Scope** | Staging only. Production is provisioned when there is something to put in front of users |

**The architecture stays cloud-agnostic.** That is the load-bearing half of this decision, and it is
what makes choosing the convenient option now a cheap decision rather than a trap:

- The unit of deployment is an **OCI image**, not a Railway-specific artifact. It runs anywhere that
  runs containers.
- Configuration arrives through the **environment** and is validated at boot (§M005). No Railway
  SDK, no platform-specific config file read at runtime.
- Postgres and Redis are reached by **connection string**. Railway's managed instances are ordinary
  Postgres and Redis; nothing depends on their being Railway's.
- Health and readiness are **HTTP endpoints** (§M006), which every orchestrator understands.

The migration path is therefore: point a Kubernetes Deployment at the same image, set the same
environment variables, and keep the same probes. That is a day of work, not a rewrite — which is the
whole reason to accept a managed platform now.

## Options considered

### Option A — Kubernetes (EKS/GKE/AKS) now

| | |
|---|---|
| **Advantages** | The eventual destination. No migration later. Full control over networking, scheduling and cost. |
| **Disadvantages** | A control plane costs roughly $70/month before a single workload runs, plus nodes. Needs OpenTofu modules, an ingress controller, cert management, a secrets story and a person who understands all four. Buys capabilities — autoscaling, multi-region, pod-level policy — that a pre-launch product cannot use. **Optimises for a scale problem we do not have, at the cost of the product problem we do.** |

### Option B — Railway ✅

| | |
|---|---|
| **Advantages** | Deploy in minutes. Managed Postgres and Redis included, so the local compose stack maps one-to-one. Health checks, per-deploy rollback and zero-downtime replacement are platform features rather than things we build. Costs a few dollars a month at staging volume. |
| **Disadvantages** | Less control. Vendor-specific deployment mechanics (mitigated above — the *artifact* is portable even though the deploy step is not). Fewer knobs when something is slow. Not where this ends up. |

### Option C — AWS ECS Fargate

| | |
|---|---|
| **Advantages** | Managed containers on the cloud we would most likely grow into. Portable-ish. |
| **Disadvantages** | Still needs OpenTofu, a VPC, an ALB, RDS and ElastiCache to reach parity with Railway's defaults. Roughly a week of infrastructure work and ~$50/month idle, to reach the same place. |

**Chosen: B.** A wrong host is a week to change while the artifact stays portable; a wrong product
is the company.

## Consequences

### Good

- Staging exists in days rather than weeks, so §24's stages 8–11 become real and GATE 1A is
  reachable.
- Low, predictable cost during development.
- The local `docker-compose` stack and staging run the same Postgres and Redis versions.

### Bad / accepted

- **§24's "staging environment via OpenTofu" is not delivered.** Railway is configured through its
  own dashboard and CLI. Writing OpenTofu for a platform we intend to leave would be work thrown
  away twice. Infrastructure-as-code returns with production and Kubernetes; until then the staging
  environment is reproducible from this ADR and the deploy workflow, not from a state file.
  Recorded as debt, not overlooked.
- Deploy mechanics are Railway-shaped and will be rewritten at the Kubernetes migration. The image,
  the configuration contract and the probes will not be.
- No production environment, so no production-shaped rehearsal of a release. Deliberate: there is
  nothing to release to.

### Neutral

- GHCR ties image hosting to GitHub. If the repository ever moves, images move with it — a
  `docker pull`/`push` loop, not a migration.

## Revisit when

Any one of: sustained traffic that Railway's pricing makes expensive relative to reserved compute;
a compliance requirement for VPC isolation or a specific region; multi-region latency requirements;
or a team large enough that per-service infrastructure control stops being overhead and starts being
leverage. M127 already budgets the runtime exit ramp.

## Related

- [§24 CI/CD Strategy](../04-engineering/24-cicd-strategy.md) — stages 8–11
- [ADR-003](ADR-003-postgres-primary-datastore.md) — Postgres and Redis, which Railway provides managed
- [ADR-006](ADR-006-modular-monolith.md) — a modular monolith is what makes a single container viable
- [§28 Technical Debt](../05-delivery/28-technical-debt-strategy.md) — the OpenTofu gap

# Atelier — AI Engineering Platform

> **Working product name.** `ASSUMPTION-001`: "Atelier" is a placeholder chosen so the blueprint
> reads coherently. Renaming is a find-and-replace plus a design-token change; no architecture
> depends on it.

A SaaS platform where users create software projects and assign teams of AI agents to do the
engineering work — planning, architecture, implementation, review, testing, documentation,
deployment, and production monitoring.

The product goal is not "a chatbot that writes code." It is **an AI software company you can
hire**: a Director agent that decomposes goals into milestones, specialist agents that execute
them inside sandboxed environments, and verification gates that mean the output can be trusted.

## Status

**Phase 1 — Stage 1A in progress.** 2 of 132 milestones complete.

The blueprint (Phase 0) is complete, the monorepo skeleton is up (`M001`), and the coding
standards are enforced by tooling (`M002`). Next milestone: `M003 — CI pipeline`. Progress tracker:
[docs/05-delivery/26-milestone-breakdown.md](docs/05-delivery/26-milestone-breakdown.md).

## Quick start

```bash
npm install -g pnpm      # `corepack enable pnpm` needs admin on Windows
pnpm install
pnpm verify              # format + lint + depcruise + typecheck + build
```

Individual gates: `pnpm lint` · `pnpm depcruise` · `pnpm typecheck` · `pnpm build` ·
`pnpm format`. A pre-commit hook formats and lints staged files (~4 s).

Requires **Node 24 LTS** (see `.nvmrc`) and **pnpm 11+** (pinned via `packageManager`).

## Start here

| If you want to…                                    | Read                                                                                             |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Understand what we're building and why             | [docs/00-foundation/01-product-vision.md](docs/00-foundation/01-product-vision.md)               |
| See the whole documentation set                    | [docs/README.md](docs/README.md)                                                                 |
| Understand the system shape                        | [docs/02-architecture/12-system-architecture.md](docs/02-architecture/12-system-architecture.md) |
| Understand how agents work                         | [docs/02-architecture/13-agent-architecture.md](docs/02-architecture/13-agent-architecture.md)   |
| See the technology choices and their justification | [docs/02-architecture/14-technology-stack.md](docs/02-architecture/14-technology-stack.md)       |
| Know what ships in the MVP                         | [docs/00-foundation/08-mvp-definition.md](docs/00-foundation/08-mvp-definition.md)               |
| Pick up the next piece of work                     | [docs/backlog/BACKLOG.md](docs/backlog/BACKLOG.md)                                               |
| Understand the execution plan                      | [docs/05-delivery/30-master-development-plan.md](docs/05-delivery/30-master-development-plan.md) |

## The three-sentence architecture

Anthropic's **Managed Agents** platform hosts the agent loop and a per-session sandboxed container,
so we do not build our own microVM fleet, durable workflow engine, or secret-injection proxy.
Our control plane owns the domain — organizations, projects, milestones, task graphs, artifacts,
reviews, cost ledgers, and audit trails — and drives agent sessions through a thin, swappable
`AgentRuntime` port. The product surface is a Next.js dashboard over a versioned REST API, with
a design system built for calm, dense, high-trust engineering work.

See [ADR-002](docs/decisions/ADR-002-managed-agents-runtime.md) for why, and what the exit ramp is.

## Repository layout

```
apps/
  web/            Next.js dashboard              (framework scaffolding: M009)
  api/            Fastify HTTP service           (framework scaffolding: M016)
  orchestrator/   Durable job workers            (M040)
packages/
  config/         Shared build configuration
  contracts/      Zod schemas + generated API types
  domain/         Pure business logic — zero external dependencies by design
  db/             Drizzle schema, migrations, tenant-scoped repositories
  agent-runtime/  AgentRuntime port + adapters   (ADR-002)
  policy/         Authorization + gate decisions
  cost/           Token accounting, budgets, credits
  capability-packs/ SKILL.md corpus, loader, injection scanner  (ADR-005)
  observability/  OpenTelemetry, logging, metrics
  ui/             Design system components
docs/             Architecture, product, and delivery documentation (source of truth)
skills/           34 reusable agent capability packs (not yet published — see .gitignore)
```

Structure and the enforced layering rules:
[docs/04-engineering/19-folder-structure.md](docs/04-engineering/19-folder-structure.md).
Packages are skeletons until their owning milestone; each `src/index.ts` names the milestone that
fills it in.

## Working on this project

This repository is developed under a standing governing specification. Read
[CLAUDE.md](CLAUDE.md) before contributing — it defines the milestone workflow, the approval
gates, and the rule that documentation precedes implementation.

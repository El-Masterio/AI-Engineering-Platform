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

**Phase 0 — Blueprint complete. No implementation yet.**

This repository currently contains architecture and planning documentation plus a library of
reusable agent capability packs. Implementation begins at milestone `M001`.

## Start here

| If you want to… | Read |
|---|---|
| Understand what we're building and why | [docs/00-foundation/01-product-vision.md](docs/00-foundation/01-product-vision.md) |
| See the whole documentation set | [docs/README.md](docs/README.md) |
| Understand the system shape | [docs/02-architecture/12-system-architecture.md](docs/02-architecture/12-system-architecture.md) |
| Understand how agents work | [docs/02-architecture/13-agent-architecture.md](docs/02-architecture/13-agent-architecture.md) |
| See the technology choices and their justification | [docs/02-architecture/14-technology-stack.md](docs/02-architecture/14-technology-stack.md) |
| Know what ships in the MVP | [docs/00-foundation/08-mvp-definition.md](docs/00-foundation/08-mvp-definition.md) |
| Pick up the next piece of work | [docs/backlog/BACKLOG.md](docs/backlog/BACKLOG.md) |
| Understand the execution plan | [docs/05-delivery/30-master-development-plan.md](docs/05-delivery/30-master-development-plan.md) |

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
docs/            Architecture, product, and delivery documentation (the source of truth)
skills/          34 reusable agent capability packs in SKILL.md format
```

Application code lands under `apps/` and `packages/` from milestone `M001` onward, per
[docs/04-engineering/19-folder-structure.md](docs/04-engineering/19-folder-structure.md).

## Working on this project

This repository is developed under a standing governing specification. Read
[CLAUDE.md](CLAUDE.md) before contributing — it defines the milestone workflow, the approval
gates, and the rule that documentation precedes implementation.

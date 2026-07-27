# Changelog

All notable changes to this project. Format follows [Keep a Changelog](https://keepachangelog.com/);
entries are generated from Conventional Commits and then edited for readability.

Every milestone updates this file **in its own commit** ([§22](04-engineering/22-development-standards.md)).

## [Unreleased]

Nothing yet. Implementation begins at `M001`.

---

## [0.0.0] — 2026-07-27 — Blueprint

Phase 0 complete. Architecture and planning documentation established. No application code.

### Added

**Governing specification**
- `CLAUDE.md` — permanent operating contract, milestone workflow, approval gates, project-memory map

**Product foundation (§1–9)**
- Product vision, mission, and problem statement
- Market analysis, competitor analysis, and target-audience segmentation
- Revenue model with modeled unit economics
- MVP definition — narrowed to 7 modules and 6 agents
- Nine-phase feature roadmap placing all 23 modules and 19 agents

**Requirements (§10–11)**
- Functional requirements across 10 modules with priorities and verification
- Non-functional requirements with measurable targets and verification methods, including an explicit
  conflict-resolution table

**Architecture (§12–17)**
- Control-plane / execution-plane system architecture
- Agent architecture: 19 roles, capability packs, orchestration, context strategy, memory tiers,
  verification gates, and guardrails against known agent failure modes
- Technology stack with nine-criteria evaluation per decision
- Database strategy with three-layer tenant isolation and expand/contract migration policy
- REST API strategy with streaming, idempotency, and versioning
- Security strategy with threat model, nine controls, and explicitly accepted risks

**Design (§18)**
- Original design system: two-layer token architecture, both themes contrast-verified, component
  library specification, motion budget, and binding accessibility requirements

**Engineering standards (§19–24)**
- Folder structure with enforced layer boundaries
- Documentation structure and immutable-ADR policy
- Coding standards with automated enforcement mapping
- Development standards: milestone lifecycle, Definition of Done, agent-collaboration rules
- Five-layer testing strategy including a first-class agent-evaluation layer
- CI/CD strategy with human-gated production promotion

**Delivery (§25–30)**
- Roadmap with critical path and re-planning triggers
- Milestone system: conventions, complexity model, progress tracker
- Risk register: 17 risks scored, with owned mitigations and accepted residuals
- Technical debt prevention with 12 pre-recorded deliberate debts and their triggers
- Future expansion strategy, including expansions explicitly rejected
- Master development plan with measured phase gates

**Backlog**
- 132 dependency-ordered milestones with objectives, complexity, deliverables, and acceptance criteria

**Decisions**
- ADR-001 — TypeScript monorepo with pnpm + Turborepo
- ADR-002 — Claude Managed Agents as the execution plane, behind an `AgentRuntime` port
- ADR-003 — PostgreSQL + pgvector as the single primary datastore
- ADR-004 — Model tiering by task class, resolved at runtime
- ADR-005 — `SKILL.md` as the agent capability-pack format
- ADR-006 — Modular monolith with enforced boundaries
- ADR-007 — Verification gates enforced structurally, not by prompt
- Decision log, ADR template, and a 10-entry assumptions register

### Notes

- **Scope pushback recorded.** The governing specification's 23 modules and 19 agents represent a
  multi-year program. The MVP was narrowed to 7 modules and 6 agents, with everything else sequenced
  across nine phases rather than dropped. See [§8](00-foundation/08-mvp-definition.md).
- **Assumptions are marked, not hidden.** Ten `ASSUMPTION-nnn` markers are registered in
  [ASSUMPTIONS.md](decisions/ASSUMPTIONS.md) with impact and resolution paths. Market sizing and unit
  economics are reasoned models, not research, and are flagged as such wherever they appear.
- The 34 capability packs in [`skills/`](../skills/) are designated the seed corpus for the platform's
  agent capability library (ADR-005).

[Unreleased]: https://github.com/El-Masterio/AI-Engineering-Platform/compare/v0.0.0...HEAD
[0.0.0]: https://github.com/El-Masterio/AI-Engineering-Platform/releases/tag/v0.0.0

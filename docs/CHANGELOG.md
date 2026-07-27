# Changelog

All notable changes to this project. Format follows [Keep a Changelog](https://keepachangelog.com/);
entries are generated from Conventional Commits and then edited for readability.

Every milestone updates this file **in its own commit** ([§22](04-engineering/22-development-standards.md)).

## [Unreleased]

### Added

- **M002 — Shared config and enforced boundaries.** The coding standards are now machine-enforced
  rather than reviewer-remembered.
  - `packages/config/tsconfig.base.json` hardened with the full [§21](04-engineering/21-coding-standards.md)
    set: `noUncheckedIndexedAccess`, `noImplicitOverride`, `noFallthroughCasesInSwitch`,
    `exactOptionalPropertyTypes`, `verbatimModuleSyntax`.
  - `eslint.config.js` — type-aware typescript-eslint plus `eslint-plugin-boundaries` encoding
    §19's layer table (folder elements *and* within-app file roles), unicorn, import-x, and jsx-a11y
    (armed for M008).
  - The `any` gate implemented literally as §21 states it: `no-explicit-any` is an error and the only
    escape is a disable comment carrying `-- justified: <reason>`, enforced by
    `eslint-comments/require-description`.
  - `.dependency-cruiser.cjs` — `no-circular` as an **error** (NFR-MAINT-4) plus a domain-purity rule.
  - Prettier, commitlint (§22's exact type list), husky `pre-commit` + `commit-msg`, lint-staged.
  - Root `tsconfig.json` — a workspace-spanning, emit-free view for tooling only.
  - New scripts: `lint`, `lint:fix`, `format`, `format:check`, `depcruise`, and `verify`.

### Fixed

- Three latent misconfigurations in the boundary tooling, each of which would have left a guardrail
  silently inert. Found only because M002 was verified adversarially — a clean lint run proved nothing:
  - `boundaries` resolves through the legacy `import/resolver` setting, not `import-x/resolver-next`;
    without it every cross-package import was classified "unknown" and skipped.
  - `checkAllOrigins` defaults to `false`, so external (npm) imports were never evaluated and the
    domain-purity rule could not fire.
  - Policy precedence is **last match wins**, not first — the broad "allow external" policy was
    shadowing every narrow disallow beneath it.
  - `dependency-cruiser` resolved workspace packages to `dist/`, which its own `exclude` dropped, so
    cross-package dependencies were absent from the graph entirely. Fixed with source `paths` in the
    root tsconfig.
- `boundaries/no-unknown-dependencies` is now an error, so an unclassifiable import fails loudly
  instead of silently bypassing the policy engine.

- **M001 — Monorepo and tooling.** pnpm workspaces + Turborepo with the full [§19](04-engineering/19-folder-structure.md)
  package skeleton: 3 apps (`web`, `api`, `orchestrator`) and 10 packages (`config`, `contracts`,
  `domain`, `db`, `agent-runtime`, `policy`, `cost`, `capability-packs`, `observability`, `ui`).
  Root `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `.npmrc`, `.nvmrc`.
  `packages/config` provides a baseline `tsconfig.base.json` that every package extends.

### Changed

- **Node pinned to 24 LTS**, not the 22 named in the blueprint — `ASSUMPTION-008` resolved at M001.
  pnpm `11.17.0`, Turborepo `2.10.7`, TypeScript `5.9.3` pinned alongside it.
  [§14](02-architecture/14-technology-stack.md) updated; ADR-001 intentionally left unedited because
  ADRs are immutable and the Node line was incidental to its decision.
  See [ASSUMPTIONS.md §008](decisions/ASSUMPTIONS.md).

### Notes

- `apps/api` and `apps/orchestrator` depend on `@atelier/domain` via `workspace:*` — present
  specifically so the "workspace protocol resolves internal deps" criterion is verified by a real
  build and a runtime execution rather than asserted.
- Framework scaffolding is deliberately absent: Next.js arrives at M009, Fastify at M016. M001 is the
  skeleton only.
- TypeScript 7.x is available but deferred — majors are a deliberate milestone per
  [§22](04-engineering/22-development-standards.md).

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

# 19. Folder Structure

## Principles

1. **Feature-first, not type-first.** Group by domain concept, not by technical kind. `milestones/`
   containing its routes, service, repository, and tests beats `controllers/`, `services/`,
   `repositories/` split across the tree.
2. **Dependencies point inward.** `domain` knows nothing. `app` knows `domain`. `infra` implements
   ports declared by `domain`/`app`. Never the reverse.
3. **Boundaries are enforced, not documented.** A lint rule fails the build on a violating import.
4. **Colocate tests with code.** `foo.ts` and `foo.test.ts` are neighbors. Only e2e tests live apart.
5. **Shared code is extracted only on the third use.** Two call sites are a coincidence.

## Repository layout

```
atelier/
├── apps/
│   ├── web/                      Next.js dashboard
│   ├── api/                      Fastify HTTP service
│   └── orchestrator/             Durable job workers
│
├── packages/
│   ├── domain/                   Pure business logic — ZERO external dependencies
│   ├── db/                       Drizzle schema, migrations, repositories
│   ├── agent-runtime/            AgentRuntime port + adapters
│   ├── policy/                   Authorization + gate decisions
│   ├── cost/                     Token accounting, budgets, credit conversion
│   ├── capability-packs/         Platform SKILL.md corpus + loader + scanner
│   ├── ui/                       Design system components
│   ├── contracts/               Zod schemas + generated API types
│   ├── observability/            OTel setup, logging, metrics
│   └── config/                   Validated env, shared tsconfig/eslint/tailwind
│
├── docs/                         The blueprint (this documentation)
├── skills/                       Reusable capability packs (dev-time + product seed)
├── infra/                        OpenTofu modules per environment
├── e2e/                          Playwright specs
├── evals/                        Agent evaluation suites + recorded fixtures
└── scripts/                      Dev tooling, migrations runner, seeds
```

## `packages/domain` — the core

Pure TypeScript. No imports from `db`, `api`, HTTP libraries, or any I/O. This is what makes the
business rules testable without a database, a network, or a model call (NFR-TEST-2).

```
packages/domain/src/
├── organizations/
│   ├── organization.ts           entity + invariants
│   ├── membership.ts
│   └── organization.test.ts
├── projects/
├── milestones/
│   ├── milestone.ts
│   ├── plan.ts                   the plan aggregate
│   ├── dependency-graph.ts       topological sort, cycle detection
│   └── dependency-graph.test.ts  ← pure, exhaustive, fast
├── tasks/
├── agents/
│   ├── agent-spec.ts             the agent specification type
│   └── tool-allowlist.ts
├── verification/
│   ├── review.ts
│   ├── test-result.ts
│   └── gate.ts                   gate evaluation rules
├── memory/
├── cost/
│   ├── budget.ts
│   └── credit.ts                 integer arithmetic, no floats
├── ports/                        interfaces the outside world implements
│   ├── agent-runtime.port.ts
│   ├── repository-host.port.ts
│   ├── object-store.port.ts
│   └── clock.port.ts             injected — never call Date.now() in domain
└── errors/
```

`ports/` is the hexagonal boundary. Domain declares what it needs; `infra` provides it.

## `apps/api`

```
apps/api/src/
├── server.ts                     Fastify instance, plugin registration
├── plugins/
│   ├── auth.plugin.ts
│   ├── tenant.plugin.ts          resolves TenantContext, sets RLS session var
│   ├── error-handler.plugin.ts   one place errors become the §16 envelope
│   ├── rate-limit.plugin.ts
│   └── otel.plugin.ts
├── modules/                      ← feature-first
│   ├── milestones/
│   │   ├── milestones.routes.ts       HTTP only: parse, authorize, delegate
│   │   ├── milestones.schema.ts       JSON Schema → OpenAPI
│   │   ├── milestones.service.ts      orchestration of domain + ports
│   │   ├── milestones.service.test.ts
│   │   └── milestones.integration.test.ts
│   ├── projects/  runs/  memory/  costs/  audit/  webhooks/
└── lib/
```

**Layer rules, lint-enforced:**

| Layer | May import | Must not |
|---|---|---|
| `*.routes.ts` | schema, service, policy | db, domain entities directly |
| `*.service.ts` | domain, db repositories, ports | Fastify, HTTP types |
| `db/repositories` | db schema, domain types | services, routes |
| `domain` | domain only | everything else |

A route handler containing business logic is a review rejection (NFR-MAINT-7).

## `apps/orchestrator`

```
apps/orchestrator/src/
├── worker.ts                     queue consumer bootstrap
├── jobs/
│   ├── generate-plan.job.ts
│   ├── execute-task.job.ts
│   ├── run-review-gate.job.ts
│   ├── run-test-gate.job.ts
│   └── finalize-milestone.job.ts
├── state/
│   ├── milestone-machine.ts      explicit state machine — the heart of the orchestrator
│   └── task-machine.ts
├── dispatch/
│   ├── ready-tasks.ts            dependency-aware selection
│   ├── concurrency.ts            per-project/org caps, file locks
│   └── backoff.ts
└── relay/
    └── outbox-relay.ts
```

The state machines are explicit files, not implicit control flow, because run state must be
inspectable and resumable after a restart (NFR-AVAIL-3).

## `packages/agent-runtime` — the load-bearing seam

```
packages/agent-runtime/src/
├── port.ts                       the 5-method interface (see §12)
├── types.ts                      AgentSpec, RunContext, RunEvent
├── adapters/
│   ├── managed/                  Phase 1 — hosted runtime
│   └── self-hosted/              Phase 7 — customer infrastructure
├── fake/                         in-memory adapter for tests
└── replay/                       record + replay for agent evals
```

`fake/` and `replay/` are as important as the real adapters — they are what make agent behavior
testable in CI without spending money or depending on the network.

## `packages/ui`

```
packages/ui/src/
├── tokens/
│   ├── tokens.css                the §18 custom properties
│   └── theme.ts
├── primitives/                   Button, Input, Badge, Icon…
├── layout/                       AppShell, Card, Panel…
├── data/                         DataTable, CodeBlock, DiffViewer, LogStream, Timeline…
├── feedback/                     Toast, Alert, Dialog, ApprovalGate…
└── charts/                       Phase 6
```

Every component ships `Component.tsx`, `Component.stories.tsx`, `Component.test.tsx`.

## `packages/capability-packs`

```
packages/capability-packs/
├── platform/                     our maintained corpus (seeded from skills/)
│   ├── backend-engineering/SKILL.md
│   ├── api-design/SKILL.md
│   ├── code-review-standards/SKILL.md
│   └── …
└── src/
    ├── loader.ts                 parse, validate frontmatter, resolve versions
    ├── scanner.ts                prompt-injection scan for untrusted packs
    └── registry.ts
```

## Naming conventions

| Kind | Convention | Example |
|---|---|---|
| Directories | `kebab-case` | `agent-runtime/` |
| TS files | `kebab-case.ts` | `dependency-graph.ts` |
| React components | `PascalCase.tsx` | `ApprovalGate.tsx` |
| Types / interfaces | `PascalCase`, no `I` prefix | `AgentSpec` |
| Functions / vars | `camelCase` | `resolveReadyTasks` |
| Constants | `SCREAMING_SNAKE` | `MAX_RETRY_ATTEMPTS` |
| Suffixes | `.routes` `.service` `.schema` `.repository` `.job` `.port` `.test` `.integration.test` `.stories` | |
| Booleans | `is`/`has`/`can`/`should` | `canApprove` |
| Async | verb-first, no `Async` suffix | `fetchMilestone` |
| Env vars | `SCREAMING_SNAKE`, prefixed | `ATELIER_DATABASE_URL` |

## Structural prohibitions

| Prohibited | Why |
|---|---|
| `utils/`, `helpers/`, `common/`, `shared/` as catch-alls | They become landfills. Name the concept: `packages/cost`, not `utils/money.ts`. |
| `index.ts` barrel files re-exporting everything | Kills tree-shaking, creates import cycles, obscures real dependencies. Explicit paths only. |
| Circular dependencies between packages | Build-failing (NFR-MAINT-4) |
| Business logic in `apps/web` | The web app calls the API; it does not own rules |
| Direct DB access from `apps/web` | Always through the API — otherwise authorization is bypassed |
| A file over 800 lines | Build failure. Over 400 is a warning. |
| `any` without an adjacent justification comment | Lint failure |

## Where a new feature goes

Worked example — adding **notifications** (Phase 2):

```
packages/domain/src/notifications/         entity + delivery rules (pure)
packages/db/src/schema/notifications.ts    table
packages/db/src/repositories/notifications.repository.ts
apps/api/src/modules/notifications/        routes, schema, service, tests
apps/orchestrator/src/jobs/deliver-notification.job.ts
packages/ui/src/feedback/NotificationList.tsx
docs/01-requirements/10-functional-requirements.md   ← FR-NOTIF-* added FIRST
```

Note the order in practice: the requirements entry is written before the code, per
[CLAUDE.md](../../CLAUDE.md).

## Related

- [12. High-Level System Architecture](../02-architecture/12-system-architecture.md)
- [21. Coding Standards](21-coding-standards.md)
- [23. Testing Strategy](23-testing-strategy.md)

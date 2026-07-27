# Decision Log

Chronological index of every architectural decision. ADRs are **immutable once accepted** — a changed
decision gets a new ADR that supersedes the old one, and the old one stays.

Format and rules: [§20](../04-engineering/20-documentation-structure.md#architecture-decision-records).

## Index

| ADR | Title | Status | Date | Reversal cost |
|---|---|---|---|---|
| [001](ADR-001-typescript-monorepo.md) | TypeScript monorepo with pnpm + Turborepo | Accepted | 2026-07-27 | High |
| [002](ADR-002-managed-agents-runtime.md) | Claude Managed Agents as the execution plane, behind an `AgentRuntime` port | Accepted | 2026-07-27 | **Medium — mitigated by design** |
| [003](ADR-003-postgres-primary-datastore.md) | PostgreSQL + pgvector as the single primary datastore | Accepted | 2026-07-27 | High |
| [004](ADR-004-model-tiering.md) | Model tiering by task class, resolved at runtime | Accepted | 2026-07-27 | Low |
| [005](ADR-005-skills-as-capability-format.md) | `SKILL.md` as the agent capability-pack format | Accepted | 2026-07-27 | Medium |
| [006](ADR-006-modular-monolith.md) | Modular monolith with enforced boundaries, not microservices | Accepted | 2026-07-27 | Medium |
| [007](ADR-007-verification-gates-structural.md) | Verification gates enforced structurally, not by prompt | Accepted | 2026-07-27 | **Very high — this is the product** |

## Pending decisions

Recorded so they aren't forgotten, with the trigger that forces the call.

| Decision | Trigger | Phase |
|---|---|---|
| Fastify vs. NestJS — revisit with implementation experience | P1 gate retrospective | 1 |
| Better Auth vs. WorkOS as the primary identity store | Enterprise demand arriving before Phase 7 | 1 or 7 |
| BullMQ vs. Temporal for orchestration | Deployment workflows needing multi-day, multi-approval state | 5 |
| pgvector vs. dedicated vector store | Vector search p95 > 200 ms, or embedding load affecting primary DB latency | 4+ |
| Managed containers vs. Kubernetes | Measured scale or cost crossover | 6 |
| Multi-provider model support | Provider risk materializing, or a competitor model clearly winning a task class | — |
| Canary deployments | Traffic sufficient for a statistically meaningful signal | 6 |

## Decisions deliberately deferred

Not pending — actively chosen *not* to decide yet, because deciding early would cost optionality
without buying anything.

| Deferred | Why | Revisit |
|---|---|---|
| Vertical product packaging (fintech, healthcare) | Needs customer evidence about which vertical | Phase 8+ |
| Fine-tuned or custom models | Frontier capability is improving faster than we could fine-tune | — |
| Pricing exact figures | §7's numbers are modeled; M050 measures reality | P1 gate |
| Autonomy level thresholds | Need real trust-metric distributions, not guesses | P2+ |

## Superseded decisions

None yet.

## Related

- [ASSUMPTIONS.md](ASSUMPTIONS.md) — every assumption made without owner input
- [ADR-TEMPLATE.md](ADR-TEMPLATE.md)
- [§20 Documentation Structure](../04-engineering/20-documentation-structure.md)

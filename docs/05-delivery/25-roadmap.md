# 25. Initial Project Roadmap

> `ASSUMPTION-009`: Durations assume a small focused team (2–4 engineers plus agent assistance).
> **Sequence and dependencies are decided; the calendar is an estimate.** Adjust dates freely;
> reordering requires an ADR because the dependency chain is load-bearing.

## Roadmap at a glance

| Phase | Theme | Milestones | Est. | Exit gate |
|---|---|---:|---|---|
| **P1** | Foundation & core loop (**MVP**) | M001–M052 | ~4 mo | MVP success criteria met with 20 design partners |
| **P2** | Collaboration & control | M053–M067 | ~2 mo | 3 users, 1 project, 5 milestones, zero platform-caused conflicts |
| **P3** | Engineering depth | M068–M082 | ~2.5 mo | Org capability packs measurably change output; security gate blocks a real vuln |
| **P4** | Product polish & breadth | M083–M094 | ~2 mo | Self-serve signup → first milestone, median < 1 h, unassisted |
| **P5** | Delivery & operations | M095–M107 | ~3 mo | 20 human-approved production deploys; 1 incident triaged end-to-end; 0 unapproved changes |
| **P6** | Commercial | M108–M118 | ~2.5 mo | 50 self-serve paying customers; measured gross margin ≥ 60% |
| **P7** | Enterprise readiness | M119–M128 | ~3 mo | One enterprise security review passed and contract signed |
| **P8** | Ecosystem & platform | M129–M132 | ~2.5 mo | 25 third-party packs; 10% of runs use a customer-authored agent |
| **P9** | Increasing autonomy | continuous | — | Each level earned on measured data (see §9) |

**Cumulative to MVP: ~4 months. To commercial viability: ~14 months. To enterprise-ready: ~17 months.**

## Phase 1 in detail — the only phase estimated with confidence

Phase 1 is decomposed into five stages with hard internal gates. This is the phase where getting the
order wrong is most expensive, because everything later depends on it.

### Stage 1A — Skeleton (M001–M012) · ~3 weeks

Monorepo, tooling, CI, database with RLS from the first migration, config validation, observability
skeleton, design tokens, app shell.

**Gate:** a trivial endpoint deploys to staging through the full pipeline, traced end to end, with a
passing cross-tenant test on a two-table schema.

> Why RLS and audit logging land in Stage 1A rather than later: both are structurally impossible to
> retrofit. Everything else in Phase 1 can be reordered; these two cannot.

### Stage 1B — Identity & tenancy (M013–M022) · ~3 weeks

Auth, sessions, organizations, memberships, the policy engine, audit log, API conventions and error
envelope.

**Gate:** authorization matrix fully tested; cross-tenant suite covering every table green; every
state change audited.

### Stage 1C — Agent substrate (M023–M036) · ~5 weeks

The `AgentRuntime` port and managed adapter, agent specification schema, capability-pack loader,
sandbox provisioning, tool allowlist enforcement, run event streaming with replay, cost ledger,
budget ceilings, circuit breaker, fake adapter, replay harness.

**Gate:** a single agent completes a trivial task in a sandbox with correct cost accounting, an
enforced tool allowlist, a budget ceiling that actually pauses the run, and a stream that survives
reconnection. The adversarial suite's "no secret in context" assertions pass.

**This is the highest-risk stage in the entire program.** It is also where the ADR-002 bet either
holds or doesn't, so it is deliberately placed early enough that discovering a problem is survivable.

### Stage 1D — Orchestration & verification (M037–M047) · ~4 weeks

Director planning, plan approval gate, task graph materialization, dependency-aware dispatch,
implementer agents, the review gate with structural self-review prevention, the test gate, retry and
quarantine, memory read/write, GitHub integration and PR creation.

**Gate:** the full twelve-step journey from §12 completes end to end on a real repository.

### Stage 1E — Product surface & hardening (M048–M052) · ~2 weeks

Run detail view, plan approval UI, cost panel, milestone board, error states, empty states,
accessibility pass, load test, penetration-test remediation, design-partner onboarding.

**Gate:** the MVP success criteria in §8, measured across 20 design partners and 200 milestones.

## Critical path

The longest dependency chain — delay anything here and the whole program slips:

```
M001 monorepo
  → M004 database + RLS
  → M014 auth
  → M017 policy engine
  → M023 AgentRuntime port
  → M026 managed adapter + sandbox
  → M030 tool allowlist enforcement
  → M033 cost ledger + budget ceiling
  → M037 Director planning
  → M040 task graph dispatch
  → M043 review gate
  → M045 test gate
  → M047 PR creation
  → MVP
```

**Everything else in Phase 1 is parallelizable around this chain.** Design system work, documentation,
and UI shell can proceed independently and should, to keep the critical path unblocked.

## Dependency-ordered phase graph

```
P1 Foundation ──┬──▶ P2 Collaboration ──┬──▶ P4 Polish ──▶ P6 Commercial ──┬──▶ P7 Enterprise
                │                        │                                   │
                └──▶ P3 Depth ───────────┘                                   └──▶ P8 Ecosystem
                                          │
                                          └──▶ P5 Delivery & Ops
```

- **P2 and P3 can overlap** with different people — collaboration is mostly product surface,
  engineering depth is mostly agent work.
- **P5 (deployment) requires P3's Security Engineer agent.** Letting agents touch production before a
  security gate exists is not a trade we make.
- **P6 (commercial) requires P4's self-serve onboarding.** Charging for a product that needs
  hand-holding to start doesn't work.
- **P7 requires P6.** Enterprise sales without billing infrastructure and measured margins is
  premature.
- **P8 requires stable capability-pack and agent contracts** from P3.

## Quarterly view

| Quarter | Focus | Deliverable |
|---|---|---|
| Q1 | Stages 1A–1C | Agent substrate proven; the ADR-002 bet validated or not |
| Q2 | Stages 1D–1E + P2 start | **MVP with design partners** |
| Q3 | P2 complete + P3 | Teams, specialists, org capability packs |
| Q4 | P4 + P5 start | Self-serve product; deployment in preview |
| Q5 | P5 complete + P6 | Production delivery; **first revenue** |
| Q6 | P7 | Enterprise readiness; first enterprise contract |
| Q7+ | P8 + P9 | Platform, ecosystem, earned autonomy |

## Re-planning triggers

The roadmap is revised — not quietly slipped — when any of these occur:

| Trigger | Response |
|---|---|
| Stage 1C reveals the managed runtime can't meet requirements | **Stop. Re-plan the runtime layer.** This is the single scariest finding and must be surfaced immediately, not worked around. |
| MVP completion rate < 50% | Narrow supported project types; do not add features |
| A competitor ships our differentiators | Reassess positioning per §5's review triggers |
| Measured COGS per milestone > $25 | Cost work is promoted ahead of features |
| A design partner hits a security issue | Everything stops until it's resolved and regression-tested |
| Enterprise demand arrives early with real contracts | Pull P7 items forward; do not skip P6 |

## What is explicitly not on this roadmap

Recorded so they aren't rediscovered as "obvious" later:

- Mobile apps (the product is a desktop tool; monitoring on mobile at most)
- Multi-cloud
- Non-Claude model providers (behind the tier abstraction; not a roadmap item until there's a reason)
- Real-time collaborative editing (agents do the editing)
- On-premise full installation (self-hosted *execution* in P7 is a different, smaller thing)
- Fine-tuned or custom models

## Related

- [9. Feature Roadmap](../00-foundation/09-feature-roadmap.md)
- [26. Milestone Breakdown](26-milestone-breakdown.md)
- [BACKLOG.md](../backlog/BACKLOG.md)
- [30. Master Development Plan](30-master-development-plan.md)

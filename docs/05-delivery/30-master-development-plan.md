# 30. Master Development Plan

The single document that ties the blueprint into an executable program. If you read one section
before starting work, read this one.

## The plan in one page

| | |
|---|---|
| **What we're building** | An AI engineering organization: plan → implement → **independently review** → **test** → document → deliver, with memory, cost control, and an audit trail |
| **Why it can win** | Verification, memory, and governance are hard to retrofit and invisible in a demo — so well-funded competitors chasing benchmarks tend to defer them |
| **The core loop** | Goal → approved plan → sandboxed implementation → independent review → test gate → PR with a completion report |
| **First deliverable** | MVP: 1 user, 1 project, 1 repo, 6 agents, 7 modules, ~4 months |
| **The big bet** | Rent the execution plane ([ADR-002](../decisions/ADR-002-managed-agents-runtime.md)); own the orchestration, verification, and governance |
| **The riskiest stage** | Stage 1C (M023–M036) — the agent substrate. Deliberately early, so a bad finding is survivable |
| **The number that matters most** | Seeded-defect detection rate in the review eval suite. It is the only direct measurement of the product's central claim |
| **How we know it's working** | Milestone acceptance without rework ≥ 70%; COGS ≤ $15/milestone; zero security incidents |

## Execution model

```
    BLUEPRINT (done)
         │
         ▼
    ┌─────────────────────────────────────────────┐
    │  For each milestone, in backlog order:      │
    │                                             │
    │  1. Load prior decisions (ADRs, arch docs)  │
    │  2. Review completed milestones             │
    │  3. Verify dependencies satisfied           │
    │  4. Write the implementation plan           │
    │  5. Implement ONLY this milestone           │
    │  6. Test · refactor · verify with output    │
    │  7. Update documentation                    │
    │  8. Update roadmap + backlog status         │
    │  9. Update project memory                   │
    │ 10. Write the completion report             │
    │ 11. STOP. Await the next instruction.       │
    └─────────────────────────────────────────────┘
                          │
                    phase gate (measured)
                          ▼
                     next phase
```

This is the workflow encoded in [CLAUDE.md](../../CLAUDE.md). Steps are not skipped, and step 11 is
real: the platform's Director stays in Director mode unless told to implement.

## Phase gates — measured, not opinions

A phase does not end because the calendar says so. Each gate is a set of numbers.

| Phase | Gate criteria |
|---|---|
| **P1 → P2** | 20 design partners · 200 milestones attempted · ≥ 70% completion without human code intervention · ≥ 60% PR merge without rework · COGS ≤ $15/milestone · **zero security incidents** · ≥ 50% of partners say they'd pay |
| **P2 → P3** | 3 concurrent users on one project through 5 milestones with zero platform-caused conflicts · RBAC authorization matrix fully tested |
| **P3 → P4** | An org capability pack demonstrably changes agent output (≥ 90% convention adherence) · security gate blocks a real seeded vulnerability · knowledge base citations verifiably correct |
| **P4 → P5** | Self-serve signup → first delivered milestone, median < 1 h, unassisted · WCAG 2.2 AA conformance verified · existing-repo import works on 10 real customer codebases |
| **P5 → P6** | 20 human-approved production deploys · 1 incident triaged end-to-end · **zero unapproved production changes** · rollback exercised successfully |
| **P6 → P7** | 50 self-serve paying customers · measured blended gross margin ≥ 60% · cost estimate accuracy within ±30% |
| **P7 → P8** | One enterprise security review passed and contract signed · **M127 self-hosted adapter passes the same AgentRuntime conformance suite as the managed adapter** |
| **P8 → P9** | 25 third-party capability packs · 10% of runs invoke a customer-authored agent |

Note the P7 gate: it doesn't just require the self-hosted adapter to exist, it requires it to pass the
*same* conformance suite. That is how we prove the ADR-002 exit ramp is real rather than nominal.

## The first ten milestones

Concrete, ordered, ready to start.

| ID | Title | Cx | Why here |
|---|---|---|---|
| M001 | Initialize monorepo, pnpm workspaces, Turborepo | S | Everything depends on it |
| M002 | Shared config: tsconfig, ESLint with boundary rules, Prettier | S | Standards enforced from commit one, not retrofitted |
| M003 | CI pipeline: static analysis, test, build | M | A pipeline added later never catches up |
| M004 | Postgres + Drizzle + **first migration with RLS enabled** | M | 🔒 Tenant isolation is impossible to retrofit |
| M005 | Config validation — process refuses to boot on invalid env | S | Cheap, prevents a whole class of production incident |
| M006 | Observability skeleton: OTel tracing, structured logging with redaction | M | Debugging Stage 1C without traces is misery |
| M007 | Design tokens + Tailwind wiring | S | 🏗 Blocks all UI; unblocks parallel work |
| M008 | UI primitives: Button, Input, Badge, Icon, StatusIndicator | M | Parallelizable off the critical path |
| M009 | AppShell + routing skeleton | S | Somewhere to put screens |
| M010 | Docker compose dev environment + seed script | S | One-command onboarding |

**Start with M001.** The critical path (§25) runs M001 → M004 → M014 → M017 → M023 → M026 → M030 →
M033 → M037 → M040 → M043 → M045 → M047. Everything else is parallel work that should be used to keep
that chain unblocked.

## Decision authority

| Decision type | Who | Mechanism |
|---|---|---|
| Product strategy, pricing, scope | Owner | Direct |
| Phase entry/exit | Owner | Gate review against measured criteria |
| Architecture within a phase | Architect role | ADR; owner approval only if it contradicts an existing ADR |
| Technology choice | Architect role | ADR with the nine-criteria evaluation |
| Implementation approach | Implementer | PR review |
| Security control | Security role | **Veto power. Never overridden for schedule.** |
| Milestone splitting | Implementer | Backlog update |
| Autonomy level increase | Owner | Only on measured trust metrics |

The security veto is absolute and deliberate. A schedule pressure that can override a security
control isn't a control.

## Cadence

| Rhythm | Activity |
|---|---|
| Per milestone | Plan → implement → verify → document → completion report |
| Daily | Merge to `main`; auto-deploy to staging |
| Weekly | Dependency updates; backlog grooming; flaky-test triage |
| Per phase gate | Measured criteria review; risk register review; retrospective |
| Monthly | Risk register; backup restore drill; debt trigger audit |
| Quarterly | Documentation review; competitor reassessment; eval corpus refresh; health metrics review |
| Per release | Full eval suite; human spot-check of 10% of eval outputs |

## What success looks like at each horizon

| Horizon | Success |
|---|---|
| **1 month** | Stage 1A + 1B done. An endpoint deploys through the full pipeline, traced, with a green cross-tenant suite. |
| **3 months** | Stage 1C + 1D done. The twelve-step journey completes end to end on a real repository. **The ADR-002 bet is validated.** |
| **4 months** | MVP with 20 design partners. Real completion-rate and COGS data replacing this blueprint's models. |
| **9 months** | Teams, specialist agents, org capability packs. Agencies encoding their standards. |
| **14 months** | Self-serve revenue. Production delivery. Measured unit economics. |
| **17 months** | First enterprise contract. Self-hosted execution proving the abstraction holds. |
| **24 months** | Platform: marketplace, public API, customer-authored agents. Autonomy L2 earned by the best-performing organizations. |

## The five things not to get wrong

Concentrated advice, in priority order:

1. **Never compromise tenant isolation.** It is the only failure that cannot be fixed after the fact.
   RLS from the first migration, generated cross-tenant tests, 95% coverage floor.
2. **Never let an agent self-approve.** The moment review becomes theatre, the product's central claim
   is false and the whole thesis collapses. Enforce it in the orchestrator, the policy engine, *and*
   the database.
3. **Never report work as done when it isn't.** Failing tests mean blocked. This is the exact failure
   mode the product exists to prevent — doing it to ourselves would be disqualifying.
4. **Never let cost be invisible.** Ledger from M001. Estimates before approval. Budgets that actually
   pause runs. Margin is the difference between a business and a hobby.
5. **Never skip the documentation step.** This blueprint is only valuable if it stays true. A codebase
   that has drifted from its documentation is worse than one with no documentation, because the
   documentation is now actively misleading.

## Where the blueprint is weakest

Stated honestly so the gaps get closed rather than inherited:

| Weakness | How to fix it |
|---|---|
| **Market sizing and competitor detail are reasoned, not researched** (§4, §5) | Primary research before any fundraise or pricing commitment |
| **Unit economics are modeled, not measured** (§7) | M050 instruments this; replace the numbers with real ones at the P1 gate |
| **Timeline estimates are guesses** (§25) | Recalibrate after Stage 1A ships and we have actual velocity |
| **Backend framework and auth choices are medium-confidence** (§14) | Both flagged in the doc; revisit at the P1 gate with implementation experience |
| **Agent prompt quality is unproven** | Nothing in a blueprint can establish this. Stage 1C/1D and the eval corpus are the only answer |
| **The managed runtime's real limits are unknown** | Stage 1C is deliberately early precisely to find out |

The honest summary: **the architecture is sound and the sequencing is defensible; the numbers are
provisional and the agent quality is unproven.** Those are the two things the first four months exist
to resolve.

## Related

- [CLAUDE.md](../../CLAUDE.md) — the governing operating specification
- [BACKLOG.md](../backlog/BACKLOG.md) — all 132 milestones
- [25. Initial Project Roadmap](25-roadmap.md)
- [26. Milestone Breakdown](26-milestone-breakdown.md)
- [27. Risk Analysis](27-risk-analysis.md)
- [decisions/DECISION-LOG.md](../decisions/DECISION-LOG.md)

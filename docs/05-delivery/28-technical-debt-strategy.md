# 28. Technical Debt Prevention Strategy

## The distinction that matters

**Deliberate debt** is a decision: we chose a simpler solution, recorded why, and defined the trigger
for revisiting it. That is engineering.

**Accidental debt** is erosion: a shortcut nobody wrote down, a standard that decayed, a boundary that
blurred one PR at a time. That is what kills codebases.

**Our strategy is to make deliberate debt visible and cheap, and to make accidental debt structurally
difficult.**

## Prevention: make the wrong thing hard

Ranked by effectiveness. Automation beats process; process beats intention.

| Mechanism | Prevents |
|---|---|
| **Enforced module boundaries** (eslint-plugin-boundaries) | Layer violations — the highest-impact form of architectural decay |
| **No circular dependencies** (dependency-cruiser, build-failing) | Tangled graphs that make extraction impossible later |
| **`packages/domain` has zero dependencies** | Business logic becoming untestable |
| **TypeScript strict + `noUncheckedIndexedAccess`** | Whole categories of runtime bug |
| **`any` requires inline justification** | Type erosion at the edges |
| **Coverage floors per path, CI-enforced** | Untested security-critical code |
| **File size limits** (400 warn / 800 fail) | God objects |
| **Dead code detection** (knip) | Accumulating unreachable code |
| **Bundle and Lighthouse budgets** | Performance debt, which is invisible until it's expensive |
| **Generated API docs** | Documentation drift |
| **`ASSUMPTION-nnn` register** | Unexamined guesses hardening into facts |
| **ADR requirement with reversal cost + revisit triggers** | One-way doors walked through unnoticed |

The last row is worth emphasizing: an ADR template that forces you to write down *how to undo this*
turns out to prevent a large fraction of regretted decisions, because the question is often
unanswerable at the moment you're about to commit.

## The debt register

Every piece of deliberate debt is recorded — in code and in a tracked list.

```ts
// DEBT(D-014): In-memory dependency-graph resolution. Fine to ~500 tasks
// per project; will need an incremental algorithm beyond that.
// Trigger: any project exceeding 300 tasks, or graph resolution > 200ms p95.
// Owner: orchestrator. See docs/05-delivery/28-technical-debt-strategy.md
```

Format: `DEBT(D-nnn): <what> · <bound> · Trigger: <observable condition> · Owner: <area>`

A `DEBT` comment without a trigger is not acceptable — "someday" is not a plan.

### Known deliberate debt at blueprint time

Recorded now so it isn't rediscovered as a surprise:

| ID | Debt | Bound | Revisit trigger | Phase |
|---|---|---|---|---|
| **D-001** | Modular monolith instead of services | Fine to ~50 engineers | Team > 25, or independent scaling need on one module | 6+ |
| **D-002** | BullMQ + explicit Postgres state instead of a durable workflow engine | Fine for single-approval, hours-long flows | Deployment workflows need multi-day, multi-approval state machines | 5 |
| **D-003** | pgvector in the primary database | Fine to ~5M chunks | Vector search p95 > 200 ms, or embedding load affects primary DB latency | 4+ |
| **D-004** | Single-region deployment | Fine until EU customers | First enterprise residency requirement | 7 |
| **D-005** | Managed containers, not Kubernetes | Fine to ~1,000 concurrent runs | Scale or cost crossover, measured | 6 |
| **D-006** | Single model provider | Fine while quality leads | Provider risk materializes, or a competitor's model clearly wins a task class | — |
| **D-007** | Fixed agent definitions (not user-editable) | Fine for MVP | Customer demand for custom agents | 8 |
| **D-008** | Dark mode only | Fine for design partners | Self-serve launch | 4 |
| **D-009** | GitHub only | Fine for the beachhead | GitLab demand from a paying segment | 4 |
| **D-010** | No ZDR (managed runtime constraint) | Blocks some enterprise | First lost deal citing ZDR | 7 |
| **D-011** | Rolling deploys, no canary | Fine at low traffic | Traffic sufficient for a meaningful canary signal | 6 |
| **D-012** | Documentation Writer role folded into Director | Fine for MVP | Doc quality complaints, or Director prompt bloat | 3 |

Each of these is a *decision with an exit*, which is the entire point of the distinction.

## Debt budget

**20% of each phase's capacity is reserved for debt, quality, and maintenance.** Not "if there's
time" — reserved, and spent.

| Allocation | Use |
|---|---|
| 10% | Recorded debt whose trigger has fired |
| 5% | Dependency updates, security patches, toolchain maintenance |
| 5% | Opportunistic improvement in code being touched anyway |

**If the debt budget is consumed by unplanned work three phases in a row, the process is broken and
gets a retrospective — not a bigger budget.** A budget that always overruns is a measurement, not a
constraint.

## The Boy Scout rule, bounded

Leave code better than you found it — **within the scope of your change**.

| Do | Don't |
|---|---|
| Improve a name you're already editing | Rename across the codebase in a feature PR |
| Add a missing test for code you're modifying | Refactor an adjacent module "while you're there" |
| Fix a bug you introduced upstream | Restructure a package outside your milestone |
| Delete dead code your change orphans | Bundle a migration into a UI PR |

Unrelated improvements become their own milestone. A PR that does two things cannot be reviewed
carefully or reverted cleanly — and mixing refactors with features is the most common way a good
change becomes unrevertable.

## Debt-specific to this product

Two categories that don't appear in a normal codebase, and that would otherwise accumulate invisibly:

### Prompt and capability-pack debt

Prompts are code. They decay the same way, and worse: nothing type-checks them.

| Debt form | Control |
|---|---|
| Prompt bloat — instructions accreted to patch one-off failures | Every prompt change requires an eval run showing it helps; quarterly prompt review to *remove* accumulated patches |
| Contradictory instructions in one prompt | Review checklist item; conflicting guidance is a defect, not a nuance |
| Stale model-specific workarounds | On every model migration, **delete** prior workarounds and re-measure before re-adding. Carried-forward workarounds frequently become counterproductive on newer models. |
| Capability-pack drift from actual practice | Packs are versioned and reviewed alongside the standards they encode |
| Over-prescriptive scaffolding | Newer models perform *worse* with step-by-step scaffolding written for older ones. A/B with scaffolding removed at each migration. |

That last row is a genuinely counterintuitive maintenance obligation and is easy to miss: prompt
instructions that were load-bearing on one model generation can actively degrade the next.

### Evaluation debt

| Debt form | Control |
|---|---|
| Eval corpus no longer represents real usage | Quarterly refresh from anonymized real tasks |
| Eval scores drifting up because cases got easier | Fixed baseline set that never changes, plus a rotating set |
| Seeded-defect suite going stale | New defect classes added from real review findings |
| Grader model bias | 10% human spot-check every release |

## Quarterly health review

Metrics tracked over time. **A trend matters more than an absolute value.**

| Metric | Target | What a bad trend means |
|---|---|---|
| Open debt items with a fired trigger | 0 | We're accumulating faster than we remediate |
| Coverage on security-critical paths | ≥ 95% | Security erosion |
| Median PR size | < 400 lines | Milestones are too big; review quality is dropping |
| PR cycle time | < 24 h | Review is a bottleneck |
| Flaky test rate | < 1% | **The safety net is being abandoned** |
| Build time (p95) | < 8 min | People will start batching changes |
| Dependency freshness | < 90 days behind | Upgrade cliff forming |
| `any` count | Flat or falling | Type erosion |
| Files > 400 lines | Falling | Structural decay |
| Eval baseline scores | Flat or rising | Quality regression |
| COGS per accepted milestone | Falling | Cost architecture failing |

## Refactoring policy

| Situation | Approach |
|---|---|
| Small, local, in scope | Do it now |
| Cross-module, behavior-preserving | Its own milestone, marked ♻️ |
| Requires an architecture change | ADR first, then a milestone |
| "This whole thing is wrong" | Strangler pattern — never a big-bang rewrite |
| Debt trigger fired | Schedule against the debt budget in the next phase |

**Rewrites are prohibited without an ADR that includes a strangler migration plan.** A big-bang
rewrite is how a team spends a year and ships nothing — and the second version reliably reintroduces
the bugs the first one had already fixed.

## Related

- [21. Coding Standards](../04-engineering/21-coding-standards.md)
- [22. Development Standards](../04-engineering/22-development-standards.md)
- [27. Risk Analysis](27-risk-analysis.md)
- [decisions/DECISION-LOG.md](../decisions/DECISION-LOG.md)

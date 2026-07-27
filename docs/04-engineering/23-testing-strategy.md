# 23. Testing Strategy

## Philosophy

**Test behavior, not implementation.** A test that breaks when you rename a private method is a
liability. A test that breaks when the behavior changes is an asset.

**Coverage is a floor, not a goal.** 80% coverage of trivial getters proves nothing. We set high floors
on the paths where a bug is unrecoverable, and use judgment elsewhere.

**A bug fix ships with a test that failed before the fix.** No exceptions. This is how a codebase stops
regressing.

## The distinctive problem

Testing this platform has a category of problem most products don't: **we must test non-deterministic
agent behavior**. A model call returns different text every time. Standard testing gives no answer, so
Layer 5 below is a first-class part of the strategy rather than an afterthought.

## Test pyramid

```
        ╱╲          Layer 5 — Agent evaluations      (slow, scheduled)
       ╱  ╲                    ~40 suites
      ╱────╲       Layer 4 — E2E                     (slow, on merge)
     ╱      ╲               ~25 journeys
    ╱────────╲     Layer 3 — Integration             (medium, every PR)
   ╱          ╲             ~300 tests
  ╱────────────╲   Layer 2 — Contract                (fast, every PR)
 ╱              ╲           ~80 tests
╱────────────────╲ Layer 1 — Unit                    (fast, every commit)
                            ~1,200 tests
```

---

## Layer 1 — Unit tests (Vitest)

**Scope:** pure domain logic. No database, no network, no model call.

This layer is only fast and comprehensive *because* `packages/domain` has zero external dependencies
(§19). The architecture exists partly to make this layer possible.

**Highest-value targets:**

| Target | Why |
|---|---|
| `dependency-graph.ts` — topological sort, cycle detection | A cyclic plan deadlocks the orchestrator. Exhaustively tested, including pathological graphs. |
| `gate.ts` — verification gate evaluation | Determines whether work is "done." Wrong here and the product's core claim is false. |
| `budget.ts` / `credit.ts` — cost arithmetic | Money. Integer arithmetic, boundary conditions, no floats. |
| `tool-allowlist.ts` | A security boundary. |
| State machine transitions | Every valid and invalid transition asserted. |

**Rules:** no mocks of our own code (if you need to, the boundary is wrong); table-driven tests for
rule matrices; property-based tests (fast-check) for the dependency graph and credit arithmetic.

## Layer 2 — Contract tests

**Scope:** the shape of every boundary.

| Contract | Test |
|---|---|
| API request/response schemas | Every endpoint's JSON Schema validates its fixtures; OpenAPI generation succeeds |
| Agent output contracts | Structured output validates against its Zod schema, including malformed-output handling |
| `AgentRuntime` port | Every adapter (managed, self-hosted, fake) passes the *same* shared conformance suite |
| Database schema ↔ types | Drizzle types match the migration state |
| Capability pack format | Frontmatter validation, version resolution, injection-scan behavior |

**The shared `AgentRuntime` conformance suite is what makes ADR-002 reversible in practice rather than
in theory.** If the self-hosted adapter passes the same suite as the managed one, the abstraction holds.
If it can't, we learn that before we're depending on it.

## Layer 3 — Integration tests

**Scope:** real Postgres (Testcontainers), real Redis, real HTTP. Fake agent runtime.

| Area | Coverage |
|---|---|
| Every API endpoint | Happy path, validation failure, auth failure, authorization failure, not-found |
| **Cross-tenant isolation** | See below — the most important suite in the codebase |
| Authorization matrix | Every (role × action × resource) combination asserted |
| Migrations | Applied forward and rolled back against production-shaped data volume |
| Transactions | Partial failure leaves no inconsistent state |
| Idempotency | Replayed request returns the original response and does not double-charge |
| Outbox | Events published exactly once despite crashes mid-relay |
| SSE streams | Reconnect with `Last-Event-ID` replays without loss or duplication |
| Query counts | Asserted, so an N+1 regression fails the build |

### The cross-tenant suite

Generated, not hand-written — a hand-written suite will miss the table someone added last week.

```
for each table with organization_id:
  for each of (select, insert, update, delete):
    assert: as tenant B, operating on tenant A's row → zero rows / denied
```

**Runs on every commit. A failure blocks the release.** 95% coverage floor (NFR-SEC-1). This suite is
the reason we can make a tenant-isolation claim to an enterprise buyer.

## Layer 4 — End-to-end (Playwright)

**Scope:** real browser, real API, real database, **fake agent runtime with scripted responses**.

The critical journeys:

1. Sign up → create org → create project → connect repo
2. Submit goal → plan generated → **approve plan** → milestone executes → PR opened
3. Run streams live; interrupt mid-run; run stops cleanly
4. Review gate fails → work loops back → passes on retry
5. Budget ceiling reached → run pauses → user raises ceiling → resumes
6. Team member invited → accepts → sees shared project with correct permissions
7. Cost dashboard reflects an actual run's spend
8. Approval gate on a destructive action cannot be bypassed

**Rules:** semantic locators only (`getByRole`, `getByLabel`) — never CSS selectors; no arbitrary
waits, only web-first assertions; each test seeds and tears down its own data; `axe` accessibility
assertion in every journey.

Agent responses are **scripted** here. E2E tests exercise *our* logic, not the model's.

## Layer 5 — Agent evaluations ⟵ the hard part

**Scope:** does the agent organization actually produce good software?

This is not standard testing, and treating it as such is how teams end up shipping agents that
regress silently.

### Three modes

**Mode A — Replay (in CI, deterministic, free)**
Real model interactions recorded once, then replayed from fixtures. Verifies *our* orchestration,
parsing, gate logic, and cost accounting deterministically. Runs on every PR.

**Mode B — Live evaluation (scheduled, costs money)**
Real model calls against a fixed corpus of tasks with graded rubrics. Runs nightly on `main` and
before every release.

**Mode C — Adversarial / red-team (scheduled + on security changes)**
Deliberately hostile inputs. See below.

### The evaluation corpus

| Suite | What it measures | Pass criterion |
|---|---|---|
| **Planning quality** | Given 20 goals, is the plan coherent, correctly ordered, acyclic, complete? | Rubric score ≥ 80%; zero cycles |
| **Implementation correctness** | 30 tasks with hidden reference test suites | ≥ 75% pass hidden tests |
| **Review efficacy** | 25 diffs with **known seeded defects** | ≥ 80% of seeded defects found; false-positive rate ≤ 20% |
| **Test quality** | Do generated tests actually catch a mutation? | Mutation score ≥ 60% |
| **Convention adherence** | Does an org capability pack change behavior? | ≥ 90% adherence to the stated convention |
| **Memory utility** | Does the agent use prior decisions rather than re-litigating? | Measured on paired runs with and without memory |
| **Cost regression** | Tokens per completed task, by tier | No more than +15% vs. the previous release |
| **Refusal handling** | Does a safety-classifier refusal degrade gracefully? | No crash; fallback engages; user informed |

**Review efficacy with seeded defects is the single most important suite we have.** It is the only
direct measurement of the product's core claim. If seeded-defect detection drops, we have a product
emergency regardless of what every other metric says.

### Mode C — Adversarial suite

| Attack | Expected outcome |
|---|---|
| Prompt injection in a README, issue, or web page | Agent does not follow it; attempt is logged and alerted |
| Injection instructing the agent to print its credentials | Impossible — no secret is in context. Assert the absence. |
| Malicious capability pack attempting to grant a tool | Rejected by the scanner; allowlist unchanged |
| Attempt to write outside the project root | Blocked by path containment |
| Attempt to reach a non-allowlisted host | Blocked by egress policy; logged |
| Attempt to reach cloud metadata endpoints | Blocked |
| Attempt to escalate to a production deploy without approval | Denied by the policy engine |
| Runaway loop / no-progress spin | Circuit breaker halts within budget |

Runs nightly and on any change to the policy engine, tool layer, or sandbox configuration.

### Non-determinism handling

| Technique | Detail |
|---|---|
| Rubric-based grading | A grader model scores against explicit criteria, not string equality |
| Multiple samples | 5 runs per eval case; report pass rate and variance, not a single result |
| Baseline comparison | Every eval compares to the last release, so we detect *regression* even when absolute scores are noisy |
| Statistical gates | A release blocks on a statistically significant regression, not on one bad sample |
| Human spot-check | 10% of eval outputs reviewed manually each release — automated grading has its own blind spots |

## Coverage requirements

| Path | Floor | Rationale |
|---|---|---|
| Overall | 80% | Baseline |
| `packages/domain` | 90% | Pure logic; no excuse |
| Authentication & authorization | 95% | Security boundary |
| Tenant isolation | 95% | Unrecoverable failure |
| Policy engine | 95% | Every permission decision flows through it |
| Cost metering & budgets | 95% | Money |
| Tool permission layer | 95% | Security boundary |
| UI components | 70% | Diminishing returns; visual regression covers the rest |

Coverage is measured on lines *and* branches. A PR that lowers coverage on a security-critical path
fails CI.

## What we deliberately do not test

Stated to prevent effort going to low-value places:

- Third-party library internals.
- Framework behavior (that React renders, that Fastify routes).
- Getters, trivial mappers, and generated code.
- **Exact model output text.** We test that our system handles output correctly, and separately
  evaluate output *quality* with rubrics. Asserting on generated prose is a test that fails randomly.
- Visual appearance in unit tests — that's what visual regression is for.

## Test quality standards

| Rule | Reason |
|---|---|
| One behavior per test | A failure should localize the bug |
| Descriptive names: `it("pauses the run when the budget ceiling is reached")` | The name is the specification |
| Arrange–Act–Assert, visibly | Readability |
| No logic in tests | A conditional in a test means it's testing two things |
| No shared mutable state between tests | Order-dependent tests are worse than no tests |
| Deterministic | A flaky test is quarantined within 24 h and fixed or deleted — never re-run until green |
| Fixture builders, not fixture files | `aMilestone({ status: "blocked" })` beats a 200-line JSON blob |

## CI execution

| Stage | Runs | Duration target |
|---|---|---|
| Pre-commit | Lint, typecheck, changed-file unit tests | < 10 s |
| Every PR | Unit, contract, integration, cross-tenant, replay evals, a11y, budgets | < 8 min |
| On merge to `main` | Above + full E2E + visual regression | < 20 min |
| Nightly | Live agent evals, adversarial suite, mutation testing, restore drill | ~2 h |
| Pre-release | Everything + manual eval spot-check + performance soak | ~4 h |

## Related

- [11. Non-Functional Requirements](../01-requirements/11-non-functional-requirements.md)
- [13. AI Agent Architecture](../02-architecture/13-agent-architecture.md)
- [17. Security Strategy](../02-architecture/17-security-strategy.md)
- [24. CI/CD Strategy](24-cicd-strategy.md)

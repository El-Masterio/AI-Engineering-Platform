# 24. CI/CD Strategy

## Principles

1. **`main` is always deployable.** If it isn't, that is the only thing anyone works on.
2. **Every check that can be automated is a gate, not a suggestion.** A standard enforced by memory is
   a standard that decays.
3. **Deploys are boring.** Small, frequent, reversible. A deploy should be the least interesting event
   of the day.
4. **Production promotion is a human decision.** Automated all the way to staging; deliberate to
   production.
5. **Rollback is always available and always tested.** An untested rollback is a hope.

## Pipeline

```
 push / PR
    │
    ├─▶ [1] Static analysis        ~90 s   ┐
    ├─▶ [2] Unit + contract        ~2 min  │ parallel
    ├─▶ [3] Integration            ~4 min  │
    ├─▶ [4] Build                  ~3 min  ┘
    │
    ├─▶ [5] Replay agent evals     ~3 min
    ├─▶ [6] Quality budgets        ~2 min
    │
    └─▶ [7] Preview environment    ~2 min   (PR only)

 merge to main
    │
    ├─▶ [8] Full E2E + visual regression  ~12 min
    ├─▶ [9] Container build + sign + SBOM ~4 min
    ├─▶ [10] Deploy to STAGING            auto
    ├─▶ [11] Smoke + soak on staging      ~5 min
    │
    └─▶ [12] ═══ HUMAN PROMOTION ═══ → PRODUCTION
                │
                ├─▶ Migrations (backward-compatible, separate step)
                ├─▶ Rolling deploy, health-gated
                ├─▶ Post-deploy verification
                └─▶ Auto-rollback on SLO burn
```

### Implementation status

`.github/workflows/ci.yml` implements stages **1, 2 and 4** as of M003. The rest are scaffolded by
this document, not by code, and land with the milestones that give them something to run.

| Stage | Status | Lands at |
|---|---|---|
| 1 Static analysis | ✅ live | M003 |
| 2 Unit + coverage | ✅ live | M003 |
| 3 Integration | ⏳ nothing to run — no database exists | M004 |
| 4 Build | ✅ live | M003 |
| 5 Replay agent evals | ⏳ no orchestrator | M037+ |
| 6 Quality budgets | ⏳ partial — an axe suite and the WCAG contrast gate run inside stages 1–2; bundle size and Lighthouse need a deployed target | M083+ |
| 7–12 Preview → production | ⏳ no deployment target | M011+ |

A stage is not added to the workflow until it has something real to assert. A job that passes
because it has nothing to run is not a gate, and it is worse than no job at all — it reports green
and teaches people the pipeline is covering something it is not.

### Stage detail

| # | Stage | Contents | Blocks merge |
|---|---|---|---|
| 1 | Static analysis | Prettier check, ESLint, `tsc --noEmit`, dependency-cruiser (no cycles), knip (dead code), gitleaks, license check, WCAG contrast gate, Storybook-compiled-CSS gate | ✅ |
| 2 | Unit + contract | Vitest, coverage floors enforced per path | ✅ |
| 3 | Integration | Testcontainers Postgres + Redis, **cross-tenant suite**, authorization matrix, migration up/down | ✅ |
| 4 | Build | Turborepo build of all packages and apps; type-check across boundaries | ✅ |
| 5 | Replay agent evals | Deterministic fixtures — orchestration, gate logic, cost accounting | ✅ |
| 6 | Quality budgets | Bundle size, Lighthouse (LCP/INP), axe accessibility | ✅ |
| 7 | Preview env | Ephemeral deploy, seeded synthetic data, URL commented on the PR | — |
| 8 | E2E + visual | Playwright across the 25 journeys; visual regression on the component library | ✅ (post-merge revert if red) |
| 9 | Artifact | Multi-arch container build, digest-pinned, cosign-signed, SBOM generated, image scan | ✅ |
| 10 | Staging deploy | Automatic on green | — |
| 11 | Staging verification | Smoke tests, 5-minute soak, error-rate check | ✅ for promotion |
| 12 | Production | **Manual approval** → migrate → rolling deploy → verify | — |

**Caching:** Turborepo remote cache keyed on content hash; pnpm store cached; Docker layer cache. A
no-op PR should complete stage 1–6 in under three minutes, because a slow pipeline is a pipeline people
route around.

## Deployment strategy

| Environment | Strategy | Rationale |
|---|---|---|
| Preview | Fresh ephemeral instance per PR, destroyed on close | Isolation; cheap review |
| Staging | Rolling | Production-like verification |
| **Production** | **Rolling with health gates**, canary from Phase 6 | Rolling is sufficient and far simpler at MVP scale. Canary earns its complexity only once we have the traffic to make its signal meaningful. |

Rejected for now: **blue-green** (doubles infrastructure cost for a benefit rolling already provides
at our scale) and **canary at MVP** (needs traffic volume we won't have to produce a statistically
useful signal).

### Migrations

Migrations are a **separate, ordered step** — never bundled into the application deploy.

```
1. Apply migration (additive only, backward-compatible)
2. Verify schema state
3. Deploy application
4. (Later release) contract phase drops the old column
```

Rules: index creation always `CONCURRENTLY`; no long-lived exclusive locks; destructive migrations
require explicit human approval (NFR-SEC-8); every migration's rollback is tested in staging before
production.

### Zero-downtime requirements

| Requirement | Implementation |
|---|---|
| Graceful shutdown | `SIGTERM` → stop accepting, drain in-flight, exit. Orchestrator finishes or re-queues its current job. |
| Readiness gating | Traffic only after the readiness probe passes |
| Backward-compatible schema | Old and new application versions coexist during a rolling deploy |
| **In-flight agent runs survive a deploy** | Run state is in Postgres, not process memory (NFR-AVAIL-3) |
| Idempotent job handlers | A re-queued job is safe to run twice |

The fourth row is the one that matters most to users: a deploy must never kill someone's half-finished
milestone.

## Rollback

| Trigger | Action | Time target |
|---|---|---|
| Error rate > 2% for 3 min | **Automatic** rollback to previous image | < 3 min |
| SLO fast-burn alert | **Automatic** rollback | < 3 min |
| Manual judgment | One-command rollback | < 5 min |
| Bad migration | Forward fix preferred; tested `down` migration as fallback | Case by case |

**Rollback never requires a rebuild.** The previous image is retained and redeployable by digest.
Feature flags provide a faster path still: disable the feature without a deploy at all.

## Feature flags

| Rule | Detail |
|---|---|
| All user-visible incomplete work ships behind a flag | Enables trunk-based development with short branches |
| Flags have an owner and an expiry date | An 18-month-old flag is technical debt with a config file |
| Kill-switch flags for every external dependency | Model provider, sandbox runtime, Git host — degrade rather than fail |
| Flag state is audited | A behavior change without a deploy still needs a record |
| Flag cleanup is a backlog item at creation time | Not "later" |

## Secrets in CI

| Rule | Detail |
|---|---|
| **No long-lived cloud credentials** | OIDC federation from CI to the cloud provider; short-lived tokens only |
| Secrets scoped per environment | Staging credentials cannot touch production |
| No secrets in logs | CI output scrubbed; a leaked secret triggers immediate rotation |
| Fork PRs get no secrets | Untrusted code never sees a credential |
| Signing keys in a hardware-backed store | Image signing |

## Observability of the pipeline itself

| Metric | Target | Why |
|---|---|---|
| PR pipeline duration (p95) | < 8 min | Beyond this, people batch changes and PRs get bigger |
| `main` → staging | < 20 min | Fast feedback |
| Deploy frequency | ≥ daily | Small changes are safer changes |
| Change failure rate | < 15% | DORA |
| Mean time to restore | < 1 h | DORA |
| Flaky test rate | < 1% | Above this, engineers stop trusting red builds — which is the real damage |

The flaky-test metric is not vanity. A team that has learned to re-run CI until it's green has lost
its safety net entirely.

## Infrastructure as code

| Rule | Detail |
|---|---|
| OpenTofu for everything | No manual console changes in any environment, ever |
| State in remote backend with locking | No local state files |
| **`plan` reviewed before `apply`** | Applies to human and agent authors alike |
| Production apply requires human approval | Even in Phase 5 when agents write IaC |
| Environments are modules with different variables | Parity by construction (NFR-CN-6) |
| Drift detection nightly | Detected drift is an incident, not a shrug |

## Release management

- **Continuous deployment** to staging; **continuous delivery** to production (human-triggered).
- Versioning: date-based release tags for the platform; SemVer for the published SDK and packages.
- `CHANGELOG.md` generated from Conventional Commits, then hand-edited for readability.
- Public changelog for customer-visible changes.
- Deprecations announced with `Deprecation`/`Sunset` headers and 12 months of support (§16).

## Related

- [22. Development Standards](22-development-standards.md)
- [23. Testing Strategy](23-testing-strategy.md)
- [11. Non-Functional Requirements](../01-requirements/11-non-functional-requirements.md)
- `skills/ci-cd-devops/` — pipeline templates and deployment-gate patterns

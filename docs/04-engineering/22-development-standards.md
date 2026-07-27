# 22. Development Standards

How work moves from an idea to production. Complements [21. Coding Standards](21-coding-standards.md)
(how code is written) and [CLAUDE.md](../../CLAUDE.md) (the milestone workflow).

## The milestone as the unit of work

Everything is a milestone from [BACKLOG.md](../backlog/BACKLOG.md). No unplanned work enters `main`
without a backlog entry — including "quick fixes." An unplanned change is an unreviewed change to the
plan.

### Milestone lifecycle

```
Backlog → Ready → In Progress → In Review → Verified → Merged → Documented
```

| Gate | Requirement |
|---|---|
| **→ Ready** | Dependencies complete; acceptance criteria unambiguous; requirements documented |
| **→ In Progress** | Branch created; implementation plan written *before* the first edit |
| **→ In Review** | All acceptance criteria met; tests written and passing locally; docs updated in-branch |
| **→ Verified** | CI green; review approved; coverage floors held |
| **→ Merged** | Squash-merged to `main` |
| **→ Documented** | `CHANGELOG` entry; backlog status updated; ADR written if a decision was made |

**A milestone with failing tests is never marked complete.** There is no override. If it can't pass,
it reports blocked with the actual failure output.

## Branching

**Trunk-based with short-lived branches.**

```
main                          always deployable, protected
  └── milestone/M042-cost-ledger
  └── fix/M042-followup-null-guard
  └── chore/bump-drizzle
```

| Rule | Detail |
|---|---|
| One milestone per branch | Named `milestone/M0NN-slug` |
| Lifetime | Target < 3 days. A branch open a week is a milestone that was too big. |
| Rebase on `main` | Not merge — keeps history linear and bisectable |
| Squash merge | One commit per milestone in `main` |
| `main` is protected | No direct pushes, no force pushes, CI required, review required |
| Feature flags for incomplete work | Merge behind a flag rather than holding a long branch |

## Commits

**Conventional Commits.** The format is machine-parsed for changelog generation, so it's enforced by a
commit-msg hook.

```
<type>(<scope>): <subject>

<body — why, not what>

Refs: M042
```

Types: `feat` `fix` `refactor` `perf` `test` `docs` `chore` `build` `ci` `revert`

| Rule | Detail |
|---|---|
| Imperative mood, lowercase, no trailing period | `add cost ledger`, not `Added cost ledger.` |
| Subject ≤ 72 chars | Readable in `git log --oneline` |
| Body explains **why** | The diff already shows what |
| One logical change per commit | A commit that does two things can't be reverted cleanly |
| Breaking changes marked | `feat(api)!:` plus a `BREAKING CHANGE:` footer |
| Never commit generated files | Except lockfiles and `openapi.json` |

## Pull requests

### Required PR content

```markdown
## What
One paragraph. What changed and why.

## Milestone
M042 — Cost ledger

## Acceptance criteria
- [x] Every model call writes a cost entry
- [x] Per-run budget ceiling pauses the run
- [x] Cross-tenant test passes

## Verification
$ pnpm test  →  412 passed
$ pnpm test:tenant  →  38 passed
(paste real output — not "tests pass")

## Documentation
- Updated docs/01-requirements/10-functional-requirements.md (FR-COST-*)
- Added ADR-011

## Risk & rollback
Additive migration; revert is safe. Feature-flagged as `cost.ledger.enabled`.
```

**"Verification" requires actual pasted output.** A claim that tests pass is not evidence that tests
pass — this rule applies identically to human and agent contributors.

### PR rules

| Rule | Detail |
|---|---|
| Size target | < 400 changed lines. Over 800 requires a stated reason. |
| One reviewer minimum; two on the security boundary | Auth, authorization, tenancy, secrets, egress |
| CI green before review | Don't spend a reviewer's attention on a red build |
| Author never self-approves | Mirrors the agent rule in §13 — same principle, same reason |
| Draft PRs are encouraged early | Cheap course correction |
| Address every comment | Resolve or reply; silent dismissal is not acceptable |

## Definition of Done

A milestone is done when **all** of these hold. Partial completion is reported as partial, never as
done.

- [ ] Every acceptance criterion demonstrably met
- [ ] Unit tests for new logic; integration tests for new endpoints
- [ ] Coverage floors held (80% overall / 95% on security-critical paths)
- [ ] Cross-tenant test passes if any data path changed
- [ ] Accessibility checks pass if any UI changed
- [ ] Performance budgets held
- [ ] No new lint or type errors; no new `any` without justification
- [ ] Requirements doc updated
- [ ] ADR written if an architectural decision was made
- [ ] `CHANGELOG.md` updated
- [ ] Runbook written if a new alert was added
- [ ] Observability: new code paths are traced and logged
- [ ] Migration is additive and reversible; rollback tested
- [ ] Feature flag added if the work is user-visible and incomplete
- [ ] Backlog status updated

## Local development

```bash
pnpm install
pnpm db:up                # Postgres + Redis via docker compose
pnpm db:migrate
pnpm db:seed              # realistic fixtures, never production data
pnpm dev                  # web + api + orchestrator concurrently
```

| Requirement | Detail |
|---|---|
| One command to a working environment | If setup takes more than `install` + `db:up` + `dev`, that's a bug to fix |
| No shared dev database | Every developer runs their own |
| **Never real customer data locally** | Seeds are synthetic. This is a hard rule. |
| Environment validated at startup | The process refuses to boot on invalid config (NFR-CN-3) |
| `.env.example` is complete and current | Missing a variable is a build failure via config validation |

### Pre-commit hooks (fast — under 10 seconds)

Format staged files · lint staged files · typecheck changed packages · secret scan · commit-message
lint.

Hooks are never bypassed with `--no-verify`. If a hook is wrong, fix the hook.

## Dependency management

| Rule | Detail |
|---|---|
| New dependency requires justification in the PR | Size, maintenance status, license, and what we'd do if it were abandoned |
| Prefer the standard library | Then a small focused package. Never a framework to solve a function-sized problem. |
| Licenses | MIT / Apache-2.0 / BSD / ISC only. Copyleft or source-available (BUSL, SSPL) requires explicit approval |
| Lockfile committed; CI uses `--frozen-lockfile` | Reproducible builds |
| Automated updates weekly | Patch/minor auto-merge on green CI; majors are a deliberate milestone |
| Security advisories | Critical patched within 48 h; high within 7 days |

## Environments

| Env | Purpose | Data | Deploy |
|---|---|---|---|
| **local** | Development | Synthetic seeds | N/A |
| **preview** | Per-PR ephemeral | Synthetic seeds | Automatic on PR |
| **staging** | Pre-production verification | Anonymized, production-shaped | Automatic on merge to `main` |
| **production** | Live | Real | **Manual promotion, human-approved** |

Environments differ only in scale and configuration (NFR-CN-6). A bug that only reproduces in
production means the parity rule was violated somewhere.

## Working with agents on this codebase

We use agents to build the platform, which makes us our own first customer. Same rules apply, plus:

| Rule | Reason |
|---|---|
| Agent-authored PRs follow the identical Definition of Done | No lower bar for machine output |
| Agent output is reviewed by a human before merge to `main` | Until our own trust metrics justify otherwise — see the autonomy ladder in §9 |
| An agent never merges its own PR | Same principle as §13's no-self-approval rule |
| The `claude-api` skill is loaded before writing any model-calling code | It is authoritative over recalled API patterns; recalled patterns are frequently stale |
| Prompt and capability-pack changes are reviewed like code | They *are* code — they change behavior |
| A milestone implemented by an agent records the agent version used | Reproducibility |

Dogfooding is deliberate: if we won't trust the product with our own codebase, we shouldn't be
selling it.

## Related

- [CLAUDE.md](../../CLAUDE.md)
- [21. Coding Standards](21-coding-standards.md)
- [24. CI/CD Strategy](24-cicd-strategy.md)
- [28. Technical Debt Prevention](../05-delivery/28-technical-debt-strategy.md)

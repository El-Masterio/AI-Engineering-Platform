# 8. MVP Definition

## A necessary piece of pushback

The governing specification names **23 core modules** and **19 agent roles**. Built properly — with
the production-grade, secure, observable, GDPR-ready quality bar also specified — that is a
**multi-year program for a funded team**, not an MVP. Attempting it as one release produces 23
half-built modules and no shippable product.

So this document defines a deliberately narrow MVP, and
[9. Feature Roadmap](09-feature-roadmap.md) phases the remaining 21 modules and 13 agents. **Nothing
is dropped; everything is sequenced.** The full scope remains the target and is preserved in the
roadmap and the 132-milestone backlog.

I'm flagging this rather than quietly narrowing the work: if you want a broader v1, the constraint
to relax is the timeline or the quality bar, and that choice is yours, not mine.

---

## MVP thesis

> **One user, one project, one repository, one goal → an approved plan, then a delivered increment
> that an independent agent reviewed and a test suite verified.**

If that single loop works reliably and the user trusts the result, the product is real and
everything else is expansion. If it doesn't, no amount of additional modules saves it.

## The one journey the MVP must nail

1. Sign up, create an organization.
2. Create a project. Connect a GitHub repository (existing or empty).
3. Describe a goal in prose.
4. **Director agent** produces an architecture note + a dependency-ordered milestone plan with a
   credit estimate.
5. User approves the plan (or edits and re-approves).
6. User says "start milestone 1."
7. Specialists implement in a sandboxed container: Architect → Backend and/or Frontend Engineer.
8. **Code Reviewer** (independent, different session, no self-approval) reviews the diff.
9. **QA Engineer** writes and runs tests. Failures loop back to the implementer, bounded by budget.
10. Documentation Writer updates docs.
11. A pull request appears on the user's GitHub with a completion report: what changed, what was
    reviewed, test output, credits consumed.
12. User reviews the PR in GitHub and merges. Project memory records the decisions.

Every screen, endpoint, and agent in the MVP exists to serve those twelve steps.

---

## MVP scope — IN

### Modules (7 of 23)

| Module | MVP scope |
|---|---|
| **Authentication** | Email+password, OAuth (GitHub, Google), sessions, password reset. No SSO/SAML. |
| **Organizations** | Single org per user. Owner role only. Tenant isolation enforced from day one. |
| **Projects** | CRUD, one connected Git repository, project settings, archive. |
| **AI Agents** | 6 roles (below). Fixed definitions; not user-editable. |
| **Tasks & Milestones** | Director-generated plan, dependency ordering, status, approval gate, task graph execution. |
| **Repositories** | GitHub App integration: clone, branch, commit, push, open PR. GitHub only. |
| **Memory** | Project memory store: architecture decisions, conventions, completed work, known issues. Versioned. |

### Agents (6 of 19)

| Agent | Responsibility | Can it write code? | Can it deploy? |
|---|---|---|---|
| **Director** | Decompose goal → architecture note + milestone plan; assign work; own the plan | No | No |
| **Software Architect** | Component design, data model, ADRs for the milestone | No | No |
| **Backend Engineer** | Server, API, database implementation | Yes | No |
| **Frontend Engineer** | UI implementation | Yes | No |
| **Code Reviewer** | Independent review; **structurally cannot review its own work** | No | No |
| **QA Engineer** | Write and run tests; report results honestly | Tests only | No |

Documentation is handled by the Director in the MVP (a Documentation Writer agent arrives in Phase 3).

### Cross-cutting (non-negotiable from M001)

These are in the MVP not because they're exciting but because retrofitting them is a rewrite:

- **Tenant isolation** — `organization_id` on every row, Postgres row-level security, app-layer guard.
- **Immutable audit log** — every agent action, tool call, and human approval.
- **Secrets never in agent context** — credential vault with egress-time injection.
- **Sandboxed execution** — no host network, egress allowlist, ephemeral containers, resource caps.
- **Cost metering** — per-run token accounting and a per-run budget ceiling.
- **Structured observability** — OpenTelemetry traces spanning API → agent run → tool call.
- **Design tokens** — the design system's primitives, so later UI isn't a re-skin.

### Product surface

- Dashboard: project list, project detail, milestone board.
- Run view: live-streaming agent output, tool calls, diffs, test results.
- Plan approval screen.
- Cost panel: estimate before, actual after.
- Settings: organization, repository connection, API keys.
- **Light mode only in MVP** (dark mode is Phase 4 — the token layer supports a second palette
  without component changes). Inverted by Design System v2.0; see
  [ADR-008](../decisions/ADR-008-design-system-v2.md).

---

## MVP scope — OUT (with the phase it lands in)

Naming these explicitly is how we prevent scope creep.

| Deferred | Phase | Why deferred |
|---|---|---|
| Teams, multi-user orgs, RBAC | 2 | Single-user proves the loop; multi-user is additive |
| 13 remaining agent roles | 3–6 | Each adds surface area before the core loop is proven |
| Deployment & production monitoring | 5 | The riskiest capability; earn trust on code first |
| Billing & subscriptions | 6 | Design partners, not self-serve revenue, in MVP |
| Marketplace | 8 | Requires a stable capability-pack contract |
| Chat interface | 2 | The plan+run view is the primary interaction; chat is a second surface |
| Knowledge base / document ingestion | 3 | Memory covers the MVP need |
| Analytics, admin console | 6 | No customers to analyze yet |
| Notifications | 2 | Polling the run view is acceptable for design partners |
| GitLab / Bitbucket | 4 | GitHub covers the beachhead |
| SSO / SCIM / data residency | 7 | Enterprise-gated; architected for, not built |
| Dark mode | 4 | v2.0 is light-first; the directive names "too dark" as a thing to avoid |
| Public API / SDK / webhooks | 8 | Internal API stabilizes first |
| Self-hosted execution | 7 | Managed sandbox is sufficient and far simpler |

---

## Non-goals for the MVP

- Not optimizing cost beyond the mechanisms listed. Measure first.
- Not supporting every language and framework. TypeScript/Node and Python only.
- Not handling monorepos or multi-repo projects.
- Not aiming for full autonomy. Human approval at plan and merge is a *feature* in v1.
- Not aiming for scale. 50 design-partner organizations is the target load.

---

## MVP success criteria

The MVP is validated — and Phase 2 is authorized — only when all of these hold across ≥ 20 design
partners and ≥ 200 attempted milestones:

| Criterion | Threshold |
|---|---|
| Milestone completion rate (delivered, review passed, tests green) | ≥ 70% without human code intervention |
| Merge rate of Atelier-opened PRs | ≥ 60% merged without substantive rework |
| Independent review catches real defects | ≥ 1 material finding per 3 milestones |
| Test suites generated actually run in CI | ≥ 90% |
| Median time from goal to first delivered milestone | < 4 hours |
| Cost estimate accuracy | Actual within ±30% of pre-approval estimate, 80% of the time |
| COGS per accepted milestone | ≤ $15 |
| Security incidents (sandbox escape, secret leak, cross-tenant access) | **0 — non-negotiable** |
| Design partners who say they'd pay | ≥ 50% |

If completion rate lands below 50%, the correct response is to narrow the supported project types
further, not to add features.

## Related

- [9. Feature Roadmap](09-feature-roadmap.md)
- [10. Functional Requirements](../01-requirements/10-functional-requirements.md)
- [26. Milestone Breakdown](../05-delivery/26-milestone-breakdown.md)
- [30. Master Development Plan](../05-delivery/30-master-development-plan.md)

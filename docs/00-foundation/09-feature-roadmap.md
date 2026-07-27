# 9. Feature Roadmap

Nine phases. Every module and agent from the governing specification is placed. Durations assume a
small focused team and are `ASSUMPTION-005` — sequence is the decision, calendar is an estimate.

## Phase map

| Phase | Theme | Modules added | Agents added | Est. |
|---|---|---|---|---|
| **0** | Blueprint | — | — | done |
| **1** | Foundation & the core loop (**MVP**) | 7 | 6 | ~4 mo |
| **2** | Collaboration & control | +4 | +1 | ~2 mo |
| **3** | Engineering depth | +2 | +5 | ~2.5 mo |
| **4** | Product polish & breadth | +1 | +2 | ~2 mo |
| **5** | Delivery & operations | +3 | +2 | ~3 mo |
| **6** | Commercial | +4 | +1 | ~2.5 mo |
| **7** | Enterprise readiness | +1 | +1 | ~3 mo |
| **8** | Ecosystem & platform | +1 | +1 | ~2.5 mo |
| **9** | Increasing autonomy | — | — | continuous |

Cumulative: **23 modules, 19 agents**, matching the specification.

---

## Phase 1 — Foundation & core loop (MVP)

**Goal:** one user takes one goal to a reviewed, tested, merged increment.

Modules: Authentication · Organizations · Projects · AI Agents · Tasks & Milestones · Repositories · Memory
Agents: Director · Software Architect · Backend Engineer · Frontend Engineer · Code Reviewer · QA Engineer

Also lands (cross-cutting, non-deferrable): tenant isolation with RLS, immutable audit log,
credential vault, sandbox execution, cost metering with budget ceilings, OpenTelemetry tracing,
design tokens.

**Exit:** [MVP success criteria](08-mvp-definition.md#mvp-success-criteria) met.

---

## Phase 2 — Collaboration & control

**Goal:** a team can work on one project without colliding; the human can steer mid-run.

Modules: **Teams** · **Chat** · **Notifications** · **Settings** (full)
Agents: **Refactoring Agent**

Features:
- Multi-user organizations, invitations, roles (Owner / Admin / Member / Viewer).
- RBAC enforced at API and data layer.
- Chat as a second interaction surface: steer a running agent, ask questions about the project.
- Mid-run interrupt and redirect.
- Notifications: in-app, email, Slack webhook — run complete, approval needed, budget threshold.
- Per-user and per-team preferences.
- Concurrency control: task-level locking so two agents don't edit the same file.

**Exit:** three users collaborate on one project through five milestones with zero merge conflicts
caused by the platform.

---

## Phase 3 — Engineering depth

**Goal:** the agent organization gets specialists, and knowledge stops living only in prose.

Modules: **Documents** · **Knowledge Base**
Agents: **Database Engineer** · **Security Engineer** · **Documentation Writer** · **Research Agent** · **Performance Engineer**

Features:
- Document ingestion: PDFs, specs, existing docs → chunked, embedded, retrievable.
- Knowledge base with citations; agents cite sources in their reasoning.
- Schema design and migration authoring as a dedicated role, with a destructive-migration gate.
- Security review as a mandatory gate on auth, data-access, and input-handling changes.
- Documentation Writer takes over docs from the Director.
- Research Agent for technology evaluation, producing comparison matrices and ADR drafts.
- Performance Engineer: profiling, query analysis, bundle budgets.
- **Organization capability packs** — customers author standards in `SKILL.md` format and every
  agent in the org inherits them. This is the retention feature for agencies.

**Exit:** an organization's own standards demonstrably change agent output; security gate blocks a
real vulnerability in testing.

---

## Phase 4 — Product polish & breadth

**Goal:** stop being a design-partner tool; become a product someone finds on their own and adopts.

Modules: **Architecture** (as a first-class explorable module)
Agents: **UI Designer** · **UX Designer**

Features:
- Light mode; full WCAG 2.2 AA conformance pass.
- Architecture module: living component graph, dependency view, ADR browser, drift detection.
- Design agents: design tokens, component specs, accessibility review, visual regression checks.
- GitLab and Bitbucket support.
- Responsive/tablet layouts.
- Onboarding: templates, sample projects, guided first run.
- Repository import and analysis for existing (non-greenfield) codebases — critical for the
  "make my AI-generated code maintainable" job to be done.

**Exit:** self-serve signup to first delivered milestone with no human assistance, median < 1 hour.

---

## Phase 5 — Delivery & operations

**Goal:** close the loop from code to production. The highest-risk phase; gated hardest.

Modules: **Deployment** · **Monitoring** · **Code Generation** (as an explicit managed subsystem)
Agents: **DevOps Engineer** · **Infrastructure Engineer**

Features:
- Deployment targets: containers to a managed host, plus Vercel/Netlify for frontends.
- Environment management: dev / staging / production with separate credentials.
- IaC generation (OpenTofu) with a mandatory plan-review gate.
- **Production deploys always require human approval.** No exceptions, no setting to disable in v1.
- Monitoring: golden-signal dashboards, SLO definitions, burn-rate alerting.
- Incident response: agent triages an alert, proposes a fix, opens a PR. Never auto-remediates
  production in this phase.
- Rollback as a first-class, one-click, always-available action.

**Exit:** 20 successful human-approved production deploys; one incident correctly triaged
end-to-end; zero unapproved production changes.

---

## Phase 6 — Commercial

**Goal:** self-serve revenue.

Modules: **Billing** · **Analytics** · **Administration** · (education tier)
Agents: **Support Agent**

Features:
- Stripe subscriptions, seat management, credit purchase and metering.
- Real-time cost dashboards: per project, per milestone, per agent, per model tier.
- Budget alerts and enforcement; spend forecasting.
- Usage analytics: milestone success rates, review findings, agent performance, cost trends.
- Internal admin console: org management, impersonation with audit, feature flags, quota overrides.
- Support Agent: in-product help grounded in our own documentation, escalation to humans.

**Exit:** first 50 self-serve paying customers; unit economics measured, not modeled; blended gross
margin ≥ 60%.

---

## Phase 7 — Enterprise readiness

**Goal:** pass a security review at a regulated company.

Modules: **Administration** (enterprise scope)
Agents: **Business Analyst**

Features:
- SAML/OIDC SSO; SCIM user provisioning and deprovisioning.
- Fine-grained RBAC and custom roles.
- Audit log export (SIEM-compatible); configurable retention.
- Data residency: EU and US processing regions.
- GDPR operations: DSR endpoints, right-to-erasure workflows, DPA, sub-processor register.
- Self-hosted / VPC execution: agent tool execution inside the customer's own infrastructure.
- Contractual guarantee that customer code and prompts are never used for model training.
- SOC 2 Type II readiness.
- Business Analyst agent: requirements elicitation, acceptance criteria authoring, traceability.

**Exit:** one enterprise customer passes security review and signs an annual contract.

---

## Phase 8 — Ecosystem & platform

**Goal:** others build on Atelier.

Modules: **Marketplace**
Agents: **Product Manager**

Features:
- Public versioned REST API + TypeScript SDK.
- Webhooks for run lifecycle events.
- Marketplace: capability packs, agent templates, project templates. Paid listings, 70/30 split.
- Third-party tool integration via MCP: customers connect their own tools to agents.
- Custom agent authoring: define a role, prompt, tool allowlist, model tier, and budget.
- CLI for local workflows.
- Product Manager agent: roadmap synthesis, prioritization, changelog authoring.

**Exit:** 25 third-party capability packs published; 10% of runs invoke a customer-authored agent.

---

## Phase 9 — Increasing autonomy (continuous)

Not a phase with an end date. The platform earns autonomy by demonstrating reliability, and each
step is gated on measured data — never on optimism.

| Autonomy level | Unlocked when |
|---|---|
| **L0** — Human approves plan and every merge | MVP default |
| **L1** — Human approves plan; merges auto when review + tests pass | Merge-without-rework rate ≥ 85% over 100 milestones |
| **L2** — Human approves the goal; the plan auto-approves | Plan-edit rate < 10% over 100 plans |
| **L3** — Agents propose their own milestones from a backlog | L2 stable for a quarter |
| **L4** — Continuous autonomous operation with exception-only escalation | L3 stable; incident rate below defined threshold |

Additional continuous work: self-improvement loops (agents propose refinements to their own
capability packs from observed failures), cross-project learning within an organization, and
automatic model migration as new models ship.

**Autonomy is never granted by configuration alone. It is earned per-organization, on measured
history, and is revocable automatically if the metric regresses.**

## Related

- [8. MVP Definition](08-mvp-definition.md)
- [25. Initial Project Roadmap](../05-delivery/25-roadmap.md)
- [BACKLOG.md](../backlog/BACKLOG.md)
- [29. Future Expansion Strategy](../05-delivery/29-future-expansion.md)

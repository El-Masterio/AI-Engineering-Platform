# 10. Functional Requirements

## Conventions

- **ID:** `FR-<module>-<n>`. IDs are permanent; deprecated requirements are struck through, never renumbered.
- **Priority:** `P0` MVP · `P1` Phase 2–3 · `P2` Phase 4–6 · `P3` Phase 7–9.
- **Verification:** every requirement must be testable. If it can't be tested, it's a goal, not a requirement.
- Requirements marked **[SEC]** have a corresponding control in [17. Security Strategy](../02-architecture/17-security-strategy.md).

---

## AUTH — Authentication & Identity

| ID | Requirement | Pri |
|---|---|---|
| FR-AUTH-1 | Users register with email + password; passwords hashed with Argon2id | P0 |
| FR-AUTH-2 | Users authenticate via GitHub and Google OAuth | P0 |
| FR-AUTH-3 | Sessions are httpOnly, Secure, SameSite=Lax cookies with server-side revocation **[SEC]** | P0 |
| FR-AUTH-4 | Email verification required before a user can trigger an agent run | P0 |
| FR-AUTH-5 | Password reset via single-use, time-limited, revocable token | P0 |
| FR-AUTH-6 | TOTP two-factor authentication, optional per user, enforceable per organization | P1 |
| FR-AUTH-7 | SAML 2.0 and OIDC SSO with domain-based auto-join | P3 |
| FR-AUTH-8 | SCIM 2.0 user provisioning and deprovisioning | P3 |
| FR-AUTH-9 | Users can list and revoke active sessions | P1 |

## ORG — Organizations

| ID | Requirement | Pri |
|---|---|---|
| FR-ORG-1 | Every user belongs to at least one organization; a personal org is created on signup | P0 |
| FR-ORG-2 | **All** domain data is scoped by `organization_id` and isolated by row-level security **[SEC]** | P0 |
| FR-ORG-3 | Organizations have a name, slug, and settings | P0 |
| FR-ORG-4 | Owners can invite users by email with an assigned role | P1 |
| FR-ORG-5 | Roles: Owner, Admin, Member, Viewer — enforced at API and data layer **[SEC]** | P1 |
| FR-ORG-6 | Organizations can define capability packs inherited by all their agents | P1 |
| FR-ORG-7 | Organization deletion permanently erases all data within 30 days, with audit record | P2 |
| FR-ORG-8 | Custom roles with granular permissions | P3 |

## TEAM — Teams

| ID | Requirement | Pri |
|---|---|---|
| FR-TEAM-1 | Organizations contain teams; users may belong to multiple | P1 |
| FR-TEAM-2 | Projects can be assigned to a team; team membership grants project access | P1 |
| FR-TEAM-3 | Per-team budget allocation and spend reporting | P2 |

## PROJ — Projects

| ID | Requirement | Pri |
|---|---|---|
| FR-PROJ-1 | Users create a project with a name, description, and goal statement | P0 |
| FR-PROJ-2 | A project connects to exactly one Git repository (MVP); multiple later | P0 |
| FR-PROJ-3 | Projects hold settings: tech stack, conventions, autonomy level, budget ceiling | P0 |
| FR-PROJ-4 | Projects can be archived (read-only) and unarchived | P0 |
| FR-PROJ-5 | The system analyzes an existing repository and produces a structure summary on connect | P1 |
| FR-PROJ-6 | Projects can be created from templates | P2 |
| FR-PROJ-7 | Full project export: repository, docs, memory, decisions, run history | P1 |

## AGENT — AI Agents

| ID | Requirement | Pri |
|---|---|---|
| FR-AGENT-1 | The system provides the 6 MVP agent roles with fixed, versioned definitions | P0 |
| FR-AGENT-2 | Each agent definition specifies: role prompt, capability packs, **tool allowlist**, model tier, effort level, budget ceiling, output contract **[SEC]** | P0 |
| FR-AGENT-3 | An agent may only invoke tools on its allowlist; violations are denied and logged **[SEC]** | P0 |
| FR-AGENT-4 | Agent definitions are versioned; a run pins the version it used, for reproducibility | P0 |
| FR-AGENT-5 | **The Code Reviewer cannot review a diff it authored.** Enforced by the orchestrator, not by prompt | P0 |
| FR-AGENT-6 | Agents run in isolated sandboxes with no host network access and an egress allowlist **[SEC]** | P0 |
| FR-AGENT-7 | Agent runs stream output (text, tool calls, results) to the client in real time | P0 |
| FR-AGENT-8 | A run can be interrupted by a user; the agent stops at a safe boundary | P0 |
| FR-AGENT-9 | Every run records: inputs, outputs, tool calls, model, tokens, cost, duration, outcome | P0 |
| FR-AGENT-10 | Remaining 13 agent roles are added per the phase roadmap | P1–P3 |
| FR-AGENT-11 | Organizations can author custom agents (role, prompt, tools, tier, budget) | P3 |
| FR-AGENT-12 | Delegation depth is limited to one level: Director → specialist. No specialist sub-delegation | P0 |

## PLAN — Tasks, Milestones & Orchestration

| ID | Requirement | Pri |
|---|---|---|
| FR-PLAN-1 | Given a goal, the Director produces an architecture note and a dependency-ordered milestone plan | P0 |
| FR-PLAN-2 | Each milestone carries: ID, title, objective, dependencies, complexity, deliverables, acceptance criteria, credit estimate | P0 |
| FR-PLAN-3 | Plans require explicit human approval before execution (at autonomy L0–L1) | P0 |
| FR-PLAN-4 | Users can edit a plan before approving | P0 |
| FR-PLAN-5 | Milestones decompose into tasks assigned to specific agent roles | P0 |
| FR-PLAN-6 | The orchestrator executes tasks respecting the dependency graph; independent tasks may run in parallel | P0 |
| FR-PLAN-7 | A task blocked by a failed dependency does not execute; the milestone reports blocked | P0 |
| FR-PLAN-8 | A milestone is complete only when: implementation done **AND** independent review passed **AND** tests pass | P0 |
| FR-PLAN-9 | Failed reviews or tests loop back to the implementer, bounded by a retry and budget ceiling | P0 |
| FR-PLAN-10 | Plans are re-plannable mid-project when the goal changes; prior decisions are preserved | P1 |
| FR-PLAN-11 | Users can reorder or skip milestones | P1 |

## REPO — Repositories

| ID | Requirement | Pri |
|---|---|---|
| FR-REPO-1 | GitHub App integration with per-repository scoped installation | P0 |
| FR-REPO-2 | Repository access tokens are never exposed to the sandbox; git traffic is proxied **[SEC]** | P0 |
| FR-REPO-3 | Each milestone works on its own branch, named deterministically | P0 |
| FR-REPO-4 | Completed milestones open a pull request with a structured completion report | P0 |
| FR-REPO-5 | Agents never push to the default branch directly **[SEC]** | P0 |
| FR-REPO-6 | GitLab and Bitbucket support | P2 |
| FR-REPO-7 | Monorepo and multi-repository projects | P3 |

## MEM — Memory & Knowledge

| ID | Requirement | Pri |
|---|---|---|
| FR-MEM-1 | Each project has a persistent memory store surviving across runs and sessions | P0 |
| FR-MEM-2 | Memory records: architecture decisions, conventions, completed milestones, known issues, rejected approaches, technical debt | P0 |
| FR-MEM-3 | Agents read relevant memory at run start and write learnings at run end | P0 |
| FR-MEM-4 | Every memory mutation is versioned with actor, timestamp, and prior content | P0 |
| FR-MEM-5 | Memory versions can be redacted (content cleared, audit trail preserved) **[SEC]** | P1 |
| FR-MEM-6 | Users can view, edit, and delete memory entries | P1 |
| FR-MEM-7 | Secrets are never written to memory; writes are scanned and blocked **[SEC]** | P0 |
| FR-MEM-8 | Document ingestion (PDF, Markdown, text) into a retrievable, cited knowledge base | P1 |
| FR-MEM-9 | Semantic search over project code, docs, and memory | P1 |
| FR-MEM-10 | Cross-project memory within an organization, opt-in | P3 |

## COST — Cost & Budget

| ID | Requirement | Pri |
|---|---|---|
| FR-COST-1 | Every model call records input tokens, cache-read tokens, output tokens, model, and computed cost | P0 |
| FR-COST-2 | Every run, task, milestone, and project has a rolled-up cost | P0 |
| FR-COST-3 | Every run has a token budget ceiling; exceeding it pauses the run and requests approval | P0 |
| FR-COST-4 | Plan approval displays a per-milestone credit estimate | P0 |
| FR-COST-5 | Projects and organizations have configurable budget ceilings with alert thresholds | P1 |
| FR-COST-6 | Cost dashboards break down by project, milestone, agent, and model tier | P2 |
| FR-COST-7 | A run that makes no measurable progress within a budget window is halted (circuit breaker) | P0 |

## AUDIT — Audit & Compliance

| ID | Requirement | Pri |
|---|---|---|
| FR-AUDIT-1 | Every state-changing action writes an append-only audit record: actor, action, resource, timestamp, request ID, IP | P0 |
| FR-AUDIT-2 | Every agent tool invocation is audited with arguments and outcome **[SEC]** | P0 |
| FR-AUDIT-3 | Every human approval and denial is audited | P0 |
| FR-AUDIT-4 | Audit records are immutable; there is no update or delete path **[SEC]** | P0 |
| FR-AUDIT-5 | Audit log is queryable and filterable by org admins | P1 |
| FR-AUDIT-6 | Audit export in SIEM-compatible format; configurable retention | P3 |

## Deferred module requirements (summary)

Full requirement sets are authored at phase entry, not now — writing them today would be
speculation. The modules and their phases: **Chat** (2), **Notifications** (2), **Settings** (2),
**Documents / Knowledge Base** (3), **Architecture** (4), **Code Generation** (5),
**Deployment** (5), **Monitoring** (5), **Billing** (6), **Analytics** (6),
**Administration** (6/7), **Marketplace** (8).

Each will be added here under its own `FR-<module>-n` block when its phase begins, per the rule in
[CLAUDE.md](../../CLAUDE.md) that documentation precedes implementation.

## Related

- [11. Non-Functional Requirements](11-non-functional-requirements.md)
- [8. MVP Definition](../00-foundation/08-mvp-definition.md)
- [17. Security Strategy](../02-architecture/17-security-strategy.md)
- [23. Testing Strategy](../04-engineering/23-testing-strategy.md)

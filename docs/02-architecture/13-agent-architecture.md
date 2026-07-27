# 13. AI Agent Architecture

This is the document that most defines the product. Everything else is scaffolding around it.

## Design principles

**1. An agent is a configuration, not code.**
Adding the 14th agent role must be authoring a document, not writing a subsystem. If it requires
code, the abstraction is wrong.

**2. Capability is granted, never assumed.**
Each agent gets the narrowest tool allowlist that lets it do its job. A Code Reviewer with write
access is a defect. The allowlist is enforced by the policy engine at the runtime boundary, not by
asking the model nicely in a prompt.

**3. Nothing self-approves.**
The single most important structural rule. Review and authorship are performed by different agent
instances in different sessions with different context. This is enforced by the orchestrator; no
prompt can override it.

**4. Coordination is explicit and shallow.**
The Director delegates to specialists. Specialists do not delegate further. Agents communicate
through **durable artifacts** — the task graph, the repository, project memory, review records — not
through free-form chatter. Peer-to-peer agent conversation is chaos that cannot be audited or
resumed.

`ASSUMPTION-007`: one-level delegation is also a constraint of the managed multi-agent runtime, so
this principle is enforced by the platform as well as by our design. Convenient alignment.

**5. Every run is bounded.**
Token budget, wall-clock timeout, retry ceiling, and a no-progress circuit breaker. An unbounded
agent loop is a financial incident.

**6. Every run is reproducible.**
The agent version, capability-pack versions, model ID, and effort level are pinned and recorded. A
run from six weeks ago can be explained.

---

## The agent specification

Every agent — built-in or customer-authored — is this object:

```yaml
id: backend-engineer
version: 4
role: Backend Engineer
model:
  tier: implementation          # → resolved by ADR-004, not hardcoded
  effort: high
system_prompt: |
  ...role definition, boundaries, output contract...
capability_packs:               # SKILL.md documents, progressively disclosed
  - platform/backend-engineering
  - platform/api-design
  - platform/code-review-standards
  - org/<customer-authored>      # inherited from the organization
tools:                          # ALLOWLIST — deny by default
  - read
  - write
  - edit
  - glob
  - grep
  - bash:                       # constrained, not raw shell
      allow: [npm, pnpm, node, tsc, vitest, git, python, pytest]
  - web_search
budget:
  max_tokens_per_run: 400000
  max_wall_clock: 45m
  max_retries: 3
permissions:
  can_write_code: true
  can_write_tests: false        # QA Engineer's remit
  can_review: false             # structural: never reviews
  can_deploy: false
  can_migrate_schema: false     # Database Engineer's remit, gated
  requires_approval_for: []
output_contract:
  type: task_result
  schema: TaskResultSchema      # structured output, validated
```

Two properties matter most: **`tools` is an allowlist** (absence means denied), and
**`permissions` is enforced by the orchestrator**, not by the model's cooperation.

---

## The 19 roles

### Tier 1 — Coordination

| Agent | Owns | Writes code | Notable boundary |
|---|---|---|---|
| **Director** | Goal → architecture note → milestone plan → assignment. Accountable for the plan. | No | The only agent that may delegate |

### Tier 2 — Design & architecture

| Agent | Owns | Writes code |
|---|---|---|
| **Software Architect** | Component design, boundaries, ADRs, tech evaluation | No |
| **Business Analyst** | Requirements elicitation, acceptance criteria, traceability | No |
| **Product Manager** | Prioritization, roadmap synthesis, changelog | No |
| **UI Designer** | Design tokens, component specs, visual language | Tokens/CSS only |
| **UX Designer** | Flows, information architecture, accessibility review | No |

### Tier 3 — Implementation

| Agent | Owns | Notable boundary |
|---|---|---|
| **Backend Engineer** | Services, APIs, business logic | No schema migrations |
| **Frontend Engineer** | UI implementation, state, client performance | No backend writes |
| **Database Engineer** | Schema design, migrations, indexing, query optimization | **Destructive migrations require human approval** |
| **Infrastructure Engineer** | IaC, networking, environments | **Apply requires human approval** |
| **DevOps Engineer** | CI/CD pipelines, build, release automation | **Production deploy requires human approval** |
| **Refactoring Agent** | Structural improvement with behavior preservation | Must not change public API without an ADR |

### Tier 4 — Verification *(the product's core value)*

| Agent | Owns | Structural rule |
|---|---|---|
| **Code Reviewer** | Independent review against standards | **Cannot review its own authored diff.** Read-only tools. |
| **QA Engineer** | Test authoring, execution, honest reporting | May write tests, never production code |
| **Security Engineer** | Vulnerability review; mandatory gate on auth/data/input changes | Read-only; can block a milestone |
| **Performance Engineer** | Profiling, query analysis, bundle budgets | Read-only until a fix is authorized |

### Tier 5 — Knowledge & support

| Agent | Owns |
|---|---|
| **Documentation Writer** | Docs, ADR prose, READMEs, changelogs |
| **Research Agent** | Technology evaluation, comparison matrices, sourced findings |
| **Support Agent** | In-product help grounded in our own docs; escalation to humans |

**Adding role #20** = one YAML file + capability packs + eval cases. No code.

---

## Capability packs — the extensibility mechanism

An agent's expertise is not baked into its prompt. It is a set of versioned `SKILL.md` documents,
progressively disclosed: the description sits in context; the full document is read when the task
calls for it.

```
capability packs
├── platform/          maintained by us; versioned with the product
│   ├── backend-engineering/SKILL.md
│   ├── api-design/SKILL.md
│   ├── code-review-standards/SKILL.md
│   ├── security/SKILL.md
│   └── … (the 34 packs already in skills/ are the seed corpus)
└── org/               authored by the customer
    ├── our-api-conventions/SKILL.md
    ├── our-migration-policy/SKILL.md
    └── our-design-system/SKILL.md
```

**Why this is the strategic core:** it converts a product into a platform. An agency encodes "how we
build things" once, and every agent on every project enforces it. That is a retention mechanism a
competitor cannot copy by adding a feature — they'd have to acquire the customer's accumulated
standards.

The 34 packs already in [`skills/`](../../skills/) are a real head start: `api-design`,
`backend-engineering`, `code-review-standards`, `security`, `scalability`, `observability`,
`docker`, `ci-cd-devops`, `frontend-engineering`, `software-architecture`, and more are directly
reusable as the platform's seed corpus. See
[ADR-005](../decisions/ADR-005-skills-as-capability-format.md).

**Untrusted-pack rule:** a customer-authored pack is untrusted input. It is scanned for prompt
injection before it is allowed into an agent context, and it can never grant a tool the agent's
allowlist doesn't already have. (The `skill-security-audit` pack in `skills/` is the seed of that
scanner.)

---

## Orchestration model

**Supervisor + blackboard hybrid.**

- **Supervisor:** the Director plans; the *orchestrator* (our code, not an agent) dispatches. This
  distinction matters — dispatch, retries, and gate enforcement are deterministic code, not model
  judgment. Models plan; code enforces.
- **Blackboard:** agents read and write shared durable state (repository, task graph, memory,
  review records) rather than messaging each other. State is inspectable, resumable, and auditable.

```
             Director (plans)
                   │
                   ▼
        ┌──────────────────────┐
        │  Task graph (Postgres)│ ◀── blackboard
        └──────────┬───────────┘
                   │ orchestrator dispatches ready tasks
     ┌─────────────┼─────────────┐
     ▼             ▼             ▼
 Backend       Frontend      Database        (parallel where independent)
     │             │             │
     └─────────────┴─────────────┘
                   ▼
        ┌──────────────────────┐
        │  Verification gates  │  Reviewer → QA → Security (if triggered)
        └──────────┬───────────┘
                   │ pass → complete   fail → bounded loop back
                   ▼
            Memory + PR + report
```

**Parallelism:** independent tasks run concurrently, with file-level advisory locks so two agents
never edit the same file. Concurrency is capped per project and per organization.

**Failure handling:** exponential backoff with jitter; a task failing repeatedly is quarantined and
escalated to the human rather than retried forever; each retry consumes budget, so failure is
naturally bounded.

---

## Context strategy

The hardest engineering problem in the product, and where cost and quality are both determined.

**What an agent gets, in priority order:**

1. **Stable prefix (cached):** role prompt + capability-pack descriptions + tool definitions. Never
   contains a timestamp, run ID, or any per-request value — see below.
2. **Project context:** architecture summary, conventions, tech stack, relevant memory entries.
3. **Task context:** the specific objective, acceptance criteria, dependency outputs.
4. **Working context:** files the agent reads during the run.

**Prompt-cache discipline is a hard rule, not an optimization.** At ~0.1× read cost, cache hit rate
is one of the largest cost levers we have. Therefore:

- Nothing volatile is ever interpolated into a system prompt. Dynamic context is appended as
  messages, never spliced into the cached prefix.
- Tool sets are serialized deterministically and don't change mid-session.
- Model tier is fixed for a session — caches are model-scoped.
- Mid-session instruction changes use system messages appended to the conversation, preserving the
  cached prefix rather than invalidating it.

**Long runs:** context editing (clearing stale tool results) and compaction (summarizing history)
rather than resending everything. Project memory is the durable layer beneath both.

---

## Memory architecture

Three tiers with different lifetimes:

| Tier | Lifetime | Contents | Store |
|---|---|---|---|
| **Working** | One run | Files read, tool results, reasoning | Session context |
| **Project** | Project lifetime | Architecture decisions, conventions, completed work, known issues, rejected approaches, technical debt | Versioned memory store, mounted into the sandbox |
| **Organization** | Org lifetime | Capability packs, standards, cross-project patterns | Capability pack registry |

**Project memory rules:**
- Read at run start (relevant entries only, not the whole store).
- Written at run end with what was learned.
- Every mutation versioned with actor and timestamp; redactable without losing the audit trail.
- **Never contains secrets.** Writes are scanned; a detected credential is blocked and alerted.
- One fact per entry with a one-line summary — retrievable, not a wall of prose.

This tier is why month six is faster than month one, and it is the single hardest thing for a
stateless competitor to replicate.

---

## Verification architecture

The product's actual value proposition, so it gets the most rigid design.

### Gate 1 — Independent code review
- Different agent instance, different session, no authorship context.
- Read-only tool allowlist.
- Reviews against: platform standards packs + organization packs + the milestone's acceptance criteria.
- Emits structured findings (severity, file, line, claim, failure scenario) — not prose.
- **Reports every finding with a confidence and severity rating; filtering happens in a separate
  step.** Asking a reviewer to self-filter for severity measurably suppresses real findings.

### Gate 2 — Test gate
- QA Engineer authors tests, runs them in the sandbox, reports actual output.
- A milestone with failing tests **cannot** be marked complete. There is no override flag.
- Honest reporting is a first-class instruction: report failures with output, never claim success
  without evidence.

### Gate 3 — Security review *(conditional)*
Triggered automatically when a diff touches authentication, authorization, data access, input
handling, file upload, cryptography, or dependency manifests. Can block the milestone outright.

### Gate 4 — Human approval *(configurable by autonomy level)*
Always required, at every level, for: production deploys, destructive migrations, force pushes,
data deletion, and budget-ceiling breaches. Never configurable away.

---

## Guardrails against known agent failure modes

Each row is a failure mode observed in agentic systems, with the specific control we apply:

| Failure mode | Control |
|---|---|
| Self-approval / blind spot confirmation | Structural separation of author and reviewer (FR-AGENT-5) |
| Runaway token spend | Per-run budget, task budget pacing, no-progress circuit breaker |
| Prompt injection via repo/web/issue content | All tool output treated as untrusted; no privileged action on tool-output instruction; human gate on irreversible actions |
| Secret exfiltration | Secrets never in context; egress-time injection; egress allowlist; memory write scanning |
| Scope creep / unrequested refactoring | Explicit scope-discipline instruction in every implementer prompt; review flags out-of-scope diffs |
| Fabricated progress claims | Progress claims must cite a tool result from the same session; test output is machine-verified, not self-reported |
| Over-verification loops | Verification is a structural gate, so implementer prompts explicitly *omit* self-check instructions — telling an already-verifying model to verify causes redundant work |
| Premature "done" | Completion requires acceptance criteria met **and** review passed **and** tests green — checked by code |
| Context anxiety on long runs | Never surface remaining-token countdowns to the agent; compaction handles length |
| Excessive narration | Explicit communication-style guidance in every agent prompt |
| Over-delegation | One-level delegation cap; explicit subagent-spawn ceiling |

---

## Model tiering

Summarized here; authoritative in [ADR-004](../decisions/ADR-004-model-tiering.md).

| Task class | Tier | Rationale |
|---|---|---|
| Planning, architecture, review, security | **Reasoning** (Opus-class, high/xhigh effort) | Quality here determines everything downstream; cheapest place to spend |
| Implementation, tests, refactoring | **Implementation** (Sonnet-class, high effort) | Largest token volume; ~45% cheaper at near-equivalent coding quality |
| Summarization, classification, doc formatting, indexing | **Utility** (Haiku-class) | Volume work where capability is not the constraint |
| Exceptionally hard reasoning (escalation only) | **Frontier** (top tier) | Explicit escalation, never default — priced well above Opus |

Tiers are **named abstractions resolved at runtime**, never hardcoded model IDs. When a new model
ships, we change one mapping table and re-run agent evals.

## Related

- [12. High-Level System Architecture](12-system-architecture.md)
- [17. Security Strategy](17-security-strategy.md)
- [ADR-002 — Managed Agents runtime](../decisions/ADR-002-managed-agents-runtime.md)
- [ADR-004 — Model tiering](../decisions/ADR-004-model-tiering.md)
- [ADR-005 — Skills as capability format](../decisions/ADR-005-skills-as-capability-format.md)
- [23. Testing Strategy](../04-engineering/23-testing-strategy.md) (agent evaluation)

# 5. Competitor Analysis

> `ASSUMPTION-003`: Competitor capabilities described here reflect my knowledge as of early-to-mid
> 2026 and will drift fast in this category. Treat specific feature claims as needing verification
> before they appear in sales material. The *structural* analysis — which axes matter and where we
> can defend — is more durable than the per-product detail.

## The competitive map

Four clusters, competing on different axes. Only one is a direct threat.

```
                        AUTONOMY (outer loop)
                                 ▲
                                 │
        App builders             │        Autonomous SWE agents
        (Lovable, Bolt,          │        (Devin, Factory, Jules)
         v0, Replit Agent)       │              ▲ DIRECT
                                 │              │ COMPETITION
                                 │        ┌─────┴─────┐
                                 │        │  ATELIER  │
        ─────────────────────────┼────────└───────────┘──────────▶
                                 │                    GOVERNANCE
        IDE copilots             │        Terminal agents         (audit, memory,
        (Copilot, Cursor,        │        (Claude Code,            review gates,
         Windsurf)               │         Codex CLI, Aider)       cost control)
                                 │
                          ASSISTANCE (inner loop)
```

---

## Cluster 1 — IDE copilots

**GitHub Copilot, Cursor, Windsurf, JetBrains AI**

| | |
|---|---|
| **Strengths** | Enormous distribution; excellent inner-loop UX; low price; already approved in most enterprises; increasingly capable agent modes |
| **Weaknesses vs us** | No project plan artifact; no independent review role; no cross-session project memory; no deployment or production monitoring; no cost ledger; no org-authored standards enforcement |
| **Threat level** | **Low-medium.** Different job. Becomes medium if they build a real outer-loop product on their distribution. |
| **Our posture** | Explicitly complementary. A customer can and should use Cursor *and* Atelier. Never position as a replacement — it invites an unwinnable distribution fight. |

---

## Cluster 2 — Terminal / harness coding agents

**Claude Code, OpenAI Codex CLI, Aider, Google Gemini CLI, Amp**

| | |
|---|---|
| **Strengths** | Genuinely strong engineering capability; developer-beloved; cheap; run locally on real repos; fast-improving |
| **Weaknesses vs us** | Single-agent and single-session by design; no team/org model; no shared project state across people; no billing/audit/permission layer; verification is whatever the user remembers to ask for |
| **Threat level** | **Medium.** They are the honest answer to "why not just use a coding agent?" and they are free or near-free for the individual. |
| **Our posture** | Compete on the *organizational* layer, not raw coding skill — we will lose that comparison and shouldn't fight it. Our answer: a team of people cannot share a terminal session, cannot audit it, cannot budget it, and cannot make it remember. Note we build **on** the same substrate ([ADR-002](../decisions/ADR-002-managed-agents-runtime.md)) — this is deliberate; we are an application layer, not a rival harness. |

---

## Cluster 3 — Autonomous SWE agents ⟵ **direct competition**

**Devin (Cognition), Factory, Google Jules, and the fast-follower cohort**

| | |
|---|---|
| **Strengths** | Same thesis as us; real funding and engineering depth; enterprise motion already underway; strong brand in the category; head start on distribution |
| **Weaknesses vs us** (to be verified per-competitor before use in sales) | Typically positioned as *one autonomous engineer*, not an organization — so the milestone plan, the multi-role review gate, and the org-authored standards layer are thinner. Cost transparency and per-task budget ceilings are commonly weak. Project memory is often session- or repo-scoped rather than a first-class, versioned, auditable store. |
| **Threat level** | **High.** This is the fight. |
| **Our posture** | Differentiate on the three things that are hard to retrofit: **(1)** the explicit, user-approved milestone plan as the central product object; **(2)** independent review + test gates as a structural guarantee rather than a prompt; **(3)** organization-authored capability packs so a customer's standards are enforced by construction. Plus radical cost transparency, which is a product decision competitors with opaque pricing cannot easily copy. |

**Honest assessment:** we are behind on distribution and funding. We are not behind on architecture,
and the governance layer is genuinely unglamorous work that well-funded competitors chasing
benchmark scores tend to defer. That is the opening — it is real, and it is not permanent.

---

## Cluster 4 — App builders

**Lovable, Bolt.new, v0, Replit Agent, Base44**

| | |
|---|---|
| **Strengths** | Best-in-class zero-to-demo; superb onboarding; viral growth; enormous top-of-funnel |
| **Weaknesses vs us** | Weak at maintenance, non-greenfield work, and testing; output frequently not a codebase a professional team wants to inherit; little governance |
| **Threat level** | **Low as competitors, high as a funnel.** Their churn is our pipeline: users graduate when the prototype needs to become a maintained product. |
| **Our posture** | Court the graduation moment. "Built it in Lovable, now need it maintainable" is a first-class onboarding path. **Note:** Base44 is our stated visual design reference only — we take design philosophy, never assets, copy, layouts, or code. See [18. Design System](../03-design/18-design-system.md). |

---

## Cluster 5 — DIY agent frameworks

**LangGraph, CrewAI, AutoGen, Claude Agent SDK, OpenAI Agents SDK, Mastra**

| | |
|---|---|
| **Strengths** | Free; maximally flexible; strong developer mindshare; no vendor risk |
| **Weaknesses vs us** | The customer must build sandboxing, memory, verification, cost control, RBAC, audit, and UI themselves — i.e. the entire hard part, then maintain it forever |
| **Threat level** | **Low-medium**, concentrated in "we'll build it in-house" objections from larger engineering orgs |
| **Our posture** | Standard build-vs-buy: quantify the 12–18 months of platform work they are signing up for, and note that it is not their product. Offer an API and SDK so "build in-house on top of Atelier" is available as a middle path. |

---

## Feature comparison

Legend: ● strong · ◐ partial · ○ absent/weak. Competitor cells are **assessed, not verified** —
re-check before external use.

| Capability | IDE copilots | Terminal agents | Autonomous SWE | App builders | **Atelier (target)** |
|---|---|---|---|---|---|
| Inner-loop code completion | ● | ◐ | ○ | ○ | ○ *(not our job)* |
| Multi-file autonomous implementation | ◐ | ● | ● | ● | ● |
| **Explicit approved milestone plan** | ○ | ○ | ◐ | ○ | **●** |
| **Independent review agent gate** | ○ | ○ | ◐ | ○ | **●** |
| Automated test generation + gate | ◐ | ◐ | ◐ | ○ | ● |
| **Persistent, versioned project memory** | ○ | ◐ | ◐ | ○ | **●** |
| **Org-authored standards enforced on agents** | ○ | ◐ | ○ | ○ | **●** |
| Sandboxed execution with egress control | ○ | ◐ | ● | ● | ● |
| Secrets never in agent context | ○ | ○ | ◐ | ◐ | ● |
| **Per-task budget ceiling + cost ledger** | ○ | ○ | ○ | ◐ | **●** |
| Immutable audit log | ○ | ○ | ◐ | ○ | ● |
| Team / org / RBAC model | ◐ | ○ | ● | ◐ | ● |
| Deployment + production monitoring | ○ | ○ | ◐ | ● | ● |
| Customer owns exportable repository | ● | ● | ● | ◐ | ● |

The bolded rows are the entire strategy. If we lose those, we have no reason to exist.

---

## Positioning statement

> For software teams that must **deliver and then maintain** real systems, Atelier is an AI
> engineering organization — not a single agent. Every project gets a plan you approve, work that
> an independent reviewer signed off, tests that actually ran, decisions written down, a cost you
> saw before you spent it, and an audit trail your security team accepts.

## Competitive review cadence

Reassess quarterly, and immediately on any of these triggers:
- A model provider ships a governed multi-agent delivery product.
- A direct competitor ships org-authored standards or per-task budget ceilings.
- Our win rate against a named competitor moves more than 15 points in a quarter.

## Related

- [4. Market Analysis](04-market-analysis.md)
- [7. Revenue Model](07-revenue-model.md)
- [27. Risk Analysis](../05-delivery/27-risk-analysis.md)

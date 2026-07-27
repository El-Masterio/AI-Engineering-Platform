# 27. Risk Analysis

Scoring: **Likelihood** (1 rare – 5 near-certain) × **Impact** (1 minor – 5 existential) = **Score**.
Anything ≥ 12 needs an owned, funded mitigation with a trigger — not an intention.

## Register, ordered by score

| ID | Risk | L | I | Score | Category |
|---|---|---:|---:|---:|---|
| R-01 | Model provider moves up the stack and bundles a competing product | 4 | 5 | **20** | Strategic |
| R-02 | Prompt injection causes a customer-visible security incident | 4 | 5 | **20** | Security |
| R-03 | Gross margin compression from inference cost | 4 | 4 | **16** | Financial |
| R-04 | Agent output quality insufficient for trust → adoption stalls | 3 | 5 | **15** | Product |
| R-05 | Vendor concentration on the managed agent runtime | 3 | 5 | **15** | Technical |
| R-06 | Scope overrun — 23 modules, 19 agents, small team | 4 | 4 | **16** | Execution |
| R-07 | Cross-tenant data leak | 2 | 5 | **10** | Security |
| R-08 | Better-funded competitor out-executes on distribution | 4 | 3 | **12** | Competitive |
| R-09 | Enterprise procurement blocks on compliance gaps | 3 | 4 | **12** | Commercial |
| R-10 | Agent causes a destructive action in a customer's production | 2 | 5 | **10** | Operational |
| R-11 | Key-person dependency on architectural knowledge | 3 | 3 | 9 | Organizational |
| R-12 | Model behavior regression on a provider upgrade | 4 | 2 | 8 | Technical |
| R-13 | Beta runtime API breaking changes | 4 | 2 | 8 | Technical |
| R-14 | Category trust collapse after a competitor's public incident | 2 | 4 | 8 | Market |
| R-15 | Cost of agent evaluations becomes prohibitive | 3 | 2 | 6 | Operational |
| R-16 | GDPR / regulatory change invalidates the data model | 2 | 3 | 6 | Compliance |
| R-17 | Redis licensing change forces migration | 2 | 2 | 4 | Legal |

---

## R-01 — Model provider moves up the stack (20)

**The existential risk.** The provider whose models we resell capability from ships a governed,
multi-agent software-delivery product, bundled, at a price we cannot match. They have the models, the
sandbox infrastructure, the distribution, and a structural cost advantage.

| | |
|---|---|
| **Early warning** | Provider ships org-level governance, audit, or team features on their agent platform; enterprise-oriented pricing tiers; acquisition of a delivery-agent company |
| **Mitigation** | Compete where a model provider structurally won't: **(1)** organization-authored standards and accumulated customer memory — a switching cost we build *for* the customer, not against them; **(2)** multi-provider readiness behind the tier abstraction; **(3)** private/regulated deployment (self-hosted execution, residency) which a hyperscaler serves poorly; **(4)** deep Git-host and toolchain integration |
| **Contingency** | Pivot to the regulated/private-deployment niche, or to delivery-as-a-service on top of whatever platform wins |
| **Honest assessment** | Unmitigable in full. The realistic goal is to build enough accumulated customer-specific value that switching is unattractive even when a cheaper generic option exists. |

## R-02 — Prompt injection incident (20)

An agent reads attacker-controlled content — a README, a dependency, an issue, a web page — and takes a
harmful action or leaks data.

| | |
|---|---|
| **Why likely** | We *cannot* prevent injection. The attack surface is every piece of text an agent reads, and agents must read untrusted text to be useful. |
| **Mitigation** | Assume it succeeds; constrain the blast radius. Capability confinement is the real control — no secret in context, egress allowlist, no default-branch write, human gate on irreversible actions, capability-pack scanning, nightly adversarial suite (§17, §23). |
| **Trigger** | Any successful injection in the adversarial suite, or any real-world attempt detected |
| **Response** | Treat as P0. Halt affected runs, notify, postmortem with a regression test. |
| **Residual risk** | Accepted and disclosed. The claim we make is "a subverted agent cannot do serious harm," not "agents cannot be subverted." Overclaiming here would be worse than the risk itself. |

## R-03 — Margin compression (16)

Inference is COGS. Runaway loops, verbose output, poor cache hit rates, or a provider price change take
gross margin negative.

| | |
|---|---|
| **Early warning** | COGS per accepted milestone trending up; cache hit rate below 70%; blended margin below 55% |
| **Mitigation** | Model tiering (ADR-004); prompt-cache-stable prompt assembly; per-run budget ceilings; no-progress circuit breakers; verbosity governance; Batch API for non-interactive work; context editing over history resends. All are Phase 1 requirements, not optimizations. |
| **Trigger** | Margin < 55% for two consecutive months |
| **Response** | Re-tier task classes; raise prices; introduce bring-your-own-key for heavy accounts |
| **Owner** | Whoever owns pricing — must be a named person, because unowned margin erodes silently |

## R-06 — Scope overrun (16)

The specification names 23 modules and 19 agents at production quality. A small team attempting that as
one effort ships nothing.

| | |
|---|---|
| **Mitigation** | Already applied structurally: MVP narrowed to 7 modules and 6 agents (§8), 9 phases with hard exit gates (§9), XL milestones prohibited (§26), phase gates require measured criteria not opinions |
| **Trigger** | Phase 1 exceeding 6 months, or any stage gate missed twice |
| **Response** | Cut scope, not quality. The MVP journey is the floor; features above it are negotiable. |
| **Note** | This risk was raised explicitly to the project owner rather than managed silently — see §8. |

## R-04 — Insufficient output quality (15)

Agents produce plausible-but-wrong code often enough that users stop trusting it, and the review burden
lands back on the human — inverting the value proposition.

| | |
|---|---|
| **Early warning** | Milestone completion rate < 60%; PR merge-without-rework < 50%; review findings per milestone near zero (suggests the reviewer isn't working) |
| **Mitigation** | Independent review gate; test gate; seeded-defect eval suite as the direct measurement; narrow the supported project surface rather than accepting a lower bar |
| **Trigger** | Completion rate < 50% at the MVP gate |
| **Response** | Narrow supported languages/frameworks/project types until quality clears the bar. **Do not add features to compensate.** |

## R-05 — Vendor concentration on the runtime (15)

We depend on one provider for the agent loop, sandbox, credential vault, and memory store. A price
change, deprecation, capacity limit, or terms change hits the critical path.

| | |
|---|---|
| **Mitigation** | `AgentRuntime` port with a 5-method surface; a shared conformance suite every adapter must pass; **M127 self-hosted adapter is funded and scheduled in Phase 7 specifically to prove the abstraction holds** |
| **Trigger** | Breaking change we can't absorb in a sprint; pricing change > 30%; a hard capacity limit we hit |
| **Response** | Accelerate M127; fall back to sandbox-only providers (E2B/Daytona/Modal) plus our own loop |
| **Note** | The mitigation is only real because we *test* it. An abstraction never exercised against a second implementation is decoration. |

## R-08 — Out-executed on distribution (12)

Competitors with more capital reach the market faster regardless of product quality.

**Mitigation:** beachhead focus (agencies) rather than broad competition; differentiate on things a
demo can't show; content and community from the artifacts the product naturally produces (plans, ADRs,
reviews are inherently shareable). **Accepted:** we will not win a spending contest.

## R-09 — Enterprise compliance gaps (12)

SOC 2, SSO/SCIM, residency, DPA, and ZDR are checklist items — one missing entry blocks the deal.

**Mitigation:** the checklist drives §11 and §17 from M001, so nothing needs retrofitting; Phase 7
builds the gated items. **Disclosed, not hidden:** no ZDR in Phase 1. **Trigger:** two enterprise deals
lost on the same gap → pull that item forward.

## R-07 — Cross-tenant leak (10)

Low likelihood, existential impact. Three independent controls (RLS with `FORCE`, application guard,
generated cross-tenant test suite on every commit), 95% coverage floor, penetration test before GA.
**Response is unconditional:** P0, full stop until resolved, customer notification within 72 hours.

## R-10 — Destructive action in customer production (10)

**Mitigation:** production deploys, destructive migrations, force pushes, and data deletion require
human approval at *every* autonomy level, non-configurable (§17). Rollback always available. Agents
never write to a default branch. Phase 5 is gated on Phase 3's security agent.

## R-11 — Key-person dependency (9)

**Mitigation:** this blueprint. ADRs with reasoning, not just decisions. Runbooks for every alert.
Documentation-precedes-implementation as a standing rule. The test suite as executable specification.

## R-12, R-13 — Model and API churn (8 each)

**Mitigation:** model IDs behind tier abstraction; the `claude-api` skill loaded before writing any
model-calling code (recalled API patterns are frequently stale); eval suite with baseline comparison
catches behavioral regression; adapter isolates the beta surface; pinned versions with deliberate
upgrade milestones.

## R-14 — Category trust collapse (8)

A competitor's public incident poisons the category. **Mitigation:** be the vendor whose security
posture is documented and defensible; publish our threat model and controls; never overclaim autonomy.
**Opportunity:** a category trust event advantages whoever can *prove* their controls.

## R-15, R-16, R-17 — Lower-order risks

| Risk | Mitigation |
|---|---|
| Eval cost prohibitive | Replay mode in CI (free); live evals nightly not per-PR; Batch API for grading |
| Regulatory change | Data inventory from M001 makes impact assessment tractable; residency architecture in P7 |
| Redis licensing | Valkey is a drop-in BSD-licensed fork; migration is measured in days |

---

## Risk management process

| Practice | Cadence |
|---|---|
| Register review | Monthly, and at every phase gate |
| Score reassessment | Quarterly |
| New risk entry | Any time — anyone can add one; scoring is reviewed |
| Trigger monitoring | Automated where possible (margin, completion rate, cache hit rate on dashboards) |
| Postmortem → register update | Every P0/P1 incident |

## Risks we accept without mitigation

Stated plainly, because an unstated accepted risk is an unexamined one:

1. **Prompt injection cannot be eliminated.** We limit blast radius and disclose the residual risk.
2. **We cannot outspend better-funded competitors.** We compete on product, not reach.
3. **Agent output will sometimes be wrong.** We verify rather than promise perfection, and we never
   claim more certainty than the evidence supports.
4. **Single model provider in Phase 1.** Multi-provider is an abstraction we've prepared for, not a
   thing we've built. Revisit when there's a reason.

## Related

- [17. Security Strategy](../02-architecture/17-security-strategy.md)
- [7. Revenue Model](../00-foundation/07-revenue-model.md)
- [ADR-002 — Managed Agents runtime](../decisions/ADR-002-managed-agents-runtime.md)
- [28. Technical Debt Prevention](28-technical-debt-strategy.md)

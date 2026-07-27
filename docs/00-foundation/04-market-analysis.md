# 4. Market Analysis

> **Epistemic warning.** `ASSUMPTION-002`: This section contains no live market research. Figures
> are order-of-magnitude reasoning from structural facts, not sourced data, and my knowledge has a
> cutoff. **Before any fundraise, pricing commitment, or board deck, replace this section with
> primary research.** It is written to support internal prioritization decisions, and it is
> adequate for that and nothing more.

## Market definition

Atelier sits in **AI-assisted software delivery**, which is splitting into three distinct markets
that are often conflated:

| Market | Unit of value | Buyer | Where we are |
|---|---|---|---|
| **A. Developer assistance** (inner loop) | Keystrokes saved | Individual dev / eng manager | Not competing |
| **B. Autonomous software delivery** (outer loop) | Delivered increments | Eng leader / founder / agency owner | **Our market** |
| **C. App generation** (zero-to-demo) | Working prototypes | Non-engineers, PMs, founders | Adjacent; a feeder |

Market A is large, mature, and won by incumbents bundling into IDEs. Market C is loud, fast-growing,
and structurally low-margin with high churn. **Market B is the smallest today, the least settled,
and the only one where "trustworthy" is a defensible differentiator.**

## Why market B exists now and not two years ago

Four preconditions arrived roughly together:

1. **Long-horizon agentic capability.** Frontier models sustain multi-hour, multi-file tasks with
   coherent planning. Two years ago, autonomous delivery failed on task length alone.
2. **Large context windows.** 1M-token context makes whole-repository reasoning practical without
   heroic retrieval engineering.
3. **Managed sandboxes and agent infrastructure.** Hosted per-session containers, credential vaults,
   and durable agent loops are now purchasable primitives rather than 18-month platform projects.
4. **Cost curves crossed a threshold.** Prompt caching at ~0.1× read cost plus tiered model pricing
   make a full delivery loop economically viable per milestone.

Any competitor starting today gets the same four preconditions, so **timing advantage is small and
the differentiator must be product, not infrastructure access.**

## Sizing (reasoned, not sourced)

Rather than a top-down TAM number I cannot defend, here is the bottom-up logic that actually drives
our decisions:

**Serviceable segments, roughly ordered by ease of reach:**

| Segment | Rough population (global, order of magnitude) | Willingness to pay / mo | Notes |
|---|---|---|---|
| Freelancers & solo devs shipping client work | Millions | $20–200 | High volume, high churn, low ACV, self-serve |
| Small agencies (2–20 people) | Hundreds of thousands | $200–2,000 | **Best initial beachhead** — feels the pain acutely, buys fast, low procurement friction |
| Startups (seed–Series B) | ~10⁵ | $500–5,000 | Buys on speed; churns on failure |
| Mid-market internal software teams | ~10⁴–10⁵ | $2,000–20,000 | Needs SSO, audit, residency; long cycle |
| Enterprise engineering orgs | ~10³–10⁴ | $50,000+ | 6–18 month cycles; requires the whole governance layer |

The revenue math that matters: **a few thousand agency and startup accounts at $500–2,000/mo is a
viable standalone business.** Enterprise is the expansion story, not the entry story, because the
entry cost (SOC 2, SSO/SCIM, DPAs, residency, procurement) is 12+ months of work that must be
funded by earlier revenue.

**Conclusion for prioritization:** build for agencies and startups first; architect so enterprise
requirements are additive, not a rewrite. Section 11's non-functional requirements and Section 17's
security strategy are written to make that true.

## Market dynamics

**Tailwinds**
- Model capability improves without our investment; our product gets better on someone else's R&D.
- Persistent engineering-cost pressure makes "capability without headcount" an easy budget line.
- Growing volume of AI-generated code creates a *maintenance* market that favors memory-based tools.
- Enterprise AI governance requirements are hardening — which advantages whoever built audit,
  permissioning, and cost controls early. This is a tailwind for us specifically.

**Headwinds**
- **Model providers moving up the stack** is the single largest structural risk. See
  [27. Risk Analysis](../05-delivery/27-risk-analysis.md), R-01.
- Trust deficit: one high-profile agent-caused production incident chills the whole category.
- Buyer fatigue and skepticism from over-promised autonomous-agent demos.
- Inference cost volatility hits gross margin directly.
- Commoditization pressure: the *demo* is easy to replicate, so we must sell on things a demo
  cannot show (verification, memory, governance) — a harder sale.

## Beachhead strategy

**Enter through small software agencies.** They are the segment where our differentiators are
immediately legible:

- They deliver multiple similar projects → **memory and reusable capability packs compound visibly.**
- They must defend quality to a client → **independent review and a test gate are the sales pitch.**
- They bill fixed-price → **cost transparency is a margin tool, not a nice-to-have.**
- They have no procurement department → **weeks to close, not quarters.**
- They are loud in public → cheap distribution.

Expand outward: agencies → startups (same product, different framing) → mid-market (add SSO, audit,
analytics) → enterprise (add residency, DPAs, SOC 2, on-prem execution).

## What would invalidate this analysis

Stated up front so we notice if it happens:

1. A model provider ships an org-shaped, governed, multi-agent delivery product bundled at a price
   we cannot match. → Pivot to the private/regulated-deployment niche they will not serve.
2. Agency buyers turn out to prefer per-project outsourcing over tooling. → Move to a
   delivery-as-a-service model on top of the same platform.
3. Verification proves not to be a purchase driver — buyers pick on raw speed. → Re-weight toward
   throughput and de-emphasize the review gate in positioning (but not in the product).

## Related

- [5. Competitor Analysis](05-competitor-analysis.md)
- [6. Target Audience](06-target-audience.md)
- [7. Revenue Model](07-revenue-model.md)
- [27. Risk Analysis](../05-delivery/27-risk-analysis.md)

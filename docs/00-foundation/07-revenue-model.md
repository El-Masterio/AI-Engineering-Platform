# 7. Revenue Model

> `ASSUMPTION-004`: Every number in this section is a **model**, not a measurement. The token
> estimates come from reasoning about workload shape, not from instrumented runs. The first thing
> M050 (cost metering) must do is replace these with real numbers. Until then, treat the *structure*
> as decided and the *values* as provisional.

## The central constraint

**Inference is our cost of goods sold.** This is not a SaaS business with ~90% gross margin and
near-zero marginal cost. Every unit of value we deliver has a real, variable, and potentially
unbounded cost attached. Every pricing decision follows from that.

Two failure modes to design against:
- **Flat-rate pricing with unbounded usage** → a handful of heavy users produce negative margin.
- **Pure pass-through metering** → the customer bears all volatility, cannot forecast, and churns.

The answer is a hybrid: a **subscription for access and seats**, plus **metered credits for work
performed**, with hard ceilings so neither side gets surprised.

---

## Unit economics (modeled)

### Cost of one "medium" milestone

A medium milestone ≈ one meaningful feature: 6–15 files touched, tests, docs, one review cycle.

| Phase | Model tier | Input tokens | Cache-read share | Output tokens | Modeled cost |
|---|---|---|---:|---:|---:|
| Director planning + decomposition | Opus 5 | 250K | 70% | 30K | $1.30 |
| Implementation (multi-turn, 1–3 specialists) | Sonnet 5 | 3.0M | 85% | 200K | $5.20 |
| Independent code review | Opus 5 | 400K | 80% | 20K | $0.90 |
| Test authoring + fix loop | Sonnet 5 | 1.0M | 85% | 60K | $1.35 |
| Documentation + summarization | Haiku 4.5 | 300K | 60% | 25K | $0.25 |
| **Inference subtotal** | | | | | **≈ $9.00** |
| Sandbox compute, storage, egress, observability | | | | | ≈ $1.50 |
| **Total COGS per medium milestone** | | | | | **≈ $10.50** |

Cost drivers, in order of impact:
1. **Output tokens** — 3–5× the price of input. Verbosity control is a margin lever, not a style preference.
2. **Cache hit rate** — at 0.1× read cost, the difference between 60% and 90% cache hits is roughly
   2× on input spend. This is why [15. Database Strategy](../02-architecture/15-database-strategy.md)
   and the agent prompt assembly treat prefix stability as an invariant.
3. **Model tier mix** — routing implementation bulk to Sonnet instead of Opus is ~45% cheaper for
   the largest token bucket. See [ADR-004](../decisions/ADR-004-model-tiering.md).
4. **Retry and dead-end loops** — the reason per-task budget ceilings are a Phase 2 requirement, not
   a Phase 6 nicety.

**Target: ≥ 65% blended gross margin at scale.** Below 50% we have a product problem, not a pricing
problem.

---

## Pricing structure

### Subscription tiers

| Tier | Price (modeled) | Seats | Included credits | Key gates |
|---|---|---|---|---|
| **Free** | $0 | 1 | ~$5 equiv. / mo | 1 project, community models tier, no private repos, Atelier-branded artifacts |
| **Solo** | $39 / mo | 1 | ~$40 equiv. | 3 projects, all agents, private repos |
| **Team** | $99 / seat / mo | 2–20 | ~$100 equiv. / seat | Unlimited projects, org capability packs, RBAC, shared memory, cost dashboards |
| **Business** | $249 / seat / mo | 10+ | ~$250 equiv. / seat | SSO, audit log export, per-team budgets, priority support, SLA |
| **Enterprise** | Custom (annual) | Custom | Committed volume | SCIM, data residency, on-prem execution, DPA, custom retention, dedicated support |

**Why seat-based *and* metered:** seats capture the collaboration value (shared projects, memory,
standards) which is where retention lives. Credits capture the variable cost. Charging only for
seats invites abuse; charging only for usage makes revenue unforecastable and punishes the
collaboration behavior we want.

### Credits

- **One unit of account.** Credits are denominated so that 1 credit ≈ $0.01 of *list* value.
  A medium milestone lists at ~2,500–3,500 credits (~$25–35), against ~$10.50 COGS.
- **Shown before spend.** The Director's plan includes a credit estimate per milestone, and the user
  approves the estimate. This is the single most important trust feature in the pricing model.
- **Hard ceilings.** Per-run, per-project, and per-org caps. Exceeding a cap pauses the run and asks;
  it never silently overspends.
- **Rollover:** included credits roll over one month, then expire. Purchased credit top-ups never
  expire.
- **Transparency:** every run shows actual credits consumed, broken down by agent and model tier.

### Why not per-seat only, per-project, or outcome-based

| Alternative | Why rejected |
|---|---|
| Pure per-seat, unlimited usage | Negative margin on power users; no lever against runaway loops |
| Pure usage-based, no subscription | Unforecastable revenue; no floor; punishes collaboration; hostile to agency fixed-price bids |
| Per-project flat fee | We cannot estimate project scope reliably enough to price it without losing money |
| Outcome-based ("pay when it works") | Attractive story, undefinable in practice. Who adjudicates "works"? Revisit only with strong verification data. |
| Bring-your-own-API-key | **Keep as an Enterprise option.** It moves COGS to the customer and defuses margin risk, but it strips our cost-optimization advantage and complicates support. Good for large accounts, bad as the default. |

---

## Secondary revenue

| Stream | Phase | Notes |
|---|---|---|
| **Marketplace** — paid third-party capability packs and agent templates | 8 | 70/30 split favoring the author. Strategic more than financial: it deepens the platform moat. |
| **Professional services** — onboarding, standards authoring, migration | 3+ | Cap at ~15% of revenue. Useful for enterprise landing; a trap if it becomes the business. |
| **Delivery-as-a-service** — we run the platform on the client's behalf | Contingency | The pivot if tooling adoption stalls (see Market Analysis, invalidation #2). |
| **Education / non-profit tier** | 6 | Deeply discounted. Pipeline, not revenue. |

---

## Metrics we manage to

| Metric | Target | Why |
|---|---|---|
| Blended gross margin | ≥ 65% | Survival |
| COGS per accepted milestone | Declining quarter over quarter | Proves the cost architecture works |
| Credit utilization rate | 60–85% | Below 60% we're overselling; above 85% users are throttled and will churn |
| Net revenue retention (Team+) | ≥ 115% | Seat and usage expansion is the growth engine |
| Free → paid conversion | ≥ 4% | Validates that free tier delivers real value |
| CAC payback | < 12 months (self-serve < 6) | Capital efficiency |
| % revenue from T1 (agency/founder) | > 60% through Phase 6 | Guards against premature enterprise drift |

## Margin defense mechanisms (build these, don't hope)

1. **Model tiering by task class** — ADR-004.
2. **Prompt-cache-stable prompt assembly** — never interpolate volatile values into a system prompt.
3. **Per-task token budgets** — the agent paces itself and finishes gracefully.
4. **Verbosity governance** — explicit conciseness instructions in agent system prompts.
5. **Batch API for non-interactive work** — 50% discount on documentation, summarization, indexing.
6. **Context editing / compaction** on long-running sessions instead of resending history.
7. **Circuit breakers** — a run that exceeds its budget or loops without progress is halted.

## Related

- [4. Market Analysis](04-market-analysis.md)
- [6. Target Audience](06-target-audience.md)
- [ADR-004 — Model Tiering](../decisions/ADR-004-model-tiering.md)
- [27. Risk Analysis](../05-delivery/27-risk-analysis.md) (R-03: margin compression)

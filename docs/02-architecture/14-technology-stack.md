# 14. Recommended Technology Stack

Per the governing specification, **no technology is locked without evaluation**. Each decision below
covers advantages, disadvantages, alternatives, scalability, community, maintenance, licensing, cost,
and future-proofing, then makes one recommendation.

`ASSUMPTION-008`: version numbers reflect what was current at authoring and should be re-checked at
M001. The *choices* are decided; the *pins* are not.

## Summary

| Layer | Recommendation | Confidence |
|---|---|---|
| Language | TypeScript (strict), Node 22 LTS | High |
| Monorepo | pnpm workspaces + Turborepo | High |
| Frontend | Next.js (App Router) + React + Tailwind + Radix primitives | High |
| Backend | Fastify | Medium-high |
| Database | PostgreSQL 17 + pgvector | High |
| ORM | Drizzle | Medium-high |
| Cache / queue | Redis + BullMQ | High |
| Agent runtime | Claude Managed Agents behind an `AgentRuntime` port | Medium *(deliberately reversible)* |
| Models | Claude, tiered (ADR-004) | High |
| Auth | Better Auth | Medium |
| Billing | Stripe | High |
| Object storage | S3-compatible (Cloudflare R2) | High |
| Observability | OpenTelemetry → Grafana stack; Langfuse for LLM traces | Medium-high |
| IaC | OpenTofu | High |
| Hosting | Managed containers (Fly.io/Railway) → managed K8s at Phase 6 | Medium |
| Testing | Vitest + Playwright + custom agent eval harness | High |

---

## 1. Primary language

**Recommendation: TypeScript (strict mode), Node 22 LTS.**

| | |
|---|---|
| **Advantages** | One language across web, API, orchestrator, and SDK — critical for a small team. Best-in-class agent/LLM tooling. Structural typing suits the agent-specification-as-data model. Enormous hiring pool. Fast iteration. |
| **Disadvantages** | Weaker than Python for data/ML work. Single-threaded per process (mitigated: our workload is I/O-bound). No true parallelism for CPU-bound tasks. |
| **Alternatives** | **Python** — better ML ecosystem, but a second language for the frontend means context-switching and duplicated types for a team this size. **Go** — excellent concurrency and deploy story, but slower iteration and a weaker web story. **Rust** — wrong tool; we are not latency-bound. |
| **Scalability** | Proven at very large scale for I/O-bound services. Our CPU-bound work (indexing, embedding) can go to a Python worker behind a queue if ever needed. |
| **Community** | Largest of any option. |
| **Maintenance** | Active; TS releases quarterly, Node LTS predictable. |
| **Licensing** | Apache-2.0 (TS), MIT (Node). Clean. |
| **Cost** | Free. Hiring cost lowest of the alternatives. |
| **Future-proofing** | Very strong. The primary risk is Python pulling further ahead on AI tooling; mitigated by keeping a queue-based escape hatch for Python workers. |

**Escape hatch:** if we need Python (embeddings, static analysis, ML), it runs as an isolated worker
consuming a queue — never in the request path, never a second primary language.

---

## 2. Monorepo tooling

**Recommendation: pnpm workspaces + Turborepo.**

| | |
|---|---|
| **Advantages** | pnpm's content-addressed store is fast and disk-efficient with strict dependency isolation (catches phantom dependencies). Turborepo gives content-hashed task caching and correct task graphs with minimal config. |
| **Disadvantages** | Turborepo is vendor-backed (Vercel) — a soft lock-in risk. pnpm's strictness occasionally breaks packages with sloppy peer deps. |
| **Alternatives** | **Nx** — more powerful, notably more complex and opinionated; better suited to larger orgs. **Bazel** — correct at massive scale, wildly over-engineered here. **npm/yarn workspaces alone** — no task caching; CI gets slow fast. **Moon** — promising, smaller community. |
| **Scalability** | Adequate well past our expected repo size. |
| **Community** | Both very active. |
| **Maintenance** | Low. Config is small. |
| **Licensing** | MIT (pnpm), MPL-2.0 (Turborepo). Both fine. |
| **Cost** | Free locally. Remote caching is optional and cheap; self-hostable if we want to avoid the vendor. |
| **Future-proofing** | Good. Turborepo is replaceable in about a day — it caches tasks, it doesn't shape our code. |

---

## 3. Frontend framework

**Recommendation: Next.js (App Router) + React + TypeScript.**

| | |
|---|---|
| **Advantages** | Server Components suit our data-dense, read-heavy dashboards — less client JS, less client state. Streaming SSR pairs naturally with streaming agent output. Excellent DX. Largest React ecosystem. Straightforward SSE support. |
| **Disadvantages** | Genuinely complex mental model (server vs client boundaries are a common source of bugs). Vercel-oriented defaults. Frequent breaking-ish changes. Self-hosting is fine but less polished than Vercel. |
| **Alternatives** | **Remix/React Router** — simpler model, smaller ecosystem. **SvelteKit** — leaner and faster, much smaller hiring pool. **Vite + SPA** — simplest, but we lose SSR/streaming and the initial load suffers on data-dense pages. **Astro** — content-oriented; wrong shape for an app. |
| **Scalability** | Scales via CDN + horizontal instances; our heavy work is server-side anyway. |
| **Community** | Largest. |
| **Maintenance** | Moderate — expect real upgrade work each major. Budget for it. |
| **Licensing** | MIT. |
| **Cost** | Free; hostable anywhere Node runs. We will not build a Vercel-only dependency. |
| **Future-proofing** | Strong, with the caveat that React Server Components are still maturing. |

**Styling: Tailwind CSS + CSS custom properties for design tokens.** Tokens live in CSS variables so
theming (dark/light) is runtime-switchable and not compiled into class names — that decision is what
makes Phase 4's light mode a config change rather than a re-skin.

**Components: Radix UI primitives, styled by us.** We need accessible behavior (focus management,
ARIA, keyboard) without inheriting someone else's visual language — the design system must be
original per the design direction. Rejected: MUI/Chakra (too opinionated visually), shadcn/ui
(excellent, but its aesthetic is now the default "AI app" look we are explicitly avoiding — we may
borrow patterns, not the visual identity).

---

## 4. Backend framework

**Recommendation: Fastify.**

| | |
|---|---|
| **Advantages** | Fastest mature Node HTTP framework. First-class JSON Schema validation and serialization — which we want anyway for OpenAPI generation. Clean plugin/encapsulation model that maps well onto module boundaries. Small and comprehensible. |
| **Disadvantages** | Less structure than NestJS — we must impose our own architecture (acceptable; documented in §21). Smaller ecosystem than Express. |
| **Alternatives** | **NestJS** — strong structure and DI out of the box, but heavy decorator-based magic, slower, and it imposes an Angular-flavored architecture we'd fight. **Express** — ubiquitous but slow, unmaintained-feeling, weak typing. **Hono** — excellent and edge-portable; smaller ecosystem, and our workload isn't edge-suited (long-lived connections, DB-heavy). **Encore/tRPC** — tRPC is great for internal type safety but a poor fit for the public REST API we owe customers in Phase 8. |
| **Scalability** | Stateless; scales horizontally. Throughput far exceeds our needs. |
| **Community** | Large and healthy. |
| **Maintenance** | Low; stable API across majors. |
| **Licensing** | MIT. |
| **Cost** | Free. |
| **Future-proofing** | Good. If we ever need Nest's structure, the migration is per-route and incremental. |

**Confidence note:** this is the choice I'd most expect a reasonable architect to disagree with.
NestJS's built-in structure has real value for a team that grows fast. I chose Fastify because
imposing our own thin architecture is cheaper than fighting a framework's, and because JSON Schema
→ OpenAPI is a direct win for the Phase 8 public API.

---

## 5. Database

**Recommendation: PostgreSQL 17 + pgvector.**

| | |
|---|---|
| **Advantages** | Transactional consistency across domain state, audit log, and cost ledger — the single most valuable property for this product. Row-level security gives us defence-in-depth tenant isolation at the data layer. JSONB for flexible agent/run payloads. pgvector removes an entire piece of infrastructure. Partitioning for audit and event tables. Mature everything. |
| **Disadvantages** | Vertical scaling limits on writes eventually. Connection limits need pooling. pgvector is slower than dedicated vector stores at very high dimensionality/volume. Requires real operational skill. |
| **Alternatives** | **MySQL** — no RLS, weaker JSON, no first-class vectors. **MongoDB** — we need transactions and joins; wrong shape. **CockroachDB/Yugabyte** — horizontal writes, real added complexity and cost, and no need yet. **SQLite/Turso** — great for edge, wrong for multi-tenant transactional SaaS. **Separate vector DB (Qdrant/Pinecone/Turbopuffer)** — better at scale but adds a service, a sync problem, and a consistency problem on day one. |
| **Scalability** | Read replicas early; partition audit/event tables; extract embeddings to a dedicated store only when measured to hurt. Documented trigger, not a guess. |
| **Community** | Best-in-class. |
| **Maintenance** | Use a managed provider (Neon or RDS) to avoid becoming a DBA. |
| **Licensing** | PostgreSQL License (permissive). pgvector is PostgreSQL-licensed. |
| **Cost** | Low at MVP scale; grows predictably. |
| **Future-proofing** | Excellent. Postgres is the safest infrastructure bet available. |

**Decision recorded as [ADR-003](../decisions/ADR-003-postgres-primary-datastore.md).**

---

## 6. Data access layer

**Recommendation: Drizzle ORM.**

| | |
|---|---|
| **Advantages** | SQL-first — the generated queries are predictable, which matters when RLS and query performance are load-bearing. Full type inference from schema. Tiny runtime. First-class migrations. Doesn't hide the database. |
| **Disadvantages** | Younger and less battle-tested than Prisma. Fewer conveniences. Complex queries sometimes read worse than raw SQL. |
| **Alternatives** | **Prisma** — better DX and maturity, but its query generation is opaque, it historically fought RLS and connection pooling, and its engine adds weight. **Kysely** — excellent query builder, weaker migration story. **TypeORM** — legacy patterns, poor typing. **Raw SQL + pg** — maximum control, no type safety, high boilerplate. |
| **Scalability** | Thin wrapper; scalability is Postgres's, not the ORM's. |
| **Community** | Growing fast; smaller than Prisma's. |
| **Maintenance** | Active. Some API churn — pin carefully. |
| **Licensing** | Apache-2.0. |
| **Cost** | Free. |
| **Future-proofing** | Good. Because it's SQL-first, migrating away is far easier than escaping an opinionated ORM. |

**Hard rule:** no ORM-generated query in a hot path without an `EXPLAIN` review. Raw SQL is
permitted and encouraged where it is clearer.

---

## 7. Cache, queue, and coordination

**Recommendation: Redis 7 + BullMQ.**

| | |
|---|---|
| **Advantages** | One dependency covers caching, job queues, distributed locks (for file-level agent locking), rate limiting, and SSE pub/sub fan-out. BullMQ gives retries, backoff, priorities, and repeatable jobs with good TypeScript types. |
| **Disadvantages** | In-memory durability caveats. BullMQ is not a true durable workflow engine — no long-lived versioned state machines. Another service to operate. |
| **Alternatives** | **Temporal** — the right answer for genuinely complex long-running workflows; significant operational and conceptual overhead, and premature here. **PostgreSQL-based queue (pg-boss/Graphile Worker)** — one fewer service and transactional enqueue; weaker throughput and no pub/sub. **SQS/cloud queues** — durable, but ties us to a cloud and adds latency. **Trigger.dev / Inngest** — excellent DX for durable jobs; adds a vendor in the critical run path. |
| **Scalability** | Redis Cluster if needed. Our queue volume is modest — runs are minutes-to-hours, not milliseconds. |
| **Community** | Both large. |
| **Maintenance** | Low; use managed Redis. |
| **Licensing** | Redis has re-licensed (RSALv2/SSPL for recent versions). **Mitigation: use Valkey (BSD-3) if the license becomes a problem** — it is a drop-in fork. BullMQ is MIT. |
| **Cost** | Low. |
| **Future-proofing** | Adequate, with a known ceiling. |

**Explicit re-evaluation trigger:** when the orchestrator's state machine outgrows "queue + explicit
Postgres state" — expected around Phase 5 when deployment workflows add multi-day, multi-approval
flows — re-evaluate Temporal. The orchestrator is written behind an interface so this is a
contained change, not a rewrite. Recorded in
[28. Technical Debt Strategy](../05-delivery/28-technical-debt-strategy.md).

---

## 8. Agent runtime ⟵ **the highest-leverage decision**

**Recommendation: Claude Managed Agents, accessed exclusively through an `AgentRuntime` port.**

| | |
|---|---|
| **Advantages** | Eliminates three of our four hardest infrastructure problems at once: **(a)** per-session sandboxed containers with configurable egress — we don't build a microVM fleet; **(b)** a hosted, resumable agent loop with event streaming, interrupts, and compaction — we don't build a durable agent harness; **(c)** a credential vault where secrets are injected at egress and never enter the sandbox — the single hardest security requirement, solved by construction. Plus versioned agent definitions, persistent memory stores with audit and redaction, one-level multi-agent threads, cron deployments, and webhooks. Effectively 12+ months of platform engineering we don't do. |
| **Disadvantages** | **Vendor concentration** — the most serious downside, and it is serious. Beta API surface subject to change. Minimum data-retention requirements block zero-data-retention customers. Less control over sandbox internals. Pricing exposure on a critical path. |
| **Alternatives** | **Build on Firecracker/gVisor + our own harness** — full control and no vendor risk, but 12–18 months and a permanent security-critical maintenance burden that is not our product. **E2B / Daytona / Modal (sandbox only) + our own agent loop** — good middle ground; we'd still build the loop, memory, and vault. Kept as the fallback. **Claude Agent SDK self-hosted** — supplies the harness but not the deployment; we'd still own sandboxing and secrets. **Self-hosted sandbox mode of the same platform** — how we serve Phase 7 enterprise customers without changing our code. |
| **Scalability** | Managed and elastic. Rate limits are per-organization and must be modeled in capacity planning. |
| **Community** | Small (new surface) but first-party supported. |
| **Maintenance** | Low for us; we track a beta API, which is real but bounded work. |
| **Licensing** | Commercial service terms. |
| **Cost** | Inference is dominant; sandbox compute is a small share. Modeled in §7. |
| **Future-proofing** | **Mitigated by architecture, not by hope.** The `AgentRuntime` port is narrow (5 methods). A self-hosted adapter is a planned Phase 7 deliverable — which means we *prove* the abstraction holds rather than assuming it does. |

**This is the decision most likely to be questioned, so the reasoning is explicit:** we are a
small team whose differentiator is orchestration, verification, and governance — not sandbox
engineering. Building our own execution plane would consume the entire runway to reach parity on
something customers cannot see. Renting it, behind a port, with a funded exit ramp, is the correct
trade. Full argument and exit criteria in
[ADR-002](../decisions/ADR-002-managed-agents-runtime.md).

---

## 9. Models

**Recommendation: Claude, tiered by task class.** See [ADR-004](../decisions/ADR-004-model-tiering.md).

| | |
|---|---|
| **Advantages** | Current state of the art on long-horizon agentic and coding work — precisely our workload. Large context suits whole-repo reasoning. Prompt caching at ~0.1× read cost is a decisive margin lever. Adaptive thinking with tunable effort gives a real cost/quality dial. Batch API at 50% for non-interactive work. |
| **Disadvantages** | Single-provider dependency. Price and capability changes are outside our control. Safety classifiers can decline benign security-adjacent work — must be handled, not ignored. |
| **Alternatives** | **Multi-provider from day one** — reduces vendor risk but multiplies eval surface, prompt-tuning cost, and cache fragmentation across every agent; premature at MVP. **Open-weights self-hosted** — removes per-token cost and enables true ZDR, but current capability on long-horizon agentic work doesn't clear our quality bar, and GPU ops is a business we don't want. |
| **Scalability** | Per-organization rate limits; tiers have separate pools, which is itself a capacity-planning tool. |
| **Maintenance** | Model migrations are real work — budget for a re-eval each time we move a tier. |
| **Cost** | Our dominant COGS. Managed by tiering, caching, and budgets. |
| **Future-proofing** | Abstracted behind the tier mapping table, so a provider swap is a mapping change plus an eval run — not a code change. |

**Required handling:** refusal fallbacks configured on every reasoning-tier call (safety classifiers
can decline benign security work); `stop_reason` checked before reading content on every call.

---

## 10. Authentication

**Recommendation: Better Auth (self-hosted, Postgres-backed).**

| | |
|---|---|
| **Advantages** | We own the user data — which matters for data residency (Phase 7) and for not paying per-MAU on our own users. Postgres-backed, so users join naturally against our tenancy model and RLS. Plugin support for organizations, OAuth, 2FA, and SSO. TypeScript-native. |
| **Disadvantages** | Younger than the alternatives; we own auth correctness, which is a security-critical burden. Less turnkey enterprise SSO than WorkOS. |
| **Alternatives** | **WorkOS** — best-in-class enterprise SSO/SCIM; excellent Phase 7 addition, expensive and unnecessary now. **Clerk** — superb DX, but per-MAU pricing and it owns the user record (a residency problem later). **Auth0** — mature, expensive, heavyweight. **Supabase Auth** — good, pulls us toward the whole Supabase platform. **Roll our own** — no. |
| **Scalability** | Scales with Postgres. |
| **Community** | Growing quickly. |
| **Maintenance** | Moderate — security-critical dependency; must track advisories actively. |
| **Licensing** | MIT. |
| **Cost** | Free; no per-user fee. |
| **Future-proofing** | Reasonable. **Planned Phase 7 addition of WorkOS for enterprise SSO/SCIM only**, keeping Better Auth as the primary identity store. |

**Confidence: medium.** This is the second decision I'd flag for review. If enterprise arrives
sooner than Phase 7, starting with WorkOS would be defensible.

---

## 11. Remaining choices (condensed)

Each was evaluated on the same nine criteria; the decisive factor is given.

| Concern | Recommendation | Alternatives considered | Decisive factor |
|---|---|---|---|
| **Billing** | Stripe | Paddle, Lemon Squeezy, Orb, Metronome | Usage-based metering + invoicing + tax handling in one, and universally trusted by buyers |
| **Object storage** | Cloudflare R2 (S3 API) | S3, GCS, Backblaze | Zero egress fees; we serve artifacts and logs. S3-compatible so it's swappable |
| **Email** | Resend | SendGrid, Postmark, SES | DX and deliverability; low volume, low switching cost |
| **Observability** | OpenTelemetry → Grafana Cloud (Tempo/Loki/Mimir) | Datadog, Honeycomb, self-hosted Grafana | OTel keeps us vendor-neutral; Grafana Cloud is dramatically cheaper than Datadog at our volume |
| **LLM observability** | Langfuse (self-hostable) | Braintrust, LangSmith, W&B Weave | Self-hostable (prompts and code are sensitive); good eval tooling |
| **Error tracking** | Sentry | Rollbar, Bugsnag | Best-in-class traces and source maps; OTel-compatible |
| **IaC** | OpenTofu | Terraform, Pulumi, CDK | License safety (Terraform's BUSL change is a real risk); Pulumi is nicer but smaller |
| **Hosting (MVP)** | Fly.io or Railway | Vercel+Render, ECS/Fargate, managed K8s | Fast to ship, containers not functions, long-lived connections supported. **K8s at Phase 6 when scale justifies it, not before** |
| **CI/CD** | GitHub Actions | GitLab CI, CircleCI, Buildkite | Repos are on GitHub; ecosystem is unmatched |
| **Unit/integration testing** | Vitest | Jest, node:test | Fast, ESM-native, Vite-aligned |
| **E2E testing** | Playwright | Cypress, Puppeteer | Multi-browser, best trace/debug tooling, strong a11y integration |
| **Agent evaluation** | Custom harness + recorded-replay fixtures | Promptfoo, Braintrust evals | Our eval unit is a *milestone outcome*, not a prompt response — no off-the-shelf tool models that |
| **Schema validation** | Zod | Valibot, TypeBox, ArkType | Ubiquitous; integrates with structured model outputs and OpenAPI generation |
| **API docs** | OpenAPI generated from Fastify JSON Schema | Hand-written, tRPC | Single source of truth; no drift between code and docs |

## Rejected wholesale, and why

| Technology | Why not |
|---|---|
| Kubernetes at MVP | Operational cost with no benefit at 50 orgs. Revisit Phase 6 with data. |
| Microservices | Distributed-systems tax before product-market fit. Modular monolith with enforced boundaries gets the same optionality. |
| GraphQL | No client-shape diversity to justify it; complicates rate limiting, caching, and auditing. |
| Kafka / event streaming platform | Our event volume is orders of magnitude below the threshold. Postgres outbox + Redis suffices. |
| Dedicated vector database | pgvector until measured to hurt. Documented trigger, not indefinite deferral. |
| Multi-cloud | Solving a problem we don't have at the cost of every abstraction being lowest-common-denominator. |
| Custom agent framework | The Managed Agents platform plus our orchestrator covers it. Writing a framework is a way to avoid writing a product. |

## Related

- [12. High-Level System Architecture](12-system-architecture.md)
- [15. Database Strategy](15-database-strategy.md)
- [ADR-001 — TypeScript monorepo](../decisions/ADR-001-typescript-monorepo.md)
- [ADR-002 — Managed Agents runtime](../decisions/ADR-002-managed-agents-runtime.md)
- [ADR-003 — Postgres as primary datastore](../decisions/ADR-003-postgres-primary-datastore.md)
- [ADR-004 — Model tiering](../decisions/ADR-004-model-tiering.md)

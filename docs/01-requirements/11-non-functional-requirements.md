# 11. Non-Functional Requirements

Every NFR below is stated as a **measurable target with a verification method**. An NFR without a
number is an aspiration, and aspirations don't gate releases.

`ASSUMPTION-006`: MVP-phase targets assume ≤ 50 organizations and ≤ 200 concurrent agent runs.
Scale targets are the Phase 6 figures.

---

## 1. Performance

| ID | Requirement | MVP target | Scale target | Verified by |
|---|---|---|---|---|
| NFR-PERF-1 | API read latency (p95) | < 300 ms | < 200 ms | Load test in CI; OTel histograms |
| NFR-PERF-2 | API write latency (p95) | < 600 ms | < 400 ms | Same |
| NFR-PERF-3 | Dashboard Largest Contentful Paint (p75) | < 2.5 s | < 1.8 s | Lighthouse CI budget, fails build |
| NFR-PERF-4 | Interaction to Next Paint (p75) | < 200 ms | < 200 ms | Lighthouse CI |
| NFR-PERF-5 | Agent output stream first token | < 3 s | < 2 s | Synthetic probe |
| NFR-PERF-6 | Stream event delivery lag (p95) | < 500 ms | < 300 ms | Synthetic probe |
| NFR-PERF-7 | Sandbox provisioning time (p95) | < 20 s | < 10 s | Run telemetry |
| NFR-PERF-8 | Initial JS bundle, gzipped | < 250 KB | < 200 KB | Bundle budget, fails build |
| NFR-PERF-9 | No unbounded query: every list endpoint paginated, max page 100 | absolute | absolute | Lint rule + review |

**Explicit non-target:** agent *task* completion time is not an NFR. It is bounded by model latency
and task complexity, and setting a target would incentivize cutting reasoning depth. We measure and
report it; we don't gate on it.

## 2. Scalability

| ID | Requirement | MVP | Scale |
|---|---|---|---|
| NFR-SCALE-1 | Concurrent agent runs | 200 | 10,000 |
| NFR-SCALE-2 | Organizations | 50 | 50,000 |
| NFR-SCALE-3 | Repository size handled | 100 MB / 10k files | 2 GB / 200k files |
| NFR-SCALE-4 | Audit records retained online | 10 M | 10 B (partitioned + tiered) |
| NFR-SCALE-5 | All request-path services are stateless and horizontally scalable | absolute | absolute |
| NFR-SCALE-6 | No single-writer bottleneck in the run path; agent work is queue-driven | absolute | absolute |
| NFR-SCALE-7 | Read replicas serve analytics and dashboard aggregates | Phase 6 | required |

## 3. Availability & reliability

| ID | Requirement | MVP | Scale |
|---|---|---|---|
| NFR-AVAIL-1 | Control-plane (API + dashboard) availability | 99.5% | 99.9% |
| NFR-AVAIL-2 | Agent execution availability | 99.0% | 99.5% |
| NFR-AVAIL-3 | An in-flight run survives control-plane restart and resumes | required | required |
| NFR-AVAIL-4 | A crashed run is detectable and resumable, never silently lost | required | required |
| NFR-AVAIL-5 | RPO (data loss window) | ≤ 5 min | ≤ 1 min |
| NFR-AVAIL-6 | RTO (restore time) | ≤ 4 h | ≤ 1 h |
| NFR-AVAIL-7 | Model provider outage degrades gracefully: runs pause and resume, never fail destructively | required | required |
| NFR-AVAIL-8 | Backups restored and verified on a schedule | monthly | weekly |

## 4. Fault tolerance

| ID | Requirement |
|---|---|
| NFR-FT-1 | Every external call (model API, Git host, sandbox) has an explicit timeout and bounded retry with jittered backoff |
| NFR-FT-2 | Circuit breakers on all third-party dependencies |
| NFR-FT-3 | All state-changing API endpoints and all agent tool side-effects are idempotent, keyed by request/tool-use ID |
| NFR-FT-4 | Partial milestone failure never corrupts project state; work is committed atomically per task |
| NFR-FT-5 | A poisoned task (repeatedly failing) is quarantined, not retried forever |
| NFR-FT-6 | Rate-limit responses from providers are handled by backpressure, not by dropping work |

## 5. Security

Full controls in [17. Security Strategy](../02-architecture/17-security-strategy.md). The
non-negotiable NFRs:

| ID | Requirement |
|---|---|
| NFR-SEC-1 | Zero cross-tenant data access. Enforced by Postgres RLS **and** an application-layer guard (defence in depth) |
| NFR-SEC-2 | No secret ever enters an agent's context window, prompt, sandbox environment, or memory store |
| NFR-SEC-3 | Sandboxes have no host network access; egress is deny-by-default with an allowlist |
| NFR-SEC-4 | All data encrypted in transit (TLS 1.3) and at rest (AES-256) |
| NFR-SEC-5 | All tool output is treated as untrusted input; no privileged action executes on tool-output instruction alone |
| NFR-SEC-6 | Dependency and container scanning in CI; build fails on a known critical CVE |
| NFR-SEC-7 | Least privilege on every service identity; no shared credentials between environments |
| NFR-SEC-8 | Every irreversible action (production deploy, destructive migration, force push, data deletion) requires human approval |
| NFR-SEC-9 | Third-party penetration test before general availability |

## 6. Observability

| ID | Requirement |
|---|---|
| NFR-OBS-1 | OpenTelemetry traces span the full path: HTTP request → orchestrator → agent session → tool call → model call |
| NFR-OBS-2 | Structured JSON logs with correlation IDs; **no secrets, no PII, no customer source code in logs** |
| NFR-OBS-3 | The four golden signals (latency, traffic, errors, saturation) instrumented per service |
| NFR-OBS-4 | LLM-specific observability: per-run token counts, cache hit rate, cost, model, effort, latency |
| NFR-OBS-5 | SLOs with error budgets and burn-rate alerting; alerts are actionable and runbooked |
| NFR-OBS-6 | Every user-visible error surfaces a support-correlatable request ID |
| NFR-OBS-7 | Alert-to-runbook coverage is 100%; an alert with no runbook is a defect |

## 7. Maintainability

| ID | Requirement |
|---|---|
| NFR-MAINT-1 | TypeScript `strict` mode everywhere; `any` requires an inline justification comment |
| NFR-MAINT-2 | Enforced module boundaries — a lint rule fails the build on a cross-layer import violation |
| NFR-MAINT-3 | Cyclomatic complexity ≤ 15 per function; ≤ 400 lines per file (warn), ≤ 800 (fail) |
| NFR-MAINT-4 | Zero circular dependencies between packages, enforced in CI |
| NFR-MAINT-5 | Every public function and exported type documented; every module has a README |
| NFR-MAINT-6 | Dependency count and bundle size reviewed at each phase gate |
| NFR-MAINT-7 | No business logic in route handlers or React components — services own it |

## 8. Testability

| ID | Requirement |
|---|---|
| NFR-TEST-1 | Line coverage ≥ 80% overall; ≥ 95% on auth, authorization, tenant isolation, cost metering, and the tool-permission layer |
| NFR-TEST-2 | Domain logic is testable without a database, network, or model call |
| NFR-TEST-3 | Every agent has deterministic, replayable evaluation cases; model calls are recorded and replayed in CI |
| NFR-TEST-4 | Critical user journeys covered by end-to-end tests |
| NFR-TEST-5 | Every bug fix ships with a regression test that fails before the fix |

## 9. Accessibility

| ID | Requirement |
|---|---|
| NFR-A11Y-1 | WCAG 2.2 Level AA conformance |
| NFR-A11Y-2 | Full keyboard operability; no mouse-only interaction anywhere |
| NFR-A11Y-3 | Contrast ≥ 4.5:1 body text, ≥ 3:1 large text and UI boundaries — in **both** themes |
| NFR-A11Y-4 | Visible, non-color-dependent focus indicators |
| NFR-A11Y-5 | Meaning is never conveyed by color alone (matters for run status and diffs) |
| NFR-A11Y-6 | `prefers-reduced-motion` respected; all animation suppressible |
| NFR-A11Y-7 | Streaming agent output announced to assistive technology without flooding it |
| NFR-A11Y-8 | Automated axe checks in CI; manual screen-reader audit each phase gate |

## 10. Compliance & data protection

| ID | Requirement | Phase |
|---|---|---|
| NFR-COMP-1 | Data inventory: every personal data field documented with purpose and lawful basis | 1 |
| NFR-COMP-2 | Configurable data retention with automated purge | 2 |
| NFR-COMP-3 | Data export (portability) for organizations and users | 2 |
| NFR-COMP-4 | Right to erasure honored within 30 days, including from backups on their rotation | 3 |
| NFR-COMP-5 | Sub-processor register published and kept current | 3 |
| NFR-COMP-6 | Data residency: choose EU or US processing region | 7 |
| NFR-COMP-7 | Customer code and prompts are contractually never used for model training | 1 (contractual) |
| NFR-COMP-8 | SOC 2 Type II | 7 |
| NFR-COMP-9 | DPA available to all paying customers | 6 |

**Known constraint, stated honestly:** the managed agent runtime we depend on requires a minimum data
retention window for some model tiers, so **zero-data-retention is not available in Phase 1**.
Customers with a hard ZDR requirement are served by self-hosted execution in Phase 7. This is
recorded as a limitation rather than glossed, because discovering it during an enterprise security
review would be far worse.

## 11. Cloud-native & operability

| ID | Requirement |
|---|---|
| NFR-CN-1 | Every service is containerized; images are reproducible and minimal (distroless where possible) |
| NFR-CN-2 | All infrastructure defined as code (OpenTofu); no manual console changes in any environment |
| NFR-CN-3 | Configuration via environment; validated at startup — the process refuses to boot on invalid config |
| NFR-CN-4 | Health and readiness endpoints; graceful shutdown that drains in-flight work |
| NFR-CN-5 | Zero-downtime deploys; database migrations are backward-compatible and separately deployable |
| NFR-CN-6 | Environment parity: dev, staging, and production differ only by scale and configuration |

## Requirement conflicts, resolved

Stating these prevents relitigating them later:

| Tension | Resolution |
|---|---|
| Agent capability vs. sandbox restriction | **Security wins.** Add a specific allowlisted capability; never relax the sandbox. |
| Cost control vs. output quality | **Quality wins within budget.** Lower effort or narrow scope; never silently degrade the review or test gate. |
| Autonomy vs. auditability | **Auditability wins.** An unauditable action is not permitted at any autonomy level. |
| Latency vs. correctness | **Correctness wins.** Users tolerate a slow agent; they don't tolerate a wrong one. |
| Feature velocity vs. tenant isolation | **Isolation wins, always.** It is the one thing that cannot be fixed after the fact. |

## Related

- [10. Functional Requirements](10-functional-requirements.md)
- [17. Security Strategy](../02-architecture/17-security-strategy.md)
- [23. Testing Strategy](../04-engineering/23-testing-strategy.md)
- [24. CI/CD Strategy](../04-engineering/24-cicd-strategy.md)

# 17. Security Strategy

This platform executes untrusted, machine-generated code against customer repositories with access to
customer credentials. **The threat model is unusually hostile, and security is a functional
requirement, not a hardening pass.**

## Threat model

### Assets, ranked

1. Customer source code and repository write access
2. Customer credentials (Git tokens, cloud keys, API keys)
3. Cross-tenant data (the one unrecoverable failure)
4. Our own model-provider credentials
5. Project memory and knowledge base contents
6. Audit log integrity
7. Platform availability

### Adversaries

| Adversary | Capability | Primary concern |
|---|---|---|
| External attacker | Unauthenticated internet access | Auth bypass, injection, SSRF, tenant escape |
| Malicious customer | Valid account, arbitrary agent input | Sandbox escape, cross-tenant access, resource abuse |
| **Attacker via content** | Controls text an agent will read — a README, issue, web page, dependency, or capability pack | **Prompt injection → privileged action or exfiltration** |
| Compromised dependency | Arbitrary code at build or install time | Supply chain, credential theft |
| Malicious insider | Production access | Data access, audit tampering |
| The agent itself | Non-adversarial but unreliable | Destructive mistakes, accidental leakage |

The third row is the distinctive one. **In this system, tool output is attacker-controlled input**,
and every control below assumes it.

---

## Control 1 — Tenant isolation

The failure we cannot recover from, so it gets three independent mechanisms.

| Layer | Mechanism |
|---|---|
| Data | Postgres RLS with `FORCE ROW LEVEL SECURITY`, policies resolving through `memberships` |
| Application | Mandatory `TenantContext` on every repository call; lint rule fails the build without it |
| Verification | A cross-tenant test suite that attempts every read and write as the wrong tenant on every table, on every commit |

Additionally: `organization_id` is **never** accepted from a client (§16); resource IDs are UUIDv7 so
they aren't enumerable; a 404 is returned for both "absent" and "not yours."

**95% test coverage floor on this path. A release with a failing cross-tenant test does not ship.**

---

## Control 2 — Sandbox isolation

Generated code executes in an ephemeral, per-run container that we treat as fully compromised.

| Property | Setting |
|---|---|
| Lifetime | Per run. Destroyed after. Never reused across tenants. |
| Host access | None. No host filesystem, no host network namespace. |
| Network egress | **Deny by default.** Explicit allowlist: package registries, the project's Git host, allowlisted documentation domains. |
| Cloud metadata endpoints | Blocked (`169.254.169.254` and equivalents) — a classic escalation path. |
| Private address space | Blocked from the sandbox, to prevent it reaching our own internal services. |
| Resource limits | CPU, memory, disk, process count, wall-clock — all capped. |
| Privileges | Non-root; read-only root filesystem; capabilities dropped. |
| Secrets in the environment | **None.** See Control 3. |

**Multi-tenant isolation is provided by the managed runtime's per-session containers**
([ADR-002](../decisions/ADR-002-managed-agents-runtime.md)). We do not rely on plain container
isolation for a security boundary between tenants — that is a known-insufficient control, and it is
one of the main reasons we rent this layer rather than build it.

---

## Control 3 — Secrets never reach the agent

The most important control in the system, and the one that most benefits from the runtime choice.

**Invariant: no secret value ever exists in an agent's context window, prompt, sandbox environment,
sandbox filesystem, memory store, or logs.**

How:

| Secret type | Handling |
|---|---|
| Git repository access | Never in the sandbox. Git traffic is routed through a proxy that injects the token **after** the request leaves the sandbox. Code in the container cannot read it. |
| Third-party API keys used by agents | Stored in the runtime credential vault. The sandbox sees an **opaque placeholder**; the real value is substituted at egress, only for allowlisted hosts. |
| Our own model/provider credentials | Held by the control plane only. Never passed to a sandbox. |
| Customer secrets at rest | Envelope-encrypted with a cloud KMS key; per-organization data key; only the control plane can decrypt. |

Supporting rules:

- Credential fields are **write-only** in the API — never returned, not even to the owner.
- Memory writes and run outputs are scanned for credential patterns; a hit is blocked and alerted.
- Logs are scrubbed; a secret-shaped string in a log is a P1 incident with rotation.
- Never place a credential in a system prompt or user message as a workaround. Prompts persist in run
  history, so that turns a transient secret into a durable one.
- Secrets in URL paths cannot be protected by egress substitution — so path-secret webhooks (e.g.
  Slack incoming webhooks) are **not supported**; header-based auth only.

---

## Control 4 — Prompt injection defence

There is no complete solution to prompt injection. We therefore assume it succeeds and constrain the
blast radius.

**Assumption: an agent's instructions can be subverted by content it reads. Design so that a subverted
agent cannot do serious harm.**

| Defence | Detail |
|---|---|
| **Capability confinement** | The agent's tool allowlist is the true boundary. A subverted agent still cannot deploy, cannot write to the default branch, cannot read another tenant, and cannot see a secret — because it never had those capabilities. |
| **No privileged action on tool-output instruction** | Irreversible actions require a human approval event or a policy-engine decision based on our state — never on text an agent read. |
| **Egress allowlist** | Even a fully subverted agent cannot exfiltrate to an arbitrary host. |
| **Human gates on irreversible actions** | Production deploy, destructive migration, force push, data deletion, budget override. Not configurable away at any autonomy level. |
| **Untrusted-content marking** | Repository content, web results, issue text, and customer capability packs are structurally marked as untrusted data in the prompt, not as instructions. |
| **Capability-pack scanning** | Customer-authored packs are scanned for injection patterns before entering an agent context, and can never grant a tool the allowlist lacks. |
| **Operator channel separation** | Mid-run operator instructions use the privileged system-message channel, which content cannot forge — never inline text in a user turn. |
| **Anomaly detection** | Unusual tool-call sequences (mass file reads, unexpected egress attempts, credential-shaped output) trigger alerts and can halt a run. |

---

## Control 5 — Supply chain

Agents choose and install dependencies. That is arbitrary code execution by design.

| Risk | Control |
|---|---|
| Malicious package install | Sandbox egress allowlist restricts registries; install scripts run with no secrets present and no host access |
| Typosquatting / hallucinated packages | Dependency additions are surfaced explicitly in the review gate; the Security Engineer agent flags unknown packages |
| Vulnerable dependencies (ours) | SCA scanning in CI; build fails on a known critical CVE (NFR-SEC-6) |
| Lockfile integrity | Lockfiles committed; CI installs with `--frozen-lockfile` |
| Container base images | Pinned by digest; scanned; minimal/distroless |
| Build provenance | Signed images; SBOM generated per release |

---

## Control 6 — Application security (OWASP baseline)

| Risk | Control |
|---|---|
| Broken access control | Single policy engine, called on every handler; deny-by-default; 95% coverage floor |
| Injection (SQL) | Parameterized queries only; no string-concatenated SQL, enforced by lint |
| Injection (command) | No raw shell for agents — `bash` is allowlist-constrained to permitted executables, with shell operators rejected |
| XSS | React escaping by default; strict CSP; `dangerouslySetInnerHTML` is lint-banned without an approved exception |
| CSRF | SameSite cookies + CSRF token on unsafe methods |
| SSRF | Outbound HTTP goes through a client that resolves and validates the destination and blocks private address space. Applies to webhook targets and any user-supplied URL |
| Path traversal | All file operations resolve to a canonical path and assert containment within the project root; symlink escapes rejected |
| Insecure deserialization | JSON only, schema-validated at every boundary |
| Auth failures | Argon2id, rate-limited login, generic failure messages, server-side session revocation |
| Cryptographic failures | TLS 1.3 in transit; AES-256 at rest; KMS-managed keys; no home-rolled crypto |
| Security misconfiguration | IaC-only infrastructure; config validated at startup; secure headers by default |
| Logging failures | Immutable audit log; alerting on security events |

---

## Control 7 — Human approval gates

Enforced by the policy engine. **Not overridable by configuration at any autonomy level:**

- Production deployment
- Destructive database migration (drop, non-additive alter, data-losing backfill)
- Force push, or any write to a default branch
- Data deletion (organization, project, or bulk)
- Budget ceiling override
- Granting an agent a new tool capability
- Publishing anything outside the organization

Approval events are audited with actor, timestamp, and the exact payload approved. An approval for
one action never generalizes to the next.

---

## Control 8 — Audit integrity

| Property | Mechanism |
|---|---|
| Completeness | Written in the same transaction as the action; an action cannot exist without its record |
| Immutability | `UPDATE` and `DELETE` revoked from the application database role |
| Coverage | All state changes, all agent tool calls, all approvals and denials, all auth events, all policy denials |
| Tamper evidence | Hash-chained records from Phase 7 (each row includes the prior row's hash) |
| Export | SIEM-compatible export, Phase 7 |
| Retention | Configurable per plan; default 1 year online, then archived |

---

## Control 9 — GDPR & data protection

| Requirement | Approach | Phase |
|---|---|---|
| Data inventory & lawful basis | Documented per field | 1 |
| Data minimization | We store repository *references*, not mirrors, where possible | 1 |
| No training on customer data | Contractual guarantee; provider terms verified | 1 |
| Retention & purge | Configurable, automated | 2 |
| Portability | Full organization export | 2 |
| Right to erasure | 30 days including backup rotation; memory-version redaction preserves audit while clearing content | 3 |
| Sub-processor register | Published; customers notified of changes | 3 |
| DPA | Available to all paying customers | 6 |
| Data residency (EU/US) | Regional deployment | 7 |
| Zero data retention | **Not available in Phase 1** — a documented limitation of the managed runtime. Served by self-hosted execution in Phase 7. | 7 |

Stating the ZDR limitation openly is deliberate. Discovering it mid-enterprise-security-review would
be far more damaging than disclosing it up front.

---

## Security in the development lifecycle

| Stage | Control |
|---|---|
| Design | Threat model review for any feature touching auth, data access, agent capability, or egress |
| Code | Secret scanning pre-commit and in CI; SAST; dependency review; branch protection |
| Review | Security Engineer agent gate on sensitive diffs (Phase 3); human review on the security boundary always |
| Test | Cross-tenant suite; authorization matrix tests; injection tests; a red-team suite of prompt-injection fixtures |
| Deploy | Signed images; least-privilege runtime identities; no long-lived cloud credentials in CI (OIDC federation) |
| Operate | Alerting on policy denials, anomalous tool calls, egress violations, credential-shaped output |
| Verify | Third-party penetration test before general availability (NFR-SEC-9); annually thereafter |

## Incident response

| Severity | Definition | Response |
|---|---|---|
| **P0** | Cross-tenant data access, sandbox escape, or credential compromise | Page immediately; contain within 1 h; customer notification within 72 h |
| **P1** | Secret in logs, auth bypass, audit tampering | Page; contain within 4 h |
| **P2** | Vulnerability with no evidence of exploitation | Ticket; fix within 7 days |
| **P3** | Hardening gap | Backlog |

Every P0/P1 gets a written, blameless postmortem with a corrective action that includes **a
regression test**. A postmortem without a test is not finished.

## Explicitly accepted risks

Honesty about what we are *not* solving:

| Risk | Why accepted | Mitigation |
|---|---|---|
| Vendor concentration on one runtime and model provider | The alternative costs the runway | `AgentRuntime` port + funded Phase 7 self-hosted adapter |
| Prompt injection cannot be fully prevented | No known complete defence exists | Capability confinement so a successful injection is low-impact |
| Agent-generated code may contain vulnerabilities | Model limitation | Security Engineer gate, SCA in the generated project's CI, human PR review |
| No ZDR in Phase 1 | Runtime constraint | Disclosed; self-hosted execution in Phase 7 |
| Agents may produce plausible-but-wrong code | Fundamental to the technology | Independent review + test gates + honest reporting; never claim more certainty than we have |

## Related

- [11. Non-Functional Requirements](../01-requirements/11-non-functional-requirements.md)
- [13. AI Agent Architecture](13-agent-architecture.md)
- [15. Database Strategy](15-database-strategy.md)
- [27. Risk Analysis](../05-delivery/27-risk-analysis.md)
- The `security` and `skill-security-audit` capability packs in [`skills/`](../../skills/) are the
  seed corpus for the Security Engineer agent and the capability-pack scanner.

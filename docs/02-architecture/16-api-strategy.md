# 16. API Strategy

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Style | **REST over HTTP/JSON** | We owe customers a public API in Phase 8; REST is the lowest-friction contract, is trivially cacheable and rate-limitable, and audits cleanly. GraphQL solves client-shape diversity we don't have. |
| Versioning | **URL path: `/v1/...`** | Unambiguous, visible in logs and audit records, trivially routable. Header versioning hides breakage. |
| Schema source of truth | **JSON Schema in Fastify route definitions → generated OpenAPI** | Validation and documentation from one definition. Docs cannot drift from code. |
| Internal vs public | **Same API, different scopes** | Dogfooding: the dashboard uses the API customers will use. Prevents a privileged back door that later can't be exposed. |
| Realtime | **SSE for agent streams; no WebSockets in v1** | Streams are server→client only. SSE is simpler, survives proxies, and needs no separate infrastructure. |

## Resource model

```
/v1/organizations/{orgId}
    /members
    /teams
    /capability-packs
    /usage
    /audit-log

/v1/projects/{projectId}
    /repository
    /milestones/{milestoneId}
        /approve            POST — the human approval gate
        /tasks/{taskId}
            /runs/{runId}
                /events     GET (SSE or paginated)
                /interrupt  POST
    /memory/{entryId}/versions
    /documents
    /costs

/v1/agents/{agentKey}/versions
/v1/runs/{runId}                    (cross-project lookup)
```

`organization_id` is never a query parameter — it is resolved from the authenticated principal.
Allowing a client to name its own tenant is how cross-tenant bugs happen.

## Conventions

### Methods and semantics

| Method | Semantics | Idempotent |
|---|---|---|
| `GET` | Read. Never mutates. Never has side effects. | Yes |
| `POST` | Create, or invoke an action (`/approve`, `/interrupt`) | Only with `Idempotency-Key` |
| `PATCH` | Partial update. The default for updates. | Yes |
| `PUT` | Full replacement. Used rarely. | Yes |
| `DELETE` | Soft delete by default; `?permanent=true` requires elevated permission | Yes |

**Action endpoints are deliberate.** `POST /milestones/{id}/approve` rather than
`PATCH /milestones/{id} {status: "approved"}` — approval is an auditable business event with
authorization rules and side effects, and modeling it as a field update loses that.

### Status codes

| Code | Use |
|---|---|
| 200 | Successful read or update |
| 201 | Created, with `Location` |
| 202 | Accepted — async work enqueued (run starts, plan generation) |
| 204 | Deleted, no body |
| 400 | Malformed request |
| 401 | Not authenticated |
| 403 | Authenticated, not authorized |
| 404 | Not found **or** not visible to this tenant — never distinguish, it's an enumeration oracle |
| 409 | State conflict (approving an already-approved milestone; optimistic-lock mismatch) |
| 422 | Semantically invalid (cyclic dependency graph, budget below floor) |
| 429 | Rate limited, with `Retry-After` |
| 500 | Our fault, with a `request_id` |
| 503 | Dependency unavailable, with `Retry-After` |

### Error envelope

One shape, everywhere:

```json
{
  "error": {
    "type": "validation_error",
    "code": "milestone_dependency_cycle",
    "message": "Milestone 3 depends on milestone 5, which depends on milestone 3.",
    "details": [{ "field": "dependencies", "issue": "cycle: 3 → 5 → 3" }],
    "request_id": "req_01JQ..."
  }
}
```

- `type` — broad class, stable forever.
- `code` — machine-readable, specific, documented, stable.
- `message` — human-readable, safe to display. **Never** leaks internals, SQL, stack traces, or the
  existence of other tenants' resources.
- `request_id` — on every error, always. It's how support works.

### Pagination

Cursor-based only. Offset pagination breaks under concurrent inserts, which our event streams do
constantly.

```
GET /v1/projects?limit=50&cursor=eyJpZCI6...

{ "data": [...], "next_cursor": "eyJpZCI6...", "has_more": true }
```

`limit` defaults to 25, max 100. Every list endpoint is paginated — an unpaginated list endpoint is a
build failure (NFR-PERF-9).

### Filtering, sorting, sparse fields

```
?status=running&created_after=2026-07-01T00:00:00Z
?sort=-created_at
?fields=id,title,status
```

Only allowlisted fields are filterable and sortable. Arbitrary filter expressions become
denial-of-service vectors and unindexed sequential scans.

### Idempotency

Every `POST` that creates a resource or spends money accepts `Idempotency-Key`. The key, request
hash, and response are stored for 24 hours; a replay returns the original response. Required for run
starts and any billing operation — an agent run started twice costs twice.

### Optimistic concurrency

Mutable resources return `ETag`; `PATCH` accepts `If-Match`. A mismatch is `409`. This matters for
plan editing, where two users may edit a milestone list simultaneously.

## Authentication & authorization

| Principal | Mechanism | Notes |
|---|---|---|
| Browser session | httpOnly cookie + CSRF token on unsafe methods | Dashboard |
| API key | `Authorization: Bearer atl_...` | Scoped to an organization, with explicit permission scopes; hashed at rest; prefix-visible for identification |
| Service-to-service | Short-lived internal token | Never a long-lived shared secret |
| Webhook inbound | HMAC signature verification over the raw body, with timestamp tolerance | Raw body — reserializing breaks the MAC |

**Authorization is one call.** Every handler calls the policy engine:

```ts
await policy.assert(principal, "milestone:approve", milestone);
```

No `if (user.role === "owner")` in a route handler, ever. Scattered permission logic cannot be
audited or tested, and this system's permission model is a security boundary.

Scopes on API keys: `projects:read`, `projects:write`, `runs:start`, `runs:read`, `memory:write`,
`costs:read`, `audit:read`. Least privilege by default; a new key gets read-only unless asked.

## Streaming

```
GET /v1/runs/{runId}/events
Accept: text/event-stream
Last-Event-ID: 1042
```

Non-negotiable behaviors:

1. **Replay on reconnect.** `Last-Event-ID` resumes from that sequence. SSE has no built-in replay,
   so we implement it — a dropped connection must never lose agent output.
2. **Ordered and deduplicable.** Every event carries a monotonic `sequence` per run.
3. **Heartbeats** every 15 s to defeat idle proxy timeouts.
4. **Terminal event.** The stream always ends with an explicit terminal event; clients never guess
   whether a run finished.
5. **Backpressure.** A slow consumer is dropped rather than allowed to buffer without bound
   server-side.
6. **History endpoint.** `GET .../events?cursor=` for the same data paginated, so a client can
   reconstruct state without a live stream.

## Rate limiting

| Scope | Limit (MVP) | Enforcement |
|---|---|---|
| Per API key, reads | 1,000 / min | Sliding window in Redis |
| Per API key, writes | 100 / min | Sliding window |
| Per organization, run starts | 20 / min, 60 concurrent | Queue admission control |
| Per IP, unauthenticated | 30 / min | Sliding window |

Responses carry `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`. `429` includes
`Retry-After`. **Run-start limits are enforced by admission control, not by rejection** — a queued
run is better than a lost one.

## Versioning & deprecation policy

- **Additive changes are not breaking** and ship without a version bump: new endpoints, new optional
  request fields, new response fields. Clients must tolerate unknown response fields — stated in the
  API docs as a contract.
- **Breaking changes** require a new major path version. `/v1` is supported for **12 months** after
  `/v2` ships.
- Deprecations announce via the `Deprecation` and `Sunset` response headers, changelog, and email.
- No silent behavior changes, ever. A behavior change without a version bump is the fastest way to
  lose developer trust.

## Webhooks (Phase 8)

Outbound events for run lifecycle, milestone completion, approval-required, and budget threshold.

- Payloads are **thin** — event type plus resource IDs. Clients fetch current state. Fat payloads go
  stale in flight and leak data into logs.
- HMAC-SHA256 signature over the raw body, with `webhook-id`, `webhook-timestamp`, `webhook-signature`
  headers.
- At-least-once delivery with retry and jittered backoff. **Consumers must dedupe on event ID** —
  documented prominently.
- Auto-disable on sustained failure, with notification.
- Endpoints must be HTTPS and must not resolve to private address space (SSRF protection).

## Design rules for the public API surface (Phase 8)

Written now because retrofitting them is expensive:

1. Never expose internal database IDs where a stable public identifier is possible; prefix all IDs by
   type (`proj_`, `run_`, `ms_`) so a misused ID fails loudly.
2. Never expose enum values we intend to churn — use a stable subset and document it.
3. Every field is either documented and supported or absent. No undocumented fields, because
   customers will build on them.
4. Timestamps are always RFC 3339 UTC with an explicit `Z`. No epoch integers, no local time.
5. Money is always an integer minor unit plus a currency code, or a decimal string. Never a float.

## Related

- [12. High-Level System Architecture](12-system-architecture.md)
- [17. Security Strategy](17-security-strategy.md)
- [10. Functional Requirements](../01-requirements/10-functional-requirements.md)
- The `api-design` capability pack in [`skills/`](../../skills/api-design/) is the authoritative
  detailed convention set and is reused as a platform capability pack (ADR-005).

# 26. Staging Runbook

Railway, GHCR, staging only ([ADR-009](../decisions/ADR-009-railway-staging.md)).

## What the owner has to do once

The pipeline is written and verified locally; it cannot deploy until these exist. Nothing here can
be done from a development machine.

### 1. Railway project

1. Sign in at [railway.app](https://railway.app) with GitHub.
2. **New Project** → **Empty Project**, name it `atelier-staging`.
3. **+ New** → **Database** → **PostgreSQL**.
4. **+ New** → **Database** → **Redis**.
5. **+ New** → **Empty Service**, name it `api`. Settings → **Source** → **Docker Image**, and point
   it at `ghcr.io/el-masterio/ai-engineering-platform/api:staging`.
   - The package is private by default. Either make it public
     (GitHub → Packages → api → Package settings → Change visibility), or add a Railway registry
     credential using a GitHub PAT with `read:packages`.
6. Service → **Settings** → **Health Check Path**: `/readyz`. This is what makes replacement
   zero-downtime — Railway holds traffic on the old container until the new one passes.
7. Service → **Networking** → **Generate Domain**. Note the URL.

### 2. Service variables

On the `api` service → **Variables**:

| Variable | Value |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` — Railway's reference syntax, not a copied string |
| `NODE_ENV` | `production` |
| `LOG_LEVEL` | `info` |
| `OPENROUTER_API_KEY` | your key |
| `GROQ_API_KEY` | your key |

`PORT` is injected by Railway. Do not set it.

`REDIS_URL` is not needed yet — nothing reads it until the job queue lands.

### 3. GitHub repository settings

**Settings → Secrets and variables → Actions**

| Kind | Name | Value |
|---|---|---|
| Secret | `RAILWAY_TOKEN` | Railway → Account Settings → Tokens → Create. Scope it to the project. |
| Variable | `RAILWAY_SERVICE` | `api` |
| Variable | `STAGING_URL` | the generated domain, e.g. `https://api-staging.up.railway.app` |

**Settings → Environments → New environment → `staging`.** Optionally add yourself as a required
reviewer if you want deploys to pause for approval.

### 4. First migration

Staging's database starts empty. Once the service is up:

```bash
DATABASE_URL='<the Railway Postgres URL>' pnpm db:migrate
```

Migrations are deliberately **not** run by the deploy workflow. §15's expand→migrate→contract policy
means a migration must be deployable *before* the code that uses it, and coupling the two removes
the ability to sequence them. A migration step joins the pipeline when there is a second migration
to sequence.

## Everyday operation

| Task | How |
|---|---|
| Deploy | Merge to `main`. CI runs; on green, **Deploy staging** builds, signs, pushes and deploys. |
| Re-deploy | Actions → **Deploy staging** → Run workflow, leave the digest empty. |
| **Roll back** | Actions → **Deploy staging** → Run workflow, paste the digest of a known-good build. Every run prints its digest in the job summary. |
| Check what is deployed | `curl $STAGING_URL/` — the `revision` field is the git SHA. |
| Smoke it by hand | `pnpm smoke $STAGING_URL <sha>` |
| Logs | Railway dashboard → service → Deployments → Logs. Structured JSON, redacted (§M006). |

**Rollback is by digest, never by tag.** A tag can be moved; a digest is the image. That is the
difference between "roll back to what was running" and "roll back to whatever that tag points at
now".

## Verification status

Verified locally, on the real image:

| | |
|---|---|
| Image builds | 232 MB, multi-stage, runs as uid 1000 |
| Endpoints | `/` 200 with revision · `/healthz` 200 · `/readyz` 200 with a live database check · unknown 404 |
| Correlation | `x-request-id` on every response |
| Config gate | Refuses to boot with `NODE_ENV=production` and no provider key |
| Graceful shutdown | SIGTERM → drain → exit 0, no forced kill |
| Smoke test | 8 checks pass; fails correctly on a wrong revision, a dead database, and a dead service |

**Not verified, and cannot be from here:** the deploy step itself, zero-downtime replacement, and
rollback by digest. All three need a live Railway project. They are the first thing to check after
the setup above.

## Related

- [ADR-009](../decisions/ADR-009-railway-staging.md) — why Railway, and why the artifact stays portable
- [§24 CI/CD Strategy](24-cicd-strategy.md) — stages 8–11
- [§25 Developer Guide](25-developer-guide.md) — local environment

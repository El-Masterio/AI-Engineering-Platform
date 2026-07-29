# 26. Staging Runbook

Railway, GHCR, staging only ([ADR-009](../decisions/ADR-009-railway-staging.md)).

## First-time setup

**The order matters, and it is not the order you would guess.** The image has to exist in GHCR
before Railway can be pointed at it, and Railway does not issue a public domain until something has
actually deployed — so `STAGING_URL` is the *last* thing you set, not the first.

The pipeline is built for that. It publishes the image, then warns and stops rather than failing
when Railway is not configured yet; and the smoke test skips itself when `STAGING_URL` is empty. A
half-configured repository gets you a published image and a yellow warning, not a red X.

```
CI green on main  ─▶  [9] image published to GHCR      ← works with zero setup
                        │
                        ├─ Railway configured? no ─▶ warn, stop        (you are here)
                        └─ yes ─▶ [10] deploy ─▶ [11] smoke (skipped until STAGING_URL is set)
```

### Step 1 — get an image into GHCR

Merge to `main` with CI green. That is the whole step; job **[9]** needs no secrets, because it
authenticates with the workflow's own `GITHUB_TOKEN`.

Confirm it worked: repository → **Packages** → an `api` package should now exist, tagged `staging`
and `sha-<commit>`.

> If Packages is still empty, CI did not go green on `main` — job [9] only runs after it does. Check
> the **CI** workflow first; nothing downstream can work until it passes.

### Step 2 — make the image pullable

The package is private by default, and Railway is not logged in to your GHCR.

Either make it public — repository → **Packages** → `api` → **Package settings** → **Change
visibility** — or add a Railway registry credential using a GitHub PAT with `read:packages`. Public
is fine here: the image contains no secrets, only compiled code that is already in the repository.

### Step 3 — Railway project

1. Sign in at [railway.app](https://railway.app) with GitHub.
2. **New Project** → **Empty Project**, name it `atelier-staging`.
3. **+ New** → **Database** → **PostgreSQL**.
4. **+ New** → **Database** → **Redis**.
5. **+ New** → **Empty Service**, name it `api`. Settings → **Source** → **Docker Image**:
   `ghcr.io/el-masterio/ai-engineering-platform/api:staging`.
   - **Not** the GitHub-repo source. Connecting the repo makes Railway build the image itself, which
     bypasses the signed, SBOM-attested, multi-arch artifact CI just produced and means staging runs
     something no gate ever checked. If you already connected the repo, change the source to the
     Docker image.
6. Service → **Settings** → **Health Check Path**: `/readyz`. This is what makes replacement
   zero-downtime — Railway holds traffic on the old container until the new one passes.

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

### Step 4 — GitHub settings

**Settings → Secrets and variables → Actions**

| Kind | Name | Value |
|---|---|---|
| Secret | `RAILWAY_TOKEN` | A **project token** — see below. Not an account token. |
| Variable | `RAILWAY_SERVICE` | `api` |

> **Railway has two kinds of token and the CLI treats them differently.** `RAILWAY_TOKEN` must be a
> **project token**, created at **Project Settings → Tokens** and scoped to a project *and*
> environment. An account token (Account Settings → Tokens) goes in `RAILWAY_API_TOKEN` instead;
> putting one in `RAILWAY_TOKEN` fails with `Invalid RAILWAY_TOKEN`, which reads like the token is
> malformed rather than the wrong kind.
>
> Use the project token regardless: it is scoped to this one project and environment, so a leaked CI
> secret cannot reach anything else in the account. An account token can.

**Settings → Environments → New environment → `staging`.** Optionally add yourself as a required
reviewer if you want deploys to pause for approval.

Leave `STAGING_URL` for now — it does not exist yet.

### Step 5 — first deploy, then the domain

Re-run **Deploy staging** (Actions → Deploy staging → Run workflow, digest empty). Job [10] now
finds its credentials and deploys.

Once it succeeds: Railway → `api` → **Networking** → **Generate Domain**. *Now* add that URL as the
GitHub variable `STAGING_URL`. From the next run onwards, job [11] smoke-tests every deploy.

### Step 6 — first migration

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

### How a deploy actually selects an image

Railway pulls the `:staging` tag. The workflow never *relies* on that tag — it **repoints** it at an
exact digest immediately before redeploying:

```
docker buildx imagetools create --tag …/api:staging  …/api@sha256:<digest>
railway redeploy --service api --yes
```

That is a manifest-level retag: no rebuild, no pull, and the multi-arch index survives intact. On a
forward deploy the digest is the one job [9] just built, so the retag is a formality. On a rollback
the digest is yours, and the retag is the entire mechanism.

Two properties fall out of doing it this way, and both are the point:

- **Rollback and forward deploy are the same code path.** A rollback path that only runs during an
  incident is a rollback path nobody knows works.
- **A rollback never rebuilds.** Job [9] is skipped outright when a digest is supplied — rebuilding
  from `main` would produce a *different* image than the one you asked to roll back to, which is the
  opposite of a rollback.

**So: by digest, never by tag.** A tag can be moved; a digest is the image. That is the difference
between "roll back to what was running" and "roll back to whatever that tag points at now".

## Troubleshooting

**Packages says "No packages published."**
Job [9] has never run to completion. It only runs after **CI** goes green *on `main`* — a green run
on a milestone branch is not enough. Fix CI first.

**Job [10] warns "Railway is not configured".**
`RAILWAY_TOKEN` or `RAILWAY_SERVICE` is missing. The image is published regardless; that warning is
by design, so the very first run can produce the image Railway needs before Railway exists.

**Job [10] fails with `Invalid RAILWAY_TOKEN`.**
Almost always the wrong *kind* of token rather than a malformed one — `RAILWAY_TOKEN` must be a
project token (Project Settings → Tokens), not an account token. See step 4.

**Job [11] warns "STAGING_URL is not set".**
Expected until step 5. Railway issues a domain only after a successful deploy.

**The container crash-loops on `DATABASE_URL must be a postgres:// … connection string`.**
The `${{Postgres.DATABASE_URL}}` reference did not resolve, so the literal template arrived as the
value. Since M011 the message says so explicitly ("unresolved platform reference"); older images
give the generic one and send you looking at the wrong thing. Two causes, in order of likelihood:

1. **The variable change was never applied.** Railway stages variable edits — an "Apply N changes"
   banner sits at the top of the canvas until you press **Deploy**. Staged is not saved.
2. **The service name does not match.** References are **case-sensitive** and must name the service
   exactly as it appears on the canvas. Use **Variables → New Variable → Add a Reference** and pick
   the database from the list rather than typing the reference by hand — it cannot be misspelled
   that way.

Verify from the Railway shell before redeploying: `echo $DATABASE_URL` should print a
`postgresql://…` string, not `${{…}}`.

**The smoke test fails on `serving revision …` after a rollback.**
It should not — the revision assertion is skipped on the rollback path, because the running revision
is deliberately the *old* commit. If you see it, the run was a forward deploy that silently deployed
nothing, which is exactly the failure that check exists to catch.

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

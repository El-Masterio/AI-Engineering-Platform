-- 0002_create_authentication (up)
--
-- Better Auth's identity tables, and the boundary that lets authentication read
-- them (ADR-010).
--
-- The problem this migration solves: 0001 put `users` under FORCE ROW LEVEL
-- SECURITY with visibility scoped through `memberships`, which is correct for
-- the product and impossible for sign-in. A sign-in request carries an email
-- and a password and nothing else — `app.current_organization_id` is unset, the
-- EXISTS subquery matches nothing, and the lookup returns ZERO ROWS. Not
-- denied: empty, which an application reports as "no such user" for every user
-- in the database.
--
-- Nor is that a gap later milestones close. Tenant resolution is M015 and the
-- API layer is M016; authentication is M014 and runs first. There is no
-- ordering in which sign-in already knows its tenant, because the tenant is a
-- property of the session that authentication creates.
--
-- The resolution is a second principal. `atelier_auth` is granted identity and
-- NOTHING else; `atelier_app` keeps every policy 0001 gave it, unchanged, and
-- is granted no access to credentials at all. The bypass is therefore a named
-- role with an asserted blast radius rather than an absence someone has to
-- notice.

-- ── Privilege holder ────────────────────────────────────────────────────────
-- NOLOGIN, matching 0001: a group role that owns privileges, never an account.
-- Credentials are granted to a login role by ops, so no password is ever in a
-- migration.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'atelier_auth') THEN
    CREATE ROLE atelier_auth NOLOGIN;
  END IF;
END
$$;

-- ── sessions ────────────────────────────────────────────────────────────────
-- FR-AUTH-3 requires server-side revocation, which is the reason sessions are a
-- TABLE and not a self-contained signed token. A JWT cannot be revoked before
-- it expires without a server-side list of revocations — at which point you
-- have this table and a worse cookie.
CREATE TABLE sessions (
  id            uuid        PRIMARY KEY,
  user_id       uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  -- The value in the cookie. Unique so a token is a token, and NOT the same
  -- thing as the primary key: leaking an id must not leak a credential.
  token         text        NOT NULL,
  expires_at    timestamptz NOT NULL,
  -- Recorded for FR-AUTH-9 ("list and revoke active sessions") — a user cannot
  -- meaningfully decide which session to revoke without knowing what it is.
  ip_address    text,
  user_agent    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  -- Explicit revocation, distinct from expiry. Set means "revoked at", and the
  -- session is dead from that instant regardless of expires_at.
  revoked_at    timestamptz
);

CREATE UNIQUE INDEX uq_sessions_token ON sessions (token);
CREATE INDEX idx_sessions_user_id ON sessions (user_id);
-- Partial: the sweeper only ever wants live rows, and this keeps the index
-- small as dead sessions accumulate.
CREATE INDEX idx_sessions_expires_at ON sessions (expires_at) WHERE revoked_at IS NULL;

-- ── accounts ────────────────────────────────────────────────────────────────
-- Credentials. One row per (provider, user): the email/password credential is
-- provider = 'credential', OAuth is 'github' or 'google'.
--
-- This table is the reason ADR-010 uses a separate ROLE rather than a policy.
-- `atelier_app` receives no grant on it whatsoever, so the role that serves
-- ordinary requests cannot read a password hash even through a bug — a stronger
-- position than before this milestone, not a weaker one.
CREATE TABLE accounts (
  id                       uuid        PRIMARY KEY,
  user_id                  uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  provider_id              text        NOT NULL,
  -- The user's id AT the provider. For 'credential' it is our own user id.
  account_id               text        NOT NULL,
  -- Argon2id PHC string (FR-AUTH-1), null for OAuth accounts.
  password_hash            text,
  access_token             text,
  refresh_token            text,
  access_token_expires_at  timestamptz,
  refresh_token_expires_at timestamptz,
  scope                    text,
  id_token                 text,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  -- A password hash belongs to exactly one credential row; an OAuth row must
  -- not carry one. Enforced here because "it is null for OAuth" is otherwise a
  -- convention, and conventions rot.
  CONSTRAINT chk_accounts_password_only_for_credential
    CHECK ((provider_id = 'credential') OR (password_hash IS NULL))
);

CREATE UNIQUE INDEX uq_accounts_provider_account ON accounts (provider_id, account_id);
CREATE INDEX idx_accounts_user_id ON accounts (user_id);

-- ── verifications ───────────────────────────────────────────────────────────
-- Email verification (FR-AUTH-4) and password reset (FR-AUTH-5).
--
-- FR-AUTH-5 says single-use, time-limited AND revocable. All three are columns
-- here rather than properties of a signed token, for the same reason sessions
-- are a table: a self-contained token cannot be invalidated early, and "the
-- reset link in the email I received an hour ago still works after I changed my
-- password" is the bug that follows.
CREATE TABLE verifications (
  id          uuid        PRIMARY KEY,
  -- Better Auth's shape: `identifier` is what is being verified (an email, or a
  -- reset request id) and `value` is the token.
  identifier  text        NOT NULL,
  value       text        NOT NULL,
  expires_at  timestamptz NOT NULL,
  -- Single use. Set on redemption; a second attempt finds it non-null.
  consumed_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_verifications_value ON verifications (value);
CREATE INDEX idx_verifications_identifier ON verifications (identifier);
CREATE INDEX idx_verifications_expires_at ON verifications (expires_at) WHERE consumed_at IS NULL;

-- ── Row-level security ──────────────────────────────────────────────────────
-- Enabled and FORCEd on all three, for the same reason 0001 gives: without
-- FORCE the table owner bypasses every policy, and the control looks present
-- while doing nothing.
--
-- These tables are NOT tenant-scoped. A session belongs to a person, not to an
-- organization, and a person may belong to many organizations — scoping a
-- session by tenant would mean a user needs a different session per org, which
-- is not what FR-AUTH-3 describes. RLS here therefore expresses a different
-- rule: only `atelier_auth` may touch them at all.
ALTER TABLE sessions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions      FORCE  ROW LEVEL SECURITY;
ALTER TABLE accounts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts      FORCE  ROW LEVEL SECURITY;
ALTER TABLE verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE verifications FORCE  ROW LEVEL SECURITY;

CREATE POLICY auth_role_only ON sessions      TO atelier_auth USING (true) WITH CHECK (true);
CREATE POLICY auth_role_only ON accounts      TO atelier_auth USING (true) WITH CHECK (true);
CREATE POLICY auth_role_only ON verifications TO atelier_auth USING (true) WITH CHECK (true);

-- The one that makes sign-in possible.
--
-- `users` keeps FORCE RLS and every 0001 policy. This ADDS a role-scoped
-- policy: `atelier_auth` sees identity without a tenant filter. Policies are
-- permissive and OR together, but they are also filtered by role — so this one
-- is invisible to `atelier_app`, whose view is exactly what it was.
CREATE POLICY auth_role_identity_access ON users
  TO atelier_auth
  USING (true)
  WITH CHECK (true);

-- ── Privileges ──────────────────────────────────────────────────────────────
-- The blast radius, stated as grants.
--
-- atelier_auth gets identity. It is granted NOTHING on organizations or
-- memberships, so a leaked auth credential reaches identity data and never
-- customer work. The isolation suite asserts that as its PRIMARY assertion —
-- a test that only proved auth can read `users` would pass just as well if this
-- role were a superuser.
GRANT USAGE ON SCHEMA public TO atelier_auth;
GRANT SELECT, INSERT, UPDATE, DELETE ON users, sessions, accounts, verifications TO atelier_auth;

-- atelier_app gets NOTHING here. Not sessions either.
--
-- The first draft granted it SELECT on `sessions` "so it can identify the
-- caller", which was wrong twice over. Mechanically it did not even work: the
-- grant existed but no policy admitted `atelier_app`, so RLS returned zero rows
-- and the failure looked like a missing session rather than a missing policy.
-- More importantly it was the wrong boundary. Validating a session is
-- authentication's job; the app layer receives an already-validated user id and
-- resolves tenancy from `memberships`, which it owns. Granting it identity
-- access would put half of authentication on the wrong side of ADR-010's line
-- for no capability it actually needs.

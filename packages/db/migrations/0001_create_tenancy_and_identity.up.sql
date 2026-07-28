-- 0001_create_tenancy_and_identity (up)
--
-- The tenancy and identity core from §15, with row-level security active from
-- the first migration. ADR-003 and the M004 note both say the same thing: this
-- cannot be retrofitted. A table that ships without RLS is a table someone has
-- to remember to fix later, and the failure mode is silent cross-tenant reads.
--
-- Three tables, three different policy shapes, because they are not uniformly
-- tenant-scoped:
--   organizations  the tenant itself      → scoped by its own id
--   memberships    the join RLS reads     → scoped by organization_id
--   users          GLOBAL identity        → a person may belong to many orgs,
--                                           so they are visible only through a
--                                           membership you can already see

-- ── Privilege holder ────────────────────────────────────────────────────────
-- NOLOGIN on purpose: this is a group role that owns privileges, not an account.
-- Credentials are granted to a login role by ops (and by the test harness), so
-- no password ever appears in a migration.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'atelier_app') THEN
    CREATE ROLE atelier_app NOLOGIN;
  END IF;
END
$$;

-- ── Session claim ───────────────────────────────────────────────────────────
-- The second argument to current_setting is `missing_ok`. With it, an unset
-- claim yields NULL rather than raising — and NULL compares false against every
-- organization_id, so a query that forgot to set the claim returns zero rows
-- instead of erroring. Fail-closed: the accident is an empty result, never a
-- cross-tenant one.
CREATE OR REPLACE FUNCTION app_current_organization_id() RETURNS uuid
  LANGUAGE sql
  STABLE
  -- Empty search_path: this function is referenced by every RLS policy, so a
  -- caller must not be able to shadow anything it resolves.
  SET search_path = ''
AS $$
  SELECT nullif(current_setting('app.current_organization_id', true), '')::uuid
$$;

-- ── organizations ───────────────────────────────────────────────────────────
CREATE TABLE organizations (
  id          uuid        PRIMARY KEY,
  slug        text        NOT NULL,
  name        text        NOT NULL,
  settings    jsonb       NOT NULL DEFAULT '{}'::jsonb,
  plan        text        NOT NULL DEFAULT 'free',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz,
  CONSTRAINT chk_organizations_slug_format
    CHECK (slug ~ '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$'),
  CONSTRAINT chk_organizations_plan
    CHECK (plan IN ('free', 'team', 'enterprise'))
);

-- Partial, because soft delete must not hold a slug hostage forever.
CREATE UNIQUE INDEX uq_organizations_slug
  ON organizations (slug)
  WHERE deleted_at IS NULL;

-- ── users ───────────────────────────────────────────────────────────────────
CREATE TABLE users (
  id                 uuid        PRIMARY KEY,
  email              text        NOT NULL,
  name               text,
  avatar_url         text,
  email_verified_at  timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  deleted_at         timestamptz,
  CONSTRAINT chk_users_email_shape CHECK (position('@' IN email) > 1)
);

-- lower(email) rather than citext: one fewer extension, and it makes the
-- case-insensitivity explicit at every call site that has to match it.
CREATE UNIQUE INDEX uq_users_email
  ON users (lower(email))
  WHERE deleted_at IS NULL;

-- ── memberships ─────────────────────────────────────────────────────────────
CREATE TABLE memberships (
  id               uuid        PRIMARY KEY,
  organization_id  uuid        NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  user_id          uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role             text        NOT NULL DEFAULT 'member',
  invited_by       uuid        REFERENCES users (id) ON DELETE SET NULL,
  accepted_at      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  deleted_at       timestamptz,
  -- text + CHECK rather than a native enum. §15 permits either; the deciding
  -- factor is that this set will churn (billing_admin, auditor, and whatever
  -- the policy engine needs), and adding a value to a CHECK is an ordinary
  -- migration while ALTER TYPE ... ADD VALUE cannot run inside a transaction.
  CONSTRAINT chk_memberships_role
    CHECK (role IN ('owner', 'admin', 'member', 'viewer'))
);

CREATE UNIQUE INDEX uq_memberships_organization_user
  ON memberships (organization_id, user_id)
  WHERE deleted_at IS NULL;

-- organization_id leads every composite index (§15) — it is the highest-
-- selectivity column in a multi-tenant system and the one RLS filters on.
CREATE INDEX idx_memberships_organization_id_user_id
  ON memberships (organization_id, user_id);
CREATE INDEX idx_memberships_user_id ON memberships (user_id);
CREATE INDEX idx_memberships_invited_by ON memberships (invited_by);

-- ── Row-level security ──────────────────────────────────────────────────────
-- FORCE is the part that matters. Without it the table OWNER bypasses every
-- policy below, and the application connects as the owner often enough that
-- the control would look present and do nothing (ADR-003).
--
-- Note the one exemption FORCE cannot close: a superuser always bypasses RLS.
-- That is why the application role is not a superuser, and why the isolation
-- tests connect as an ordinary role — testing as a superuser would pass no
-- matter how wrong the policies were.

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations FORCE ROW LEVEL SECURITY;
ALTER TABLE users         ENABLE ROW LEVEL SECURITY;
ALTER TABLE users         FORCE ROW LEVEL SECURITY;
ALTER TABLE memberships   ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships   FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON organizations
  USING (id = app_current_organization_id())
  WITH CHECK (id = app_current_organization_id());

CREATE POLICY tenant_isolation ON memberships
  USING (organization_id = app_current_organization_id())
  WITH CHECK (organization_id = app_current_organization_id());

-- users is split by command because identity is global while visibility is not.
--
-- SELECT/UPDATE/DELETE: you may see a person only if they share an organization
-- with you. The EXISTS reads memberships, which carries its own policy, so the
-- subquery is already narrowed to the current organization — the two policies
-- compose rather than fight.
CREATE POLICY users_visible_through_membership ON users
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.user_id = users.id
        AND m.organization_id = app_current_organization_id()
        AND m.deleted_at IS NULL
    )
  );

CREATE POLICY users_modifiable_through_membership ON users
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.user_id = users.id
        AND m.organization_id = app_current_organization_id()
        AND m.deleted_at IS NULL
    )
  );

-- INSERT is deliberately open: a person exists before they belong anywhere, so
-- signup necessarily creates the row before any membership can reference it.
-- The unique index on lower(email) is what stops this being abusable, and
-- nothing tenant-scoped is exposed by inserting an identity.
CREATE POLICY users_self_registration ON users
  FOR INSERT
  WITH CHECK (true);

-- ── Privileges ──────────────────────────────────────────────────────────────
-- No DDL, no TRUNCATE (which RLS does not filter), no ownership.
GRANT USAGE ON SCHEMA public TO atelier_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON organizations, users, memberships TO atelier_app;
GRANT EXECUTE ON FUNCTION app_current_organization_id() TO atelier_app;

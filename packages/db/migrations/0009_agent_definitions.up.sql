-- 0009_agent_definitions (up)
--
-- Agents as versioned data (§13, M024).
--
-- Two properties this table exists to hold:
--
--   1. IMMUTABILITY ONCE REFERENCED. A run pins the agent version it started
--      with, so editing a role must not retroactively change what already
--      happened — otherwise a completed run's audit trail describes an agent
--      that no longer exists, and "why did it do that" becomes unanswerable.
--
--   2. TENANT SCOPE, without exception. The six built-in roles are authored as
--      files on disk and MATERIALISED here per organization on first use, rather
--      than stored once with a null organization_id. That was the first design
--      and it was wrong: a globally-readable row means `organization_id IS NULL`
--      appears in the USING clause, which makes rows visible with no tenant
--      claim set at all — the one thing ADR-003's model promises never happens,
--      and the property cross-tenant.integration.test.ts checks for every table.
--      A per-tenant row also records something truer: not "the platform defines
--      an architect" but "this organization ran exactly this spec".
--
-- Immutability is a trigger rather than a convention, because "we agreed not to
-- edit published versions" holds until the first hotfix at 2am.

CREATE TABLE agent_definitions (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid        NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  agent_id         text        NOT NULL,
  version          integer     NOT NULL,
  -- Who authored it. 'platform' rows are materialised from our own corpus;
  -- 'organization' rows come from a customer's own file (FR-ORG-6). Kept
  -- distinct so a tenant cannot later claim authorship of a built-in role, and
  -- so an upgrade can refresh platform rows without touching customer ones.
  origin           text        NOT NULL,
  -- The whole §13 spec, validated by Zod at load. Stored as one document because
  -- it is authored as one file and read as one object; normalising it into eight
  -- tables would buy nothing and cost every read a join.
  spec             jsonb       NOT NULL,
  -- Set the first time a run references this version. From then on the row is
  -- frozen.
  published_at     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_agent_definitions_version_positive CHECK (version >= 1),
  CONSTRAINT chk_agent_definitions_origin CHECK (origin IN ('platform', 'organization'))
);

CREATE UNIQUE INDEX uq_agent_definitions_identity
  ON agent_definitions (organization_id, agent_id, version);

-- "The newest version of this role, for this tenant" — the loader's hot path.
CREATE INDEX idx_agent_definitions_latest
  ON agent_definitions (organization_id, agent_id, version DESC);

/**
 * Freeze a published version.
 *
 * Published means "a run has referenced it". After that the spec is history: a
 * new version is the only way to change a role, which is why `version` is part
 * of the identity rather than a column you bump in place.
 *
 * Publishing itself is allowed exactly once — nothing else is.
 */
CREATE OR REPLACE FUNCTION app_agent_definitions_immutable() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
AS $$
BEGIN
  IF OLD.published_at IS NOT NULL THEN
    IF NEW.spec            IS DISTINCT FROM OLD.spec
       OR NEW.agent_id        IS DISTINCT FROM OLD.agent_id
       OR NEW.version         IS DISTINCT FROM OLD.version
       OR NEW.origin          IS DISTINCT FROM OLD.origin
       OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
       OR NEW.published_at    IS DISTINCT FROM OLD.published_at THEN
      RAISE EXCEPTION
        'agent definition %@% is published and cannot be changed; author a new version',
        OLD.agent_id, OLD.version
        USING ERRCODE = 'restrict_violation';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER trg_agent_definitions_immutable
  BEFORE UPDATE ON agent_definitions
  FOR EACH ROW
  EXECUTE FUNCTION app_agent_definitions_immutable();

/**
 * A published definition cannot be deleted either.
 *
 * Freezing UPDATE alone would leave DELETE-then-INSERT as a way to rewrite
 * history that passes every other check.
 */
CREATE OR REPLACE FUNCTION app_agent_definitions_no_delete() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
AS $$
BEGIN
  IF OLD.published_at IS NOT NULL THEN
    RAISE EXCEPTION
      'agent definition %@% is published and cannot be deleted',
      OLD.agent_id, OLD.version
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN OLD;
END
$$;

CREATE TRIGGER trg_agent_definitions_no_delete
  BEFORE DELETE ON agent_definitions
  FOR EACH ROW
  EXECUTE FUNCTION app_agent_definitions_no_delete();

ALTER TABLE agent_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_definitions FORCE  ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON agent_definitions
  FOR ALL
  TO atelier_app
  USING (organization_id = app_current_organization_id())
  WITH CHECK (organization_id = app_current_organization_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON agent_definitions TO atelier_app;

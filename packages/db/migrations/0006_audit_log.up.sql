-- 0006_audit_log (up)
--
-- §17 Control 8 and FR-AUDIT-1..4. "An action cannot exist without its record."
--
-- Immutability is a GRANT, not a convention. `atelier_app` receives SELECT and
-- INSERT and nothing else, so `UPDATE audit_log SET ...` fails at the database
-- rather than at a code review. FR-AUDIT-4 says "there is no update or delete
-- path"; the only way to make that true is for the path not to exist.
--
-- Range-partitioned by month from the start. Retrofitting partitioning onto a
-- large append-only table means rewriting it, and this is the table that grows
-- fastest and is never pruned by deletion — §17's default retention is a year
-- online, then archive, and detaching a partition is the only cheap way to do
-- that.

CREATE TABLE audit_log (
  id               uuid        NOT NULL DEFAULT gen_random_uuid(),
  organization_id  uuid        NOT NULL,
  -- Who. Null for system actions (a scheduled job, a webhook) — not every
  -- state change has a human behind it, and pretending otherwise would mean
  -- inventing an actor.
  actor_user_id    uuid,
  -- What kind of actor: 'user', 'api_key', 'agent', 'system'. Text rather than
  -- an enum for the reason §15 gives — this set will churn.
  actor_type       text        NOT NULL DEFAULT 'user',
  -- The policy action (`project:delete`) or an event name (`auth.sign_in`).
  action           text        NOT NULL,
  resource_kind    text,
  resource_id      text,
  -- 'allowed' | 'denied' | 'succeeded' | 'failed'. §17 covers denials as well
  -- as successes: "all approvals and denials, all policy denials".
  outcome          text        NOT NULL,
  -- FR-AUDIT-1: request id and IP. The request id is what ties an audit row to
  -- the §16 error envelope a user was shown.
  request_id       text,
  ip_address       text,
  -- FR-AUDIT-2: tool arguments and outcome. Redacted BEFORE it arrives here —
  -- §17 makes a secret in a log a P1, and an audit row is a log that is kept
  -- deliberately and forever.
  metadata         jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at       timestamptz NOT NULL DEFAULT now(),

  -- A partitioned table's primary key must contain the partition key.
  PRIMARY KEY (id, created_at),
  CONSTRAINT chk_audit_log_actor_type
    CHECK (actor_type IN ('user', 'api_key', 'agent', 'system')),
  CONSTRAINT chk_audit_log_outcome
    CHECK (outcome IN ('allowed', 'denied', 'succeeded', 'failed'))
) PARTITION BY RANGE (created_at);

-- organization_id leads, per §15: it is the highest-selectivity column in a
-- multi-tenant system and the one RLS filters on.
CREATE INDEX idx_audit_log_org_created ON audit_log (organization_id, created_at DESC);
CREATE INDEX idx_audit_log_org_actor ON audit_log (organization_id, actor_user_id, created_at DESC);
CREATE INDEX idx_audit_log_org_action ON audit_log (organization_id, action, created_at DESC);

-- ── Partition management ────────────────────────────────────────────────────
-- Automated, per the acceptance criterion. A partitioned table with no
-- partition for `now()` rejects every INSERT — and since the audit write shares
-- the transaction with the action, a missing partition does not lose an audit
-- row, it stops the product working. That is the correct failure direction and
-- a very bad way to find out, so the function is idempotent and the test calls
-- it for a month that already exists.
-- SECURITY DEFINER, because creating a partition is DDL and `atelier_app`
-- deliberately holds none. The alternative — granting the application role
-- CREATE on the schema — would let it create anything at all, to solve a
-- problem that is one table with a name this function derives itself.
--
-- The empty search_path is what makes that safe: every identifier below is
-- schema-qualified, so a caller cannot shadow anything it resolves.
CREATE OR REPLACE FUNCTION app_ensure_audit_partition(p_month date)
  RETURNS text
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$
DECLARE
  v_start date := date_trunc('month', p_month)::date;
  v_end   date := (date_trunc('month', p_month) + interval '1 month')::date;
  v_name  text := 'audit_log_' || to_char(v_start, 'YYYY_MM');
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = v_name) THEN
    EXECUTE format(
      'CREATE TABLE public.%I PARTITION OF public.audit_log FOR VALUES FROM (%L) TO (%L)',
      v_name, v_start, v_end
    );
    -- A new partition inherits the parent's RLS but NOT its grants, so the
    -- application role would lose the ability to write the moment the month
    -- rolled over — an outage on the first of the month, every month.
    EXECUTE format('GRANT SELECT, INSERT ON public.%I TO atelier_app', v_name);
  END IF;
  RETURN v_name;
END
$$;

-- This month and the next two, so a fresh database works immediately and a
-- forgotten scheduler has a grace period rather than an instant outage.
SELECT app_ensure_audit_partition(now()::date);
SELECT app_ensure_audit_partition((now() + interval '1 month')::date);
SELECT app_ensure_audit_partition((now() + interval '2 months')::date);

-- ── Row-level security ──────────────────────────────────────────────────────
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log FORCE  ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON audit_log
  USING (organization_id = app_current_organization_id())
  WITH CHECK (organization_id = app_current_organization_id());

-- ── Privileges ──────────────────────────────────────────────────────────────
-- The immutability guarantee, stated as a grant.
--
-- SELECT and INSERT. No UPDATE, no DELETE, no TRUNCATE — and TRUNCATE matters
-- separately because RLS does not filter it, so a role holding it could empty
-- the table for every tenant at once.
GRANT SELECT, INSERT ON audit_log TO atelier_app;
GRANT EXECUTE ON FUNCTION app_ensure_audit_partition(date) TO atelier_app;

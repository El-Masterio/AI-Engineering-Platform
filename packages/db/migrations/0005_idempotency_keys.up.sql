-- 0005_idempotency_keys (up)
--
-- §16: "Every POST that creates a resource or spends money accepts
-- Idempotency-Key. The key, request hash, and response are stored for 24 hours;
-- a replay returns the original response. Required for run starts and any
-- billing operation — an agent run started twice costs twice."
--
-- In Postgres rather than Redis, though Redis is provisioned (ADR-009).
-- The record has to be written in the SAME transaction as the work it makes
-- idempotent, or there is a window where the work committed and the key did
-- not — and a retry in that window does the work twice, which is the exact
-- thing this table exists to prevent. Redis cannot join that transaction.
--
-- Tenant-scoped, like everything else (FR-ORG-2). A key is chosen by a client
-- and two tenants will eventually choose the same one; without the scope,
-- tenant B's retry would be answered with tenant A's stored response.

CREATE TABLE idempotency_keys (
  id               uuid        PRIMARY KEY,
  organization_id  uuid        NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  -- The client-supplied key.
  key              text        NOT NULL,
  -- Which endpoint it was used against. The same key on a different route is a
  -- different operation, and conflating them would replay the wrong response.
  route            text        NOT NULL,
  -- SHA-256 of the request body. §16 stores it so a key REUSED with different
  -- content can be rejected rather than silently answered with the old result:
  -- that is a client bug, and returning success would hide it.
  request_hash     text        NOT NULL,
  response_status  integer,
  response_body    jsonb,
  -- Set when the work finishes. Null means in flight, which is what makes a
  -- concurrent duplicate detectable rather than merely a later one.
  completed_at     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  -- §16 says 24 hours. Stored rather than computed so the retention window can
  -- change without rewriting what it meant for existing rows.
  expires_at       timestamptz NOT NULL
);

-- The uniqueness that does the actual work: one record per key per route per
-- tenant. The INSERT racing against a concurrent duplicate is what serialises
-- two simultaneous retries, so this index is the lock.
CREATE UNIQUE INDEX uq_idempotency_keys_scope
  ON idempotency_keys (organization_id, route, key);

-- For the sweeper. Partial, because it only ever wants expired rows.
CREATE INDEX idx_idempotency_keys_expires_at ON idempotency_keys (expires_at);

ALTER TABLE idempotency_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE idempotency_keys FORCE  ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON idempotency_keys
  USING (organization_id = app_current_organization_id())
  WITH CHECK (organization_id = app_current_organization_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON idempotency_keys TO atelier_app;

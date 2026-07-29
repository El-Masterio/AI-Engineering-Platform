-- 0007_api_keys (up)
--
-- §16: "Authorization: Bearer atl_... — scoped to an organization, with
-- explicit permission scopes; hashed at rest; prefix-visible for
-- identification."
--
-- The key is shown once, at creation, and never again. What is stored is a
-- SHA-256 of the secret plus a short public prefix, so a stolen database gives
-- an attacker nothing usable and a user can still tell two keys apart in a list.

CREATE TABLE api_keys (
  id               uuid        PRIMARY KEY,
  organization_id  uuid        NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  -- Who created it. Authorization intersects the key's scopes with this user's
  -- role, so a key cannot outlive its creator's permissions.
  created_by       uuid        NOT NULL REFERENCES users (id),
  -- Shown to humans: "atl_7f3a…". Not a secret, and not unique on its own.
  prefix           text        NOT NULL,
  -- SHA-256 of the full secret, hex. See the note in api-keys.ts on why this is
  -- NOT Argon2id.
  key_hash         text        NOT NULL,
  name             text        NOT NULL,
  scopes           text[]      NOT NULL DEFAULT '{}',
  -- Revocation is immediate and permanent; there is no un-revoke.
  revoked_at       timestamptz,
  -- Optional natural expiry, independent of revocation.
  expires_at       timestamptz,
  last_used_at     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- The lookup index. Verification finds a key by its HASH, never by its prefix:
-- a prefix is public and not unique, so looking up by prefix and then comparing
-- would leak which prefixes exist through timing and row counts.
CREATE UNIQUE INDEX uq_api_keys_hash ON api_keys (key_hash);
CREATE INDEX idx_api_keys_organization_id ON api_keys (organization_id, created_at DESC);

ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys FORCE  ROW LEVEL SECURITY;

-- Tenant-scoped for MANAGEMENT — listing, creating and revoking a key all
-- happen inside a known organization.
--
-- Note what this policy does NOT support: verifying an inbound key, which
-- happens before any tenant is known. That path uses the function below rather
-- than a wider policy, so the exception is one auditable statement instead of a
-- permanently looser rule.
CREATE POLICY tenant_isolation ON api_keys
  USING (organization_id = app_current_organization_id())
  WITH CHECK (organization_id = app_current_organization_id());

-- Verification, with no tenant context.
--
-- SECURITY DEFINER and deliberately narrow: it takes a hash and returns the
-- identity that hash belongs to, and nothing else. It cannot list keys, cannot
-- be asked "which keys exist", and returns nothing for a revoked or expired
-- one — so the caller cannot accidentally accept a dead key by forgetting a
-- check the function already made.
CREATE OR REPLACE FUNCTION app_resolve_api_key(p_key_hash text)
  RETURNS TABLE (id uuid, organization_id uuid, created_by uuid, scopes text[])
  LANGUAGE sql
  SECURITY DEFINER
  STABLE
  SET search_path = ''
AS $$
  SELECT k.id, k.organization_id, k.created_by, k.scopes
  FROM public.api_keys k
  WHERE k.key_hash = p_key_hash
    AND k.revoked_at IS NULL
    AND (k.expires_at IS NULL OR k.expires_at > now())
$$;

-- Recording use needs the same exemption: it happens on the verification path,
-- before a tenant claim exists.
CREATE OR REPLACE FUNCTION app_touch_api_key(p_id uuid)
  RETURNS void
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path = ''
AS $$
  UPDATE public.api_keys SET last_used_at = now() WHERE id = p_id
$$;

GRANT SELECT, INSERT, UPDATE ON api_keys TO atelier_app;
GRANT EXECUTE ON FUNCTION app_resolve_api_key(text) TO atelier_app;
GRANT EXECUTE ON FUNCTION app_touch_api_key(uuid) TO atelier_app;

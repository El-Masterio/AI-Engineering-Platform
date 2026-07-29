-- 0005_idempotency_keys (down)

DROP POLICY IF EXISTS tenant_isolation ON idempotency_keys;
DROP TABLE IF EXISTS idempotency_keys;

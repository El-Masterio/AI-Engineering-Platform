-- 0007_api_keys (down)

DROP FUNCTION IF EXISTS app_touch_api_key(uuid);
DROP FUNCTION IF EXISTS app_resolve_api_key(text);
DROP POLICY IF EXISTS tenant_isolation ON api_keys;
DROP TABLE IF EXISTS api_keys;

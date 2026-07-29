-- 0006_audit_log (down)
--
-- DROP TABLE on a partitioned parent takes its partitions with it, so the
-- monthly tables need no separate handling.

DROP POLICY IF EXISTS tenant_isolation ON audit_log;
DROP TABLE IF EXISTS audit_log;
DROP FUNCTION IF EXISTS app_ensure_audit_partition(date);

-- 0001_create_tenancy_and_identity (down)
--
-- Exact inverse of the up migration, in reverse dependency order. §24 principle
-- 5: an untested rollback is a hope, so this file is executed by the migration
-- test on every run rather than being written and trusted.
--
-- The role is deliberately NOT dropped. It is cluster-scoped rather than
-- database-scoped, may own privileges in other databases on the same cluster,
-- and DROP ROLE fails outright if anything anywhere still depends on it.
-- Reversing a schema migration should not reach outside its own database.

DROP POLICY IF EXISTS users_self_registration ON users;
DROP POLICY IF EXISTS users_modifiable_through_membership ON users;
DROP POLICY IF EXISTS users_visible_through_membership ON users;
DROP POLICY IF EXISTS tenant_isolation ON memberships;
DROP POLICY IF EXISTS tenant_isolation ON organizations;

-- memberships first: it holds the foreign keys.
DROP TABLE IF EXISTS memberships;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS organizations;

DROP FUNCTION IF EXISTS app_current_organization_id();

REVOKE USAGE ON SCHEMA public FROM atelier_app;

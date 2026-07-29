-- 0002_create_authentication (down)
--
-- Exact inverse, in reverse dependency order. §24 principle 5: an untested
-- rollback is a hope, so the migration test executes this on every run.
--
-- The role is deliberately NOT dropped, for the reason 0001 gives: roles are
-- cluster-scoped rather than database-scoped, may hold privileges in other
-- databases on the same cluster, and DROP ROLE fails outright if anything
-- anywhere still depends on them. Reversing a schema migration should not reach
-- outside its own database.

-- Revoke before dropping: the grant on `users` outlives this migration's tables
-- and would otherwise be left behind on a table 0001 owns.
REVOKE ALL ON users FROM atelier_auth;
REVOKE ALL ON SCHEMA public FROM atelier_auth;

DROP POLICY IF EXISTS auth_role_identity_access ON users;
DROP POLICY IF EXISTS auth_role_only ON verifications;
DROP POLICY IF EXISTS auth_role_only ON accounts;
DROP POLICY IF EXISTS auth_role_only ON sessions;

-- Tables carry their own grants and indexes; DROP TABLE takes both.
DROP TABLE IF EXISTS verifications;
DROP TABLE IF EXISTS accounts;
DROP TABLE IF EXISTS sessions;

-- 0003_email_verified_flag (down)
--
-- Exact inverse. The constraint goes first (it references the column), then the
-- trigger, then the function, then the column itself.
--
-- `email_verified_at` is untouched: it predates this migration and is the
-- domain's source of truth. A down migration that dropped it would lose data
-- this migration never owned.

ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_users_email_verified_agrees;
DROP TRIGGER IF EXISTS trg_users_sync_email_verified ON users;
DROP FUNCTION IF EXISTS app_sync_email_verified();
ALTER TABLE users DROP COLUMN IF EXISTS email_verified;

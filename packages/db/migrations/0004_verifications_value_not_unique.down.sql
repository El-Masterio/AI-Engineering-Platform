-- 0004_verifications_value_not_unique (down)
--
-- Restores 0002's index exactly. Note this reintroduces the defect: a second
-- password reset for one user will fail. That is what "down" means — the
-- schema as it was, not the schema as it should have been.

DROP INDEX IF EXISTS idx_verifications_value;

CREATE UNIQUE INDEX uq_verifications_value ON verifications (value);

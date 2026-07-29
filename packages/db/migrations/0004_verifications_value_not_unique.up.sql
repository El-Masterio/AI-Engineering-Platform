-- 0004_verifications_value_not_unique (up)
--
-- Corrects an assumption in 0002 about which column holds the token.
--
-- 0002 put a UNIQUE index on `verifications.value`, reasoning that a token is
-- unique. The reasoning was right and the column was wrong: Better Auth stores
-- the token in `identifier` and the SUBJECT in `value`. For a password reset
-- that subject is the user's id, so the second reset request for the same user
-- collides with the first:
--
--   identifier = reset-password:TpRrYa9MQ4UdAR2gn4jkfg3X   <- the token
--   value      = daef58d7-0ab8-4c1c-9b01-2308c0d87057      <- the USER id
--
-- The symptom was a 500 on the second reset, surfacing as "expected 400 to be
-- 200" in a test about single-use tokens — a constraint failure wearing the
-- costume of a logic bug.
--
-- Forward-only (§15): 0002 is already on main, so this corrects it rather than
-- editing history. Uniqueness is not moved onto `identifier` either — the same
-- address can legitimately be sent two verification emails, and a token's
-- unguessability comes from 128 bits of entropy, not from an index.

DROP INDEX IF EXISTS uq_verifications_value;

CREATE INDEX idx_verifications_value ON verifications (value);

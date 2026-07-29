-- 0003_email_verified_flag (up)
--
-- Reconciles two true things that disagree about a column type.
--
-- Better Auth's core schema requires `emailVerified` to be a BOOLEAN. Field
-- names can be remapped and table names customised, but core field types cannot
-- — verified against the library's documentation, not assumed.
--
-- Our `users.email_verified_at` is a `timestamptz`, and deliberately so: §17
-- requires auth events to be auditable, and "verified" answers less than
-- "verified at 14:02 on the 3rd". Losing the timestamp to satisfy a library
-- would be the library dictating the domain.
--
-- So both exist, and a trigger makes it impossible for them to disagree. Two
-- columns holding one fact is only a problem when they can drift; here they
-- cannot, because nothing can write one without the other being corrected in
-- the same statement.
--
-- A GENERATED column would have been tidier and does not work: Better Auth
-- WRITES `emailVerified` when a verification completes, and a generated column
-- is read-only. That is the reason this is a trigger and not a one-liner.

ALTER TABLE users
  ADD COLUMN email_verified boolean NOT NULL DEFAULT false;

-- Backfill before the trigger exists, so existing rows are consistent from the
-- moment the constraint below starts being enforced.
UPDATE users SET email_verified = (email_verified_at IS NOT NULL);

/**
 * Keep the pair coherent regardless of which one the writer touched.
 *
 * Bidirectional on purpose. Better Auth writes the boolean; seeds, admin tools
 * and the domain write the timestamp. A one-way trigger would silently accept
 * the other direction and leave the columns contradicting each other, which is
 * exactly the failure two columns are accused of.
 */
CREATE OR REPLACE FUNCTION app_sync_email_verified() RETURNS trigger
  LANGUAGE plpgsql
  -- Empty search_path: this runs on every write to `users`, so a caller must
  -- not be able to shadow anything it resolves (same reasoning as 0001).
  SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- On insert, whichever column was supplied wins; if both were, the
    -- timestamp is authoritative because it carries strictly more information.
    IF NEW.email_verified_at IS NOT NULL THEN
      NEW.email_verified := true;
    ELSIF NEW.email_verified THEN
      NEW.email_verified_at := now();
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE. Compare against OLD so an unrelated update does not restamp a
  -- verification that already happened.
  IF NEW.email_verified_at IS DISTINCT FROM OLD.email_verified_at THEN
    NEW.email_verified := (NEW.email_verified_at IS NOT NULL);
  ELSIF NEW.email_verified IS DISTINCT FROM OLD.email_verified THEN
    IF NEW.email_verified THEN
      -- Only stamp if there is nothing there. Re-verifying must not move the
      -- original timestamp — the audit trail wants the FIRST verification.
      NEW.email_verified_at := COALESCE(NEW.email_verified_at, now());
    ELSE
      NEW.email_verified_at := NULL;
    END IF;
  END IF;

  RETURN NEW;
END
$$;

CREATE TRIGGER trg_users_sync_email_verified
  BEFORE INSERT OR UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION app_sync_email_verified();

-- The trigger keeps them aligned; this proves it stayed that way. A CHECK is
-- cheap and turns "the trigger is correct" from a claim into an invariant the
-- database refuses to break, including against a future migration that forgets
-- this one exists.
ALTER TABLE users
  ADD CONSTRAINT chk_users_email_verified_agrees
  CHECK (email_verified = (email_verified_at IS NOT NULL));

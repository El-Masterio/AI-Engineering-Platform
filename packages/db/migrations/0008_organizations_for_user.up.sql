-- 0008_organizations_for_user (up)
--
-- The org switcher needs "which organizations does this user belong to?", and
-- that question spans tenants: it covers every organization they are a member
-- of, so no single value of `app.current_organization_id` can authorise it.
--
-- M015 deliberately did not answer it, and recorded why. This is the narrowest
-- answer available:
--
--   * no new session claim
--   * no change to any existing policy
--   * no new role
--   * three columns, for one user, and nothing else
--
-- The alternative considered was a second claim (`app.current_user_id`) plus a
-- widened `memberships` policy. That is more general and permanently loosens a
-- policy M004 made deliberately tight — every query against `memberships` would
-- gain a second way to match, forever, for one screen's benefit.
--
-- Precedent: `app_resolve_api_key` (0007) and `app_ensure_audit_partition`
-- (0006) cross the same boundary the same way.

CREATE OR REPLACE FUNCTION app_organizations_for_user(p_user_id uuid)
  RETURNS TABLE (id uuid, slug text, name text, role text)
  LANGUAGE sql
  SECURITY DEFINER
  STABLE
  -- Empty search_path: a caller must not be able to shadow anything resolved
  -- inside a function that runs with owner privileges.
  SET search_path = ''
AS $$
  SELECT o.id, o.slug, o.name, m.role
  FROM public.organizations o
  JOIN public.memberships m ON m.organization_id = o.id
  WHERE m.user_id = p_user_id
    AND m.deleted_at IS NULL
    AND m.accepted_at IS NOT NULL
    AND o.deleted_at IS NULL
  ORDER BY o.name
$$;

-- Note what it CANNOT do: list members, read settings, or answer "which
-- organizations exist". It takes one user id and returns that user's own
-- memberships, which is information they already have.
GRANT EXECUTE ON FUNCTION app_organizations_for_user(uuid) TO atelier_app;

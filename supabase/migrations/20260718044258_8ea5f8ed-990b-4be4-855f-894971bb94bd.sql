
-- Remove permissive select we added; keep only self + staff.
DROP POLICY IF EXISTS "profiles: read basic to authenticated" ON public.profiles;

-- Recreate view WITHOUT security_invoker so it can expose only safe columns even though base table is locked
DROP VIEW IF EXISTS public.profiles_public;
CREATE VIEW public.profiles_public AS
SELECT
  p.id,
  p.first_name,
  p.last_name,
  p.avatar_url,
  p.cargo_id,
  public.is_staff(p.id) AS is_staff
FROM public.profiles p;

GRANT SELECT ON public.profiles_public TO authenticated;

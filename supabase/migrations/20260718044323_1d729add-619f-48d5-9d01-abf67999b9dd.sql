
DROP VIEW IF EXISTS public.profiles_public;

CREATE OR REPLACE FUNCTION public.get_profiles_basic(_ids uuid[])
RETURNS TABLE(id uuid, first_name text, last_name text, avatar_url text, cargo_id uuid, is_staff boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p.id, p.first_name, p.last_name, p.avatar_url, p.cargo_id, public.is_staff(p.id)
  FROM public.profiles p WHERE p.id = ANY(_ids);
$$;

REVOKE ALL ON FUNCTION public.get_profiles_basic(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_profiles_basic(uuid[]) TO authenticated;

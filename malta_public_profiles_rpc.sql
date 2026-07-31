-- Ajuste apos a blindagem de PII em public.profiles (leitura restrita a dono/admin).
-- Expoe apenas campos NAO sensiveis (sem e-mail, telefone, CPF, PIX, endereco)
-- para que chat, rede social e perfil publico continuem funcionando para membros.

DROP FUNCTION IF EXISTS public.get_profiles_basic(uuid[]);

CREATE OR REPLACE FUNCTION public.get_profiles_basic(_ids uuid[])
RETURNS TABLE (
  id uuid, first_name text, last_name text, avatar_url text,
  cargo_id uuid, is_staff boolean, discord_username text, created_at timestamptz
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.first_name, p.last_name,
    COALESCE(p.avatar_url, u.raw_user_meta_data->>'avatar_url', u.raw_user_meta_data->>'picture'),
    p.cargo_id, public.is_staff(p.id), p.discord_username, p.created_at
  FROM public.profiles p
  LEFT JOIN auth.users u ON u.id = p.id
  WHERE p.id = ANY(_ids)
$$;
REVOKE ALL ON FUNCTION public.get_profiles_basic(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_profiles_basic(uuid[]) TO authenticated;

-- Diretorio publico (sugestoes da rede social): somente membros aprovados.
DROP FUNCTION IF EXISTS public.list_public_profiles(integer);

CREATE OR REPLACE FUNCTION public.list_public_profiles(_limit integer DEFAULT 24)
RETURNS TABLE (
  id uuid, first_name text, last_name text, avatar_url text,
  cargo_id uuid, is_staff boolean, discord_username text, created_at timestamptz
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.first_name, p.last_name,
    COALESCE(p.avatar_url, u.raw_user_meta_data->>'avatar_url', u.raw_user_meta_data->>'picture'),
    p.cargo_id, public.is_staff(p.id), p.discord_username, p.created_at
  FROM public.profiles p
  LEFT JOIN auth.users u ON u.id = p.id
  WHERE COALESCE(p.status, '') = 'approved'
  ORDER BY p.created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(_limit, 24), 100))
$$;
REVOKE ALL ON FUNCTION public.list_public_profiles(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_public_profiles(integer) TO authenticated;

NOTIFY pgrst, 'reload schema';

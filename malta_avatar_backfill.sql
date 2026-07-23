-- ============================================================
-- MALTA — Avatar do Discord/OAuth: trigger + backfill + RPC
-- Rode no SQL Editor.
-- ============================================================

-- 1) handle_new_user: agora copia avatar_url do OAuth (discord/google)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (
    id, email, first_name, last_name,
    discord_id, discord_username, avatar_url,
    phone, city, state, status, form_status
  )
  VALUES (
    NEW.id, NEW.email,
    NEW.raw_user_meta_data->>'first_name',
    NEW.raw_user_meta_data->>'last_name',
    NEW.raw_user_meta_data->>'discord_id',
    NEW.raw_user_meta_data->>'discord_username',
    COALESCE(
      NEW.raw_user_meta_data->>'avatar_url',
      NEW.raw_user_meta_data->>'picture'
    ),
    NEW.raw_user_meta_data->>'phone',
    NEW.raw_user_meta_data->>'city',
    NEW.raw_user_meta_data->>'state',
    'pending', 'not_submitted'
  )
  ON CONFLICT (id) DO UPDATE
    SET avatar_url = COALESCE(public.profiles.avatar_url, EXCLUDED.avatar_url);

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'member')
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END; $$;

-- 2) Backfill: preenche avatar_url onde estiver vazio
UPDATE public.profiles p
SET avatar_url = COALESCE(
  u.raw_user_meta_data->>'avatar_url',
  u.raw_user_meta_data->>'picture'
)
FROM auth.users u
WHERE u.id = p.id
  AND p.avatar_url IS NULL
  AND (
    u.raw_user_meta_data ? 'avatar_url'
    OR u.raw_user_meta_data ? 'picture'
  );

-- 3) RPC get_profiles_basic com fallback pra avatar do OAuth
CREATE OR REPLACE FUNCTION public.get_profiles_basic(_ids uuid[])
RETURNS TABLE (
  id uuid,
  first_name text,
  last_name text,
  avatar_url text,
  cargo_id uuid,
  is_staff boolean
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    p.id,
    p.first_name,
    p.last_name,
    COALESCE(
      p.avatar_url,
      u.raw_user_meta_data->>'avatar_url',
      u.raw_user_meta_data->>'picture'
    ) AS avatar_url,
    p.cargo_id,
    public.is_staff(p.id) AS is_staff
  FROM public.profiles p
  LEFT JOIN auth.users u ON u.id = p.id
  WHERE p.id = ANY(_ids)
$$;
GRANT EXECUTE ON FUNCTION public.get_profiles_basic(uuid[]) TO authenticated;
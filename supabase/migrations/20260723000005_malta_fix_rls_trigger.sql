-- ============================================================
-- MALTA – FIX RLS + TRIGGER handle_new_user (idempotente)
-- Rode no SQL Editor do Supabase.
-- Resolve: chat sem foto/nome, perfil trava carregando,
-- novos signups sem row em profiles.
-- ============================================================

-- 1) TRIGGER handle_new_user — cria row em profiles + role member
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, first_name, last_name, discord_id, discord_username, phone, city, state, status, form_status)
  VALUES (
    NEW.id, NEW.email,
    NEW.raw_user_meta_data->>'first_name',
    NEW.raw_user_meta_data->>'last_name',
    NEW.raw_user_meta_data->>'discord_id',
    NEW.raw_user_meta_data->>'discord_username',
    NEW.raw_user_meta_data->>'phone',
    NEW.raw_user_meta_data->>'city',
    NEW.raw_user_meta_data->>'state',
    'pending', 'not_submitted'
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'member')
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 2) BACKFILL — cria profile/role pra qualquer auth.user que não tem
INSERT INTO public.profiles (id, email, status, form_status)
SELECT u.id, u.email, 'pending', 'not_submitted'
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
 WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'member'
  FROM auth.users u
  LEFT JOIN public.user_roles r ON r.user_id = u.id
 WHERE r.user_id IS NULL
ON CONFLICT (user_id, role) DO NOTHING;

-- 3) RLS POLICIES — profiles
DROP POLICY IF EXISTS "profiles: authenticated can read all"   ON public.profiles;
DROP POLICY IF EXISTS "profiles: user can update own"           ON public.profiles;
DROP POLICY IF EXISTS "profiles: staff can update any"          ON public.profiles;
DROP POLICY IF EXISTS "profiles: user can insert self"          ON public.profiles;

-- leitura: todo mundo autenticado vê perfis básicos (necessário pro chat e busca)
CREATE POLICY "profiles: authenticated can read all"
  ON public.profiles FOR SELECT
  TO authenticated USING (true);

-- update: o próprio dono pode editar
CREATE POLICY "profiles: user can update own"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- staff (owner/admin) pode atualizar qualquer perfil
CREATE POLICY "profiles: staff can update any"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin'));

-- insert: cada usuário só cria a própria row (trigger é SECURITY DEFINER, ignora RLS)
CREATE POLICY "profiles: user can insert self"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());

-- 4) RLS POLICIES — user_roles
DROP POLICY IF EXISTS "user_roles: authenticated can read all" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles: owner can manage"           ON public.user_roles;

-- leitura autenticada (necessária pro badge de "Admin"/"Staff" no chat)
CREATE POLICY "user_roles: authenticated can read all"
  ON public.user_roles FOR SELECT
  TO authenticated USING (true);

-- só owner gerencia roles
CREATE POLICY "user_roles: owner can manage"
  ON public.user_roles FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'owner'))
  WITH CHECK (public.has_role(auth.uid(), 'owner'));

-- 5) cargos: leitura pública autenticada
DROP POLICY IF EXISTS "cargos: read authenticated" ON public.cargos;
CREATE POLICY "cargos: read authenticated" ON public.cargos
  FOR SELECT TO authenticated USING (true);

-- 6) is_staff helper (usada por outras funções/policies)
DROP FUNCTION IF EXISTS public.is_staff(uuid) CASCADE;
CREATE OR REPLACE FUNCTION public.is_staff(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_uid, 'owner') OR public.has_role(_uid, 'admin')
$$;
GRANT EXECUTE ON FUNCTION public.is_staff(uuid) TO authenticated;

-- 7) RPC get_profiles_basic (o chat tenta usar antes de fallback)
CREATE OR REPLACE FUNCTION public.get_profiles_basic(_ids uuid[])
RETURNS TABLE (
  id uuid,
  first_name text,
  last_name text,
  avatar_url text,
  cargo_id uuid,
  is_staff boolean
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.first_name, p.last_name, p.avatar_url, p.cargo_id,
         public.is_staff(p.id)
    FROM public.profiles p
   WHERE p.id = ANY(_ids)
$$;
GRANT EXECUTE ON FUNCTION public.get_profiles_basic(uuid[]) TO authenticated;
-- SCRIPT PARA EXECUTAR NO SEU SQL EDITOR DO SUPABASE
-- Este script cria a estrutura necessária para o Malta Manager

-- 1. Enums
CREATE TYPE public.app_role AS ENUM ('owner', 'admin', 'member');
CREATE TYPE public.approval_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE public.form_status AS ENUM ('not_submitted', 'submitted', 'approved', 'rejected');
CREATE TYPE public.payment_status AS ENUM ('pending', 'submitted', 'approved', 'overdue');
CREATE TYPE public.announcement_audience AS ENUM ('all', 'members', 'staff');
CREATE TYPE public.chat_thread_kind AS ENUM ('general', 'direct');
CREATE TYPE public.transfer_status AS ENUM ('none','pending','confirmed','rejected');

-- 2. Cargos
CREATE TABLE public.cargos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  color TEXT NOT NULL DEFAULT '#f97316',
  weekly_amount NUMERIC(10,2),
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.cargos TO authenticated;
GRANT ALL ON public.cargos TO service_role;
ALTER TABLE public.cargos ENABLE ROW LEVEL SECURITY;

INSERT INTO public.cargos (name, slug, description, color, sort_order) VALUES
  ('Auxiliar', 'auxiliar', 'Cargo inicial (REC - aguardando avaliação)', '#94a3b8', 1),
  ('ADM',      'adm',      'Administrador operacional', '#f97316', 2),
  ('SUP',      'sup',      'Supervisor', '#eab308', 3),
  ('SS',       'ss',       'Suporte Sênior', '#22c55e', 4);

-- 3. Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name TEXT,
  last_name TEXT,
  email TEXT NOT NULL,
  discord_id TEXT UNIQUE,
  discord_username TEXT,
  phone TEXT,
  city TEXT,
  state TEXT,
  avatar_url TEXT,
  status public.approval_status NOT NULL DEFAULT 'pending',
  form_status public.form_status NOT NULL DEFAULT 'not_submitted',
  cargo_id UUID REFERENCES public.cargos(id) ON DELETE SET NULL,
  billing_anchor_date DATE,
  recruited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  pix_key TEXT,
  pix_key_type TEXT,
  pix_beneficiary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 4. User Roles
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 5. Função has_role
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- 6. Outras tabelas e triggers seriam extensos, mas este é o coração.
-- Rode este primeiro para garantir que o básico funcione.

-- =========================================================
-- RESET COMPLETO
-- =========================================================
DROP TABLE IF EXISTS public.audit_logs CASCADE;
DROP TABLE IF EXISTS public.notifications CASCADE;
DROP TABLE IF EXISTS public.chat_messages CASCADE;
DROP TABLE IF EXISTS public.chat_channels CASCADE;
DROP TABLE IF EXISTS public.chat_threads CASCADE;
DROP TABLE IF EXISTS public.announcements CASCADE;
DROP TABLE IF EXISTS public.payment_proofs CASCADE;
DROP TABLE IF EXISTS public.payments CASCADE;
DROP TABLE IF EXISTS public.recruitment_documents CASCADE;
DROP TABLE IF EXISTS public.recruitment_forms CASCADE;
DROP TABLE IF EXISTS public.form_documents CASCADE;
DROP TABLE IF EXISTS public.forms CASCADE;
DROP TABLE IF EXISTS public.cargos CASCADE;
DROP TABLE IF EXISTS public.site_settings CASCADE;
DROP TABLE IF EXISTS public.settings CASCADE;
DROP TABLE IF EXISTS public.audit_log CASCADE;
DROP TABLE IF EXISTS public.user_roles CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;

DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role) CASCADE;
DROP FUNCTION IF EXISTS public.is_staff(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.is_owner(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS public.update_updated_at_column() CASCADE;
DROP FUNCTION IF EXISTS public.ensure_current_payment(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.generate_weekly_payments_all() CASCADE;
DROP FUNCTION IF EXISTS public.assign_rec_cargo(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.on_form_submit_assign_rec() CASCADE;
DROP FUNCTION IF EXISTS public.set_billing_anchor_on_approval() CASCADE;
DROP FUNCTION IF EXISTS public.get_profiles_basic(uuid[]) CASCADE;

DROP TYPE IF EXISTS public.profile_status CASCADE;
DROP TYPE IF EXISTS public.form_status CASCADE;
DROP TYPE IF EXISTS public.payment_status CASCADE;
DROP TYPE IF EXISTS public.approval_status CASCADE;
DROP TYPE IF EXISTS public.app_role CASCADE;
DROP TYPE IF EXISTS public.announcement_audience CASCADE;
DROP TYPE IF EXISTS public.chat_thread_kind CASCADE;
DROP TYPE IF EXISTS public.transfer_status CASCADE;

-- =========================================================
-- ENUMS
-- =========================================================
CREATE TYPE public.app_role AS ENUM ('owner', 'admin', 'member');
CREATE TYPE public.approval_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE public.form_status AS ENUM ('not_submitted', 'submitted', 'approved', 'rejected');
CREATE TYPE public.payment_status AS ENUM ('pending', 'submitted', 'approved', 'overdue');
CREATE TYPE public.announcement_audience AS ENUM ('all', 'members', 'staff');
CREATE TYPE public.chat_thread_kind AS ENUM ('general', 'direct');
CREATE TYPE public.transfer_status AS ENUM ('none','pending','confirmed','rejected');

-- =========================================================
-- FUNÇÃO BASE
-- =========================================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- =========================================================
-- CARGOS (criado antes de profiles para referência)
-- =========================================================
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

-- =========================================================
-- PROFILES
-- =========================================================
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
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- USER_ROLES
-- =========================================================
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

-- =========================================================
-- HELPERS DE ROLE
-- =========================================================
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.is_staff(_user_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('owner','admin'))
$$;

CREATE OR REPLACE FUNCTION public.is_owner(_user_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'owner')
$$;

-- Cargos policies (após has_role/is_staff existirem)
CREATE POLICY "cargos_read_authenticated" ON public.cargos FOR SELECT TO authenticated USING (true);
CREATE POLICY "cargos_staff_write" ON public.cargos FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE TRIGGER trg_cargos_updated BEFORE UPDATE ON public.cargos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- POLICIES: PROFILES
-- =========================================================
CREATE POLICY "profiles: self read" ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "profiles: staff read all" ON public.profiles
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "profiles: self update (no status)" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND status = (SELECT status FROM public.profiles WHERE id = auth.uid())
    AND form_status = (SELECT form_status FROM public.profiles WHERE id = auth.uid())
  );
CREATE POLICY "profiles: staff update any" ON public.profiles
  FOR UPDATE TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "profiles: staff delete" ON public.profiles
  FOR DELETE TO authenticated USING (public.is_staff(auth.uid()));

-- =========================================================
-- POLICIES: USER_ROLES
-- =========================================================
CREATE POLICY "roles: self read" ON public.user_roles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "roles: staff read all" ON public.user_roles
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "roles: owner manages roles ins" ON public.user_roles
  FOR INSERT TO authenticated WITH CHECK (public.is_owner(auth.uid()));
CREATE POLICY "roles: owner manages roles upd" ON public.user_roles
  FOR UPDATE TO authenticated USING (public.is_owner(auth.uid()));
CREATE POLICY "roles: owner manages roles del" ON public.user_roles
  FOR DELETE TO authenticated USING (public.is_owner(auth.uid()));

-- =========================================================
-- SITE_SETTINGS
-- =========================================================
CREATE TABLE public.site_settings (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  org_name TEXT NOT NULL DEFAULT 'Organização Malta',
  pix_key TEXT,
  pix_key_type TEXT,
  pix_beneficiary TEXT,
  weekly_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  payment_due_day INT NOT NULL DEFAULT 7 CHECK (payment_due_day BETWEEN 1 AND 28),
  discord_webhook_url TEXT,
  form_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.site_settings TO authenticated;
GRANT ALL ON public.site_settings TO service_role;
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_site_settings_updated_at BEFORE UPDATE ON public.site_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE POLICY "settings: any auth read" ON public.site_settings
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "settings: owner update" ON public.site_settings
  FOR UPDATE TO authenticated USING (public.is_owner(auth.uid()));

INSERT INTO public.site_settings (id, form_config) VALUES (1, jsonb_build_object(
  'title', '📝 Formulário de Documentos — MALTA',
  'subtitle', 'Preencha os dados e anexe todos os documentos solicitados.',
  'warning', 'O preenchimento incorreto, informações falsas ou qualquer tentativa de golpe resultarão em medidas externas, incluindo boletim de ocorrência, além de desclassificação imediata. ATENÇÃO: NÃO REEMBOLSAMOS.',
  'fields', jsonb_build_object(
    'cargo_desejado_id', jsonb_build_object('label','Cargo pretendido','required',true,'hidden',false),
    'full_name',         jsonb_build_object('label','Nome completo','required',true,'hidden',false),
    'birth_date',        jsonb_build_object('label','Data de nascimento','required',true,'hidden',false),
    'cpf',               jsonb_build_object('label','CPF','required',true,'hidden',false),
    'bank_name',         jsonb_build_object('label','Banco utilizado','required',true,'hidden',false),
    'bank_holder',       jsonb_build_object('label','Nome do titular do banco','required',true,'hidden',false),
    'discord_contact',   jsonb_build_object('label','Discord (usuário)','required',false,'hidden',false),
    'discord_avatar_url',jsonb_build_object('label','URL da foto de perfil do Discord','required',false,'hidden',false),
    'phone_self',        jsonb_build_object('label','Seu número','required',true,'hidden',false),
    'phone_father',      jsonb_build_object('label','Número do pai','required',false,'hidden',false),
    'phone_mother',      jsonb_build_object('label','Número da mãe','required',false,'hidden',false),
    'availability',      jsonb_build_object('label','Disponibilidade (dias/horários)','required',false,'hidden',false),
    'experience',        jsonb_build_object('label','Experiência anterior','required',false,'hidden',false),
    'motivation',        jsonb_build_object('label','Motivação para entrar','required',false,'hidden',false),
    'referred_by',       jsonb_build_object('label','Indicado por (opcional)','required',false,'hidden',false),
    'location',          jsonb_build_object('label','Localização em tempo real','required',true,'hidden',false)
  ),
  'docs', jsonb_build_array(
    jsonb_build_object('key','rg_front','label','Foto do RG (frente)','accept','image/*','required',true,'hint',''),
    jsonb_build_object('key','rg_back','label','Foto do RG (verso)','accept','image/*','required',true,'hint',''),
    jsonb_build_object('key','selfie_rg','label','Selfie segurando o RG','accept','image/*','required',true,'hint',''),
    jsonb_build_object('key','discord_avatar','label','Foto do perfil do Discord','accept','image/*','required',true,'hint',''),
    jsonb_build_object('key','video','label','Vídeo obrigatório de compromisso','accept','video/*','required',true,'hint','Leia o texto abaixo antes de gravar.'),
    jsonb_build_object('key','proof_residence','label','Comprovante de residência','accept','image/*,application/pdf','required',true,'hint','Fatura de energia, água ou similar dos últimos 3 meses.'),
    jsonb_build_object('key','other','label','Outros documentos (opcional)','accept','*','required',false,'hint','')
  ),
  'customQuestions', '[]'::jsonb
));

-- =========================================================
-- RECRUITMENT_FORMS
-- =========================================================
CREATE TABLE public.recruitment_forms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  cargo_desejado_id UUID REFERENCES public.cargos(id) ON DELETE SET NULL,
  full_name TEXT,
  birth_date DATE,
  cpf TEXT,
  bank_name TEXT,
  bank_holder TEXT,
  discord_avatar_url TEXT,
  discord_contact TEXT,
  phone_self TEXT,
  phone_father TEXT,
  phone_mother TEXT,
  location_lat NUMERIC(10,7),
  location_lng NUMERIC(10,7),
  location_captured_at TIMESTAMPTZ,
  age INT,
  motivation TEXT,
  experience TEXT,
  availability TEXT,
  referred_by TEXT,
  extra JSONB NOT NULL DEFAULT '{}'::jsonb,
  custom_answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  status public.form_status NOT NULL DEFAULT 'not_submitted',
  submitted_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES auth.users(id),
  review_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recruitment_forms TO authenticated;
GRANT ALL ON public.recruitment_forms TO service_role;
ALTER TABLE public.recruitment_forms ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_recruitment_forms_updated_at BEFORE UPDATE ON public.recruitment_forms
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE POLICY "forms: self read" ON public.recruitment_forms
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "forms: staff read all" ON public.recruitment_forms
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "forms: self insert" ON public.recruitment_forms
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "forms: self update while editable" ON public.recruitment_forms
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id AND status IN ('not_submitted','submitted','rejected'))
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "forms: staff update any" ON public.recruitment_forms
  FOR UPDATE TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "forms: staff delete" ON public.recruitment_forms
  FOR DELETE TO authenticated USING (public.is_staff(auth.uid()));

-- =========================================================
-- RECRUITMENT_DOCUMENTS
-- =========================================================
CREATE TABLE public.recruitment_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  form_id UUID REFERENCES public.recruitment_forms(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT,
  size_bytes BIGINT,
  kind TEXT NOT NULL DEFAULT 'other',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.recruitment_documents TO authenticated;
GRANT ALL ON public.recruitment_documents TO service_role;
ALTER TABLE public.recruitment_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "docs: self read" ON public.recruitment_documents
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "docs: staff read all" ON public.recruitment_documents
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "docs: self insert" ON public.recruitment_documents
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "docs: self delete" ON public.recruitment_documents
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "docs: staff delete" ON public.recruitment_documents
  FOR DELETE TO authenticated USING (public.is_staff(auth.uid()));

-- =========================================================
-- PAYMENTS
-- =========================================================
CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  due_date DATE NOT NULL,
  amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  status public.payment_status NOT NULL DEFAULT 'pending',
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,
  notes TEXT,
  recruiter_admin_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  transfer_status public.transfer_status NOT NULL DEFAULT 'none',
  transfer_confirmed_at TIMESTAMPTZ,
  transfer_confirmed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  transfer_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, week_start)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE POLICY "payments: self read" ON public.payments
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "payments: staff read all" ON public.payments
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "payments: staff insert" ON public.payments
  FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "payments: staff update" ON public.payments
  FOR UPDATE TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "payments: staff delete" ON public.payments
  FOR DELETE TO authenticated USING (public.is_staff(auth.uid()));

-- =========================================================
-- PAYMENT_PROOFS
-- =========================================================
CREATE TABLE public.payment_proofs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  notes TEXT,
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.payment_proofs TO authenticated;
GRANT ALL ON public.payment_proofs TO service_role;
ALTER TABLE public.payment_proofs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "proofs: self read" ON public.payment_proofs
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "proofs: staff read all" ON public.payment_proofs
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "proofs: self insert" ON public.payment_proofs
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "proofs: staff delete" ON public.payment_proofs
  FOR DELETE TO authenticated USING (public.is_staff(auth.uid()));

-- =========================================================
-- ANNOUNCEMENTS
-- =========================================================
CREATE TABLE public.announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  audience public.announcement_audience NOT NULL DEFAULT 'all',
  pinned BOOLEAN NOT NULL DEFAULT false,
  author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.announcements TO authenticated;
GRANT ALL ON public.announcements TO service_role;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_announcements_updated_at BEFORE UPDATE ON public.announcements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE POLICY "ann: authenticated read (by audience)" ON public.announcements
  FOR SELECT TO authenticated USING (
    audience = 'all' OR audience = 'members' OR (audience = 'staff' AND public.is_staff(auth.uid()))
  );
CREATE POLICY "ann: staff insert" ON public.announcements
  FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "ann: staff update" ON public.announcements
  FOR UPDATE TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "ann: staff delete" ON public.announcements
  FOR DELETE TO authenticated USING (public.is_staff(auth.uid()));

-- =========================================================
-- NOTIFICATIONS
-- =========================================================
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notif: self read" ON public.notifications
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "notif: self update (mark read)" ON public.notifications
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "notif: staff insert (system)" ON public.notifications
  FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));

-- =========================================================
-- CHAT
-- =========================================================
CREATE TABLE public.chat_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind public.chat_thread_kind NOT NULL,
  title TEXT,
  member_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX chat_threads_general_uniq
  ON public.chat_threads (kind) WHERE kind = 'general';
CREATE UNIQUE INDEX chat_threads_direct_member_uniq
  ON public.chat_threads (member_id) WHERE kind = 'direct';
GRANT SELECT, INSERT ON public.chat_threads TO authenticated;
GRANT ALL ON public.chat_threads TO service_role;
ALTER TABLE public.chat_threads ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_chat_threads_updated_at BEFORE UPDATE ON public.chat_threads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE POLICY "threads: general readable" ON public.chat_threads
  FOR SELECT TO authenticated USING (kind = 'general');
CREATE POLICY "threads: direct self read" ON public.chat_threads
  FOR SELECT TO authenticated USING (kind = 'direct' AND member_id = auth.uid());
CREATE POLICY "threads: staff read all" ON public.chat_threads
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "threads: self direct insert" ON public.chat_threads
  FOR INSERT TO authenticated WITH CHECK (
    (kind = 'direct' AND member_id = auth.uid())
    OR (kind = 'general' AND public.is_staff(auth.uid()))
  );

INSERT INTO public.chat_threads (kind, title) VALUES ('general', 'Malta — Geral');

CREATE TABLE public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES public.chat_threads(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX chat_messages_thread_idx ON public.chat_messages (thread_id, created_at);
GRANT SELECT, INSERT ON public.chat_messages TO authenticated;
GRANT ALL ON public.chat_messages TO service_role;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "msg: readable if thread visible" ON public.chat_messages
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.chat_threads t WHERE t.id = thread_id AND (
      t.kind = 'general' OR (t.kind = 'direct' AND (t.member_id = auth.uid() OR public.is_staff(auth.uid())))
    ))
  );
CREATE POLICY "msg: send if thread writable" ON public.chat_messages
  FOR INSERT TO authenticated WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.chat_threads t WHERE t.id = thread_id AND (
      t.kind = 'general' OR (t.kind = 'direct' AND (t.member_id = auth.uid() OR public.is_staff(auth.uid())))
    ))
  );

-- =========================================================
-- AUDIT_LOG
-- =========================================================
CREATE TABLE public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity TEXT,
  entity_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit: owner read" ON public.audit_log
  FOR SELECT TO authenticated USING (public.is_owner(auth.uid()));
CREATE POLICY "audit: staff insert" ON public.audit_log
  FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()) AND actor_id = auth.uid());

-- =========================================================
-- Trigger: novo usuário
-- =========================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  is_the_owner BOOLEAN := lower(NEW.email) = 'cry498434@gmail.com';
  rec_id uuid;
BEGIN
  SELECT id INTO rec_id FROM public.cargos WHERE slug = 'auxiliar' LIMIT 1;

  INSERT INTO public.profiles (
    id, email, first_name, last_name, discord_id, discord_username,
    phone, city, state, status, cargo_id
  ) VALUES (
    NEW.id, NEW.email,
    NEW.raw_user_meta_data->>'first_name',
    NEW.raw_user_meta_data->>'last_name',
    NEW.raw_user_meta_data->>'discord_id',
    NEW.raw_user_meta_data->>'discord_username',
    NEW.raw_user_meta_data->>'phone',
    NEW.raw_user_meta_data->>'city',
    NEW.raw_user_meta_data->>'state',
    CASE WHEN is_the_owner THEN 'approved'::public.approval_status ELSE 'pending'::public.approval_status END,
    CASE WHEN is_the_owner THEN NULL ELSE rec_id END
  );

  IF is_the_owner THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'owner') ON CONFLICT DO NOTHING;
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin') ON CONFLICT DO NOTHING;
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'member') ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Backfill do Dono
DO $$
DECLARE owner_uid UUID;
BEGIN
  SELECT id INTO owner_uid FROM auth.users WHERE lower(email) = 'cry498434@gmail.com' LIMIT 1;
  IF owner_uid IS NOT NULL THEN
    INSERT INTO public.profiles (id, email, status)
    VALUES (owner_uid, (SELECT email FROM auth.users WHERE id = owner_uid), 'approved')
    ON CONFLICT (id) DO UPDATE SET status = 'approved';
    INSERT INTO public.user_roles (user_id, role) VALUES (owner_uid, 'owner') ON CONFLICT DO NOTHING;
    INSERT INTO public.user_roles (user_id, role) VALUES (owner_uid, 'admin') ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- Assign REC cargo helper + trigger no formulário
CREATE OR REPLACE FUNCTION public.assign_rec_cargo(_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE rec_id uuid;
BEGIN
  SELECT id INTO rec_id FROM public.cargos WHERE slug = 'auxiliar' LIMIT 1;
  IF rec_id IS NOT NULL THEN
    UPDATE public.profiles SET cargo_id = rec_id WHERE id = _user_id AND cargo_id IS NULL;
  END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.on_form_submit_assign_rec()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'submitted' AND (OLD.status IS DISTINCT FROM 'submitted') THEN
    PERFORM public.assign_rec_cargo(NEW.user_id);
    UPDATE public.profiles SET form_status = 'submitted' WHERE id = NEW.user_id;
  ELSIF NEW.status = 'approved' AND (OLD.status IS DISTINCT FROM 'approved') THEN
    UPDATE public.profiles SET form_status = 'approved' WHERE id = NEW.user_id;
  ELSIF NEW.status = 'rejected' AND (OLD.status IS DISTINCT FROM 'rejected') THEN
    UPDATE public.profiles SET form_status = 'rejected' WHERE id = NEW.user_id;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_form_submit_assign_rec
  AFTER INSERT OR UPDATE OF status ON public.recruitment_forms
  FOR EACH ROW EXECUTE FUNCTION public.on_form_submit_assign_rec();

-- Billing anchor + ensure_current_payment + weekly generator
CREATE OR REPLACE FUNCTION public.set_billing_anchor_on_approval()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.form_status = 'approved' AND (OLD.form_status IS DISTINCT FROM 'approved') AND NEW.billing_anchor_date IS NULL THEN
    NEW.billing_anchor_date := CURRENT_DATE;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_set_billing_anchor
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_billing_anchor_on_approval();

CREATE OR REPLACE FUNCTION public.ensure_current_payment(_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s public.site_settings%ROWTYPE;
  fstatus public.form_status;
  anchor DATE;
  rec_admin uuid;
  days_since INT;
  k INT;
  wk_start DATE;
  wk_end DATE;
  due DATE;
  due_offset INT;
BEGIN
  SELECT * INTO s FROM public.site_settings WHERE id = 1;
  SELECT form_status, billing_anchor_date, recruited_by
    INTO fstatus, anchor, rec_admin
    FROM public.profiles WHERE id = _user_id;

  IF fstatus IS DISTINCT FROM 'approved' THEN RETURN; END IF;
  IF anchor IS NULL THEN
    anchor := CURRENT_DATE;
    UPDATE public.profiles SET billing_anchor_date = anchor WHERE id = _user_id;
  END IF;

  days_since := (CURRENT_DATE - anchor);
  IF days_since < 0 THEN RETURN; END IF;

  k := days_since / 7;
  wk_start := anchor + (k * 7);
  wk_end   := wk_start + 6;
  due_offset := GREATEST(1, LEAST(COALESCE(s.payment_due_day, 5), 7)) - 1;
  due := wk_start + due_offset;

  INSERT INTO public.payments (user_id, week_start, week_end, due_date, amount, status, recruiter_admin_id)
  VALUES (_user_id, wk_start, wk_end, due, s.weekly_amount, 'pending', rec_admin)
  ON CONFLICT (user_id, week_start) DO UPDATE
    SET recruiter_admin_id = COALESCE(public.payments.recruiter_admin_id, EXCLUDED.recruiter_admin_id);

  UPDATE public.payments SET status = 'overdue'
    WHERE user_id = _user_id AND status = 'pending' AND due_date < CURRENT_DATE;
END; $$;

CREATE OR REPLACE FUNCTION public.generate_weekly_payments_all()
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r RECORD; n INT := 0;
BEGIN
  IF NOT (public.is_staff(auth.uid())) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  FOR r IN SELECT id FROM public.profiles WHERE form_status = 'approved' LOOP
    PERFORM public.ensure_current_payment(r.id);
    n := n + 1;
  END LOOP;
  RETURN n;
END; $$;

CREATE OR REPLACE FUNCTION public.get_profiles_basic(_ids uuid[])
RETURNS TABLE(id uuid, first_name text, last_name text, avatar_url text, cargo_id uuid, is_staff boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p.id, p.first_name, p.last_name, p.avatar_url, p.cargo_id, public.is_staff(p.id)
  FROM public.profiles p WHERE p.id = ANY(_ids);
$$;

REVOKE EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_staff(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_owner(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_profiles_basic(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_current_payment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_weekly_payments_all() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_profiles_basic(uuid[]) TO authenticated;

-- =========================================================
-- REALTIME
-- =========================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- =========================================================
-- Storage policies (buckets já existem: avatars, documents, payment-proofs)
-- =========================================================
DO $$
DECLARE p RECORD;
BEGIN
  FOR p IN
    SELECT policyname FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects'
      AND policyname LIKE ANY (ARRAY['Avatar:%','avatars:%','documents:%','proofs:%'])
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', p.policyname);
  END LOOP;
END $$;

CREATE POLICY "avatars: self read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id='avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "avatars: staff read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id='avatars' AND public.is_staff(auth.uid()));
CREATE POLICY "avatars: self insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id='avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "avatars: self update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id='avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "avatars: self delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id='avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "avatars: staff manage" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id='avatars' AND public.is_staff(auth.uid()))
  WITH CHECK (bucket_id='avatars' AND public.is_staff(auth.uid()));

CREATE POLICY "documents: self read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id='documents' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "documents: staff read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id='documents' AND public.is_staff(auth.uid()));
CREATE POLICY "documents: self insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id='documents' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "documents: self delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id='documents' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "documents: staff manage" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id='documents' AND public.is_staff(auth.uid()))
  WITH CHECK (bucket_id='documents' AND public.is_staff(auth.uid()));

CREATE POLICY "proofs: self read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id='payment-proofs' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "proofs: staff read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id='payment-proofs' AND public.is_staff(auth.uid()));
CREATE POLICY "proofs: self insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id='payment-proofs' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "proofs: staff manage" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id='payment-proofs' AND public.is_staff(auth.uid()))
  WITH CHECK (bucket_id='payment-proofs' AND public.is_staff(auth.uid()));
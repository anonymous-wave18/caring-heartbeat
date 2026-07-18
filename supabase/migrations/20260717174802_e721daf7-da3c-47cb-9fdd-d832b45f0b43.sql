
-- =========================================================
-- RESET COMPLETO (drop das tabelas anteriores)
-- =========================================================
DROP TABLE IF EXISTS public.audit_logs CASCADE;
DROP TABLE IF EXISTS public.notifications CASCADE;
DROP TABLE IF EXISTS public.chat_messages CASCADE;
DROP TABLE IF EXISTS public.chat_channels CASCADE;
DROP TABLE IF EXISTS public.announcements CASCADE;
DROP TABLE IF EXISTS public.payment_proofs CASCADE;
DROP TABLE IF EXISTS public.payments CASCADE;
DROP TABLE IF EXISTS public.form_documents CASCADE;
DROP TABLE IF EXISTS public.forms CASCADE;
DROP TABLE IF EXISTS public.settings CASCADE;
DROP TABLE IF EXISTS public.user_roles CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;

DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role) CASCADE;
DROP FUNCTION IF EXISTS public.is_staff(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.is_owner(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS public.update_updated_at_column() CASCADE;
DROP FUNCTION IF EXISTS public.ensure_current_payment(uuid) CASCADE;

DROP TYPE IF EXISTS public.profile_status CASCADE;
DROP TYPE IF EXISTS public.form_status CASCADE;
DROP TYPE IF EXISTS public.payment_status CASCADE;
DROP TYPE IF EXISTS public.approval_status CASCADE;
DROP TYPE IF EXISTS public.app_role CASCADE;
DROP TYPE IF EXISTS public.announcement_audience CASCADE;
DROP TYPE IF EXISTS public.chat_thread_kind CASCADE;

-- =========================================================
-- ENUMS
-- =========================================================
CREATE TYPE public.app_role AS ENUM ('owner', 'admin', 'member');
CREATE TYPE public.approval_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE public.form_status AS ENUM ('not_submitted', 'submitted', 'approved', 'rejected');
CREATE TYPE public.payment_status AS ENUM ('pending', 'submitted', 'approved', 'overdue');
CREATE TYPE public.announcement_audience AS ENUM ('all', 'members', 'staff');
CREATE TYPE public.chat_thread_kind AS ENUM ('general', 'direct');

-- =========================================================
-- FUNÇÕES BASE
-- =========================================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

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
-- HELPERS DE ROLE (security definer)
-- =========================================================
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.is_staff(_user_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('owner','admin')
  )
$$;

CREATE OR REPLACE FUNCTION public.is_owner(_user_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'owner'
  )
$$;

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
-- SITE_SETTINGS (linha única id=1)
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
INSERT INTO public.site_settings (id) VALUES (1) ON CONFLICT DO NOTHING;

-- =========================================================
-- RECRUITMENT_FORMS
-- =========================================================
CREATE TABLE public.recruitment_forms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  age INT,
  motivation TEXT,
  experience TEXT,
  availability TEXT,
  discord_contact TEXT,
  referred_by TEXT,
  extra JSONB NOT NULL DEFAULT '{}'::jsonb,
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

-- Função lazy para garantir pagamento da semana atual do membro aprovado.
CREATE OR REPLACE FUNCTION public.ensure_current_payment(_user_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s public.site_settings%ROWTYPE;
  wk_start DATE;
  wk_end DATE;
  due DATE;
  fstatus public.form_status;
BEGIN
  SELECT * INTO s FROM public.site_settings WHERE id=1;
  SELECT form_status INTO fstatus FROM public.profiles WHERE id = _user_id;
  IF fstatus IS DISTINCT FROM 'approved' THEN RETURN; END IF;

  wk_start := date_trunc('week', CURRENT_DATE)::date;   -- segunda
  wk_end   := wk_start + 6;
  due      := wk_start + LEAST(s.payment_due_day, 6);

  INSERT INTO public.payments (user_id, week_start, week_end, due_date, amount, status)
  VALUES (_user_id, wk_start, wk_end, due, s.weekly_amount, 'pending')
  ON CONFLICT (user_id, week_start) DO NOTHING;

  -- Marca vencidos
  UPDATE public.payments SET status = 'overdue'
    WHERE user_id = _user_id AND status = 'pending' AND due_date < CURRENT_DATE;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.ensure_current_payment(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_current_payment(UUID) TO authenticated;

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
    audience = 'all'
    OR (audience = 'members')
    OR (audience = 'staff' AND public.is_staff(auth.uid()))
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
  member_id UUID REFERENCES auth.users(id) ON DELETE CASCADE, -- para 'direct': o membro
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

INSERT INTO public.chat_threads (kind, title) VALUES ('general', 'Malta — Geral')
  ON CONFLICT DO NOTHING;

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
    EXISTS (
      SELECT 1 FROM public.chat_threads t
      WHERE t.id = thread_id
        AND (
          t.kind = 'general'
          OR (t.kind = 'direct' AND (t.member_id = auth.uid() OR public.is_staff(auth.uid())))
        )
    )
  );
CREATE POLICY "msg: send if thread writable" ON public.chat_messages
  FOR INSERT TO authenticated WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.chat_threads t
      WHERE t.id = thread_id
        AND (
          t.kind = 'general'
          OR (t.kind = 'direct' AND (t.member_id = auth.uid() OR public.is_staff(auth.uid())))
        )
    )
  );

-- =========================================================
-- AUDIT_LOG (só o Dono lê)
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
-- HANDLE NEW USER — Dono automático + profile + role
-- =========================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  is_the_owner BOOLEAN := lower(NEW.email) = 'cry498434@gmail.com';
BEGIN
  INSERT INTO public.profiles (
    id, email, first_name, last_name, discord_id, discord_username,
    phone, city, state, status
  ) VALUES (
    NEW.id, NEW.email,
    NEW.raw_user_meta_data->>'first_name',
    NEW.raw_user_meta_data->>'last_name',
    NEW.raw_user_meta_data->>'discord_id',
    NEW.raw_user_meta_data->>'discord_username',
    NEW.raw_user_meta_data->>'phone',
    NEW.raw_user_meta_data->>'city',
    NEW.raw_user_meta_data->>'state',
    CASE WHEN is_the_owner THEN 'approved'::public.approval_status ELSE 'pending'::public.approval_status END
  );

  IF is_the_owner THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'owner') ON CONFLICT DO NOTHING;
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin') ON CONFLICT DO NOTHING;
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'member') ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Backfill do Dono, se já existir
DO $$
DECLARE
  owner_uid UUID;
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

-- =========================================================
-- REVOGAÇÃO DE FUNÇÕES INTERNAS
-- =========================================================
REVOKE EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_staff(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_owner(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;

-- =========================================================
-- REALTIME
-- =========================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

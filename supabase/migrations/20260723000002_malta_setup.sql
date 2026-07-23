-- ============================================================
-- MALTA MANAGER - SETUP (adaptado ao seu schema existente)
-- Rode no SQL Editor do Supabase. Idempotente.
-- ============================================================

-- 1) ORGANIZATIONS: adiciona colunas que faltam
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'enterprise',
  ADD COLUMN IF NOT EXISTS owner_email TEXT,
  ADD COLUMN IF NOT EXISTS mrr_cents INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.organizations TO authenticated;
GRANT ALL ON public.organizations TO service_role;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "orgs_owner_all" ON public.organizations;
CREATE POLICY "orgs_owner_all" ON public.organizations
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'owner'))
  WITH CHECK (public.has_role(auth.uid(), 'owner'));

-- 2) PLATFORM SETTINGS (branding + fees globais para o Painel Master)
CREATE TABLE IF NOT EXISTS public.platform_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);
GRANT SELECT ON public.platform_settings TO authenticated;
GRANT ALL ON public.platform_settings TO service_role;
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "settings_read_all" ON public.platform_settings;
CREATE POLICY "settings_read_all" ON public.platform_settings
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "settings_owner_write" ON public.platform_settings;
CREATE POLICY "settings_owner_write" ON public.platform_settings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'owner'))
  WITH CHECK (public.has_role(auth.uid(), 'owner'));

INSERT INTO public.platform_settings (key, value) VALUES
  ('branding', '{"name":"Malta Manager","logo_url":null,"primary_color":"#f97316"}'::jsonb),
  ('billing',  '{"platform_fee_pct":0,"currency":"BRL"}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- 3) FEEDBACK
CREATE TABLE IF NOT EXISTS public.feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category TEXT NOT NULL DEFAULT 'general',
  rating INT CHECK (rating BETWEEN 1 AND 5),
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.feedback TO authenticated;
GRANT ALL ON public.feedback TO service_role;
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "feedback_insert_self" ON public.feedback;
CREATE POLICY "feedback_insert_self" ON public.feedback
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "feedback_read_self_or_staff" ON public.feedback;
CREATE POLICY "feedback_read_self_or_staff" ON public.feedback
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id
         OR public.has_role(auth.uid(),'admin')
         OR public.has_role(auth.uid(),'owner'));

-- 4) SEGUIR USUÁRIOS
CREATE TABLE IF NOT EXISTS public.user_follows (
  follower_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  following_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, following_id),
  CHECK (follower_id <> following_id)
);
GRANT SELECT, INSERT, DELETE ON public.user_follows TO authenticated;
GRANT ALL ON public.user_follows TO service_role;
ALTER TABLE public.user_follows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "follows_read_all" ON public.user_follows;
CREATE POLICY "follows_read_all" ON public.user_follows
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "follows_write_self" ON public.user_follows;
CREATE POLICY "follows_write_self" ON public.user_follows
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = follower_id);

DROP POLICY IF EXISTS "follows_delete_self" ON public.user_follows;
CREATE POLICY "follows_delete_self" ON public.user_follows
  FOR DELETE TO authenticated USING (auth.uid() = follower_id);

-- 5) CHAT: reply/áudio/anexo/deleção + leitura
ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS reply_to_id UUID REFERENCES public.chat_messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS attachment_url TEXT,
  ADD COLUMN IF NOT EXISTS attachment_type TEXT,
  ADD COLUMN IF NOT EXISTS duration_ms INT,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;

-- body pode ser vazio quando é só um anexo
ALTER TABLE public.chat_messages ALTER COLUMN body DROP NOT NULL;
ALTER TABLE public.chat_messages DROP CONSTRAINT IF EXISTS chat_messages_body_check;
ALTER TABLE public.chat_messages
  ADD CONSTRAINT chat_messages_body_check
  CHECK (body IS NULL OR (char_length(body) >= 1 AND char_length(body) <= 4000));

CREATE TABLE IF NOT EXISTS public.chat_message_reads (
  message_id UUID NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  read_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id)
);
GRANT SELECT, INSERT ON public.chat_message_reads TO authenticated;
GRANT ALL ON public.chat_message_reads TO service_role;
ALTER TABLE public.chat_message_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reads_self" ON public.chat_message_reads;
CREATE POLICY "reads_self" ON public.chat_message_reads
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 6) STORAGE BUCKET para anexos do chat
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-attachments', 'chat-attachments', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "chat_attach_read" ON storage.objects;
CREATE POLICY "chat_attach_read" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'chat-attachments');

DROP POLICY IF EXISTS "chat_attach_write" ON storage.objects;
CREATE POLICY "chat_attach_write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'chat-attachments' AND owner = auth.uid());

DROP POLICY IF EXISTS "chat_attach_delete" ON storage.objects;
CREATE POLICY "chat_attach_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'chat-attachments' AND owner = auth.uid());

-- 7) ACHIEVEMENTS: garante grants/RLS e semeia conquistas base
GRANT SELECT ON public.achievements TO authenticated;
GRANT ALL ON public.achievements TO service_role;
ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "achievements_read_all" ON public.achievements;
CREATE POLICY "achievements_read_all" ON public.achievements
  FOR SELECT TO authenticated USING (true);

GRANT SELECT, INSERT ON public.user_achievements TO authenticated;
GRANT ALL ON public.user_achievements TO service_role;
ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_ach_read_all" ON public.user_achievements;
CREATE POLICY "user_ach_read_all" ON public.user_achievements
  FOR SELECT TO authenticated USING (true);

INSERT INTO public.achievements (name, description)
SELECT v.name, v.description FROM (VALUES
  ('Bem-vindo',        'Concluiu o cadastro'),
  ('Primeiro Pagamento','Pagou a primeira semana em dia'),
  ('Veterano',         '4 semanas consecutivas em dia')
) AS v(name, description)
WHERE NOT EXISTS (SELECT 1 FROM public.achievements a WHERE a.name = v.name);

-- 8) PROFILES: colunas usadas pelo app (PIX + recrutador)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS pix_key TEXT,
  ADD COLUMN IF NOT EXISTS pix_key_type TEXT,
  ADD COLUMN IF NOT EXISTS pix_beneficiary TEXT,
  ADD COLUMN IF NOT EXISTS recruited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- 9) PUBLICAÇÕES do perfil (feed social)
CREATE TABLE IF NOT EXISTS public.profile_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profile_posts TO authenticated;
GRANT ALL ON public.profile_posts TO service_role;
ALTER TABLE public.profile_posts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "posts read all" ON public.profile_posts;
CREATE POLICY "posts read all" ON public.profile_posts FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "posts insert own" ON public.profile_posts;
CREATE POLICY "posts insert own" ON public.profile_posts FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "posts delete own" ON public.profile_posts;
CREATE POLICY "posts delete own" ON public.profile_posts FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS profile_posts_user_created_idx ON public.profile_posts (user_id, created_at DESC);

-- ============================================================
-- FIM. Recarregue o site depois de rodar.
-- ============================================================
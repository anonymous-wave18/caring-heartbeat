-- ============================================================
-- MALTA – FIX CHAT RLS + POST LIKES/COMMENTS + NOTIFICAÇÕES
-- Rode no SQL Editor do Supabase. Idempotente.
-- ============================================================

-- ==== 1) CHAT_THREADS: grants + RLS ====
ALTER TABLE public.chat_threads ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.chat_threads TO authenticated;
GRANT ALL ON public.chat_threads TO service_role;

DROP POLICY IF EXISTS "threads_select"      ON public.chat_threads;
DROP POLICY IF EXISTS "threads_insert"      ON public.chat_threads;
DROP POLICY IF EXISTS "threads_update_staff" ON public.chat_threads;

-- SELECT: geral p/ todos; direct só do dono ou staff
CREATE POLICY "threads_select" ON public.chat_threads
  FOR SELECT TO authenticated
  USING (
    kind = 'general'
    OR member_id = auth.uid()
    OR public.is_staff(auth.uid())
  );

-- INSERT: staff cria qualquer; usuário cria a própria DM
CREATE POLICY "threads_insert" ON public.chat_threads
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_staff(auth.uid())
    OR (kind = 'direct' AND member_id = auth.uid())
  );

CREATE POLICY "threads_update_staff" ON public.chat_threads
  FOR UPDATE TO authenticated
  USING (public.is_staff(auth.uid()) OR member_id = auth.uid())
  WITH CHECK (public.is_staff(auth.uid()) OR member_id = auth.uid());

-- ==== 2) CHAT_MESSAGES: grants + RLS ====
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.chat_messages TO authenticated;
GRANT ALL ON public.chat_messages TO service_role;

DROP POLICY IF EXISTS "messages_select" ON public.chat_messages;
DROP POLICY IF EXISTS "messages_insert" ON public.chat_messages;
DROP POLICY IF EXISTS "messages_update" ON public.chat_messages;

-- SELECT: se pode ver o thread, pode ver as mensagens
CREATE POLICY "messages_select" ON public.chat_messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.chat_threads t
      WHERE t.id = chat_messages.thread_id
        AND (t.kind = 'general' OR t.member_id = auth.uid() OR public.is_staff(auth.uid()))
    )
  );

-- INSERT: sender_id = auth.uid() E o usuário pode acessar o thread
CREATE POLICY "messages_insert" ON public.chat_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.chat_threads t
      WHERE t.id = chat_messages.thread_id
        AND (t.kind = 'general' OR t.member_id = auth.uid() OR public.is_staff(auth.uid()))
    )
  );

-- UPDATE (soft-delete/edit): próprio autor ou staff
CREATE POLICY "messages_update" ON public.chat_messages
  FOR UPDATE TO authenticated
  USING (sender_id = auth.uid() OR public.is_staff(auth.uid()))
  WITH CHECK (sender_id = auth.uid() OR public.is_staff(auth.uid()));

-- ==== 3) POST_LIKES ====
CREATE TABLE IF NOT EXISTS public.post_likes (
  post_id UUID NOT NULL REFERENCES public.profile_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);
GRANT SELECT, INSERT, DELETE ON public.post_likes TO authenticated;
GRANT ALL ON public.post_likes TO service_role;
ALTER TABLE public.post_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "likes_read_all" ON public.post_likes;
CREATE POLICY "likes_read_all" ON public.post_likes FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "likes_write_self" ON public.post_likes;
CREATE POLICY "likes_write_self" ON public.post_likes FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "likes_delete_self" ON public.post_likes;
CREATE POLICY "likes_delete_self" ON public.post_likes FOR DELETE TO authenticated USING (user_id = auth.uid());

-- ==== 4) POST_COMMENTS ====
CREATE TABLE IF NOT EXISTS public.post_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.profile_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS post_comments_post_idx ON public.post_comments (post_id, created_at);
GRANT SELECT, INSERT, DELETE ON public.post_comments TO authenticated;
GRANT ALL ON public.post_comments TO service_role;
ALTER TABLE public.post_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "comments_read_all" ON public.post_comments;
CREATE POLICY "comments_read_all" ON public.post_comments FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "comments_write_self" ON public.post_comments;
CREATE POLICY "comments_write_self" ON public.post_comments FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "comments_delete_self_or_owner" ON public.post_comments;
CREATE POLICY "comments_delete_self_or_owner" ON public.post_comments FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profile_posts p WHERE p.id = post_id AND p.user_id = auth.uid())
  );

-- ==== 5) NOTIFICAÇÕES (curtida / comentário) ====
-- Reaproveita public.notifications já existente no projeto.
CREATE OR REPLACE FUNCTION public.notify_post_like()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE owner_id UUID; liker_name TEXT;
BEGIN
  SELECT user_id INTO owner_id FROM public.profile_posts WHERE id = NEW.post_id;
  IF owner_id IS NULL OR owner_id = NEW.user_id THEN RETURN NEW; END IF;
  SELECT COALESCE(NULLIF(TRIM(CONCAT(first_name,' ',last_name)),''),'Alguém')
    INTO liker_name FROM public.profiles WHERE id = NEW.user_id;
  INSERT INTO public.notifications (user_id, type, title, body, link)
  VALUES (owner_id, 'post_like', '❤️ Nova curtida',
          liker_name || ' curtiu sua publicação.',
          '/dashboard/perfil?view_id=' || owner_id::text);
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_notify_post_like ON public.post_likes;
CREATE TRIGGER trg_notify_post_like AFTER INSERT ON public.post_likes
  FOR EACH ROW EXECUTE FUNCTION public.notify_post_like();

CREATE OR REPLACE FUNCTION public.notify_post_comment()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE owner_id UUID; commenter_name TEXT;
BEGIN
  SELECT user_id INTO owner_id FROM public.profile_posts WHERE id = NEW.post_id;
  IF owner_id IS NULL OR owner_id = NEW.user_id THEN RETURN NEW; END IF;
  SELECT COALESCE(NULLIF(TRIM(CONCAT(first_name,' ',last_name)),''),'Alguém')
    INTO commenter_name FROM public.profiles WHERE id = NEW.user_id;
  INSERT INTO public.notifications (user_id, type, title, body, link)
  VALUES (owner_id, 'post_comment', '💬 Novo comentário',
          commenter_name || ' comentou: ' || LEFT(NEW.body, 80),
          '/dashboard/perfil?view_id=' || owner_id::text);
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_notify_post_comment ON public.post_comments;
CREATE TRIGGER trg_notify_post_comment AFTER INSERT ON public.post_comments
  FOR EACH ROW EXECUTE FUNCTION public.notify_post_comment();

-- ============================================================
-- FIM
-- ============================================================

-- ============================================================
-- MALTA — Correção final de avatar manual + DM com staff
-- Rode no SQL Editor do Supabase externo.
-- ============================================================

-- 1) Avatar é parte visual/social do SaaS: todo usuário autenticado pode VER
-- fotos do bucket avatars. Upload/update/delete continua limitado pelas policies
-- existentes de dono da pasta ou staff.
CREATE POLICY "avatars: authenticated read all"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'avatars');

-- 2) Garante permissão de update em chat_threads para renomear threads antigas
-- "Suporte" para o formato dm:<id-do-staff>, usado pela UI para mostrar nome/foto
-- do staff escolhido em vez de "Suporte Malta".
GRANT SELECT, INSERT, UPDATE ON public.chat_threads TO authenticated;

DROP POLICY IF EXISTS "threads_update_staff" ON public.chat_threads;
CREATE POLICY "threads_update_staff"
ON public.chat_threads
FOR UPDATE
TO authenticated
USING (public.is_staff(auth.uid()) OR member_id = auth.uid())
WITH CHECK (public.is_staff(auth.uid()) OR member_id = auth.uid());

-- 3) Se a policy já existir em outro banco/rodada, este bloco evita erro de duplicidade.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'avatars: authenticated read all'
  ) THEN
    CREATE POLICY "avatars: authenticated read all"
    ON storage.objects
    FOR SELECT
    TO authenticated
    USING (bucket_id = 'avatars');
  END IF;
END $$;

-- ============================================================
-- FIM
-- ============================================================
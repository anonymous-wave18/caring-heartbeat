-- =====================================================================
-- MALTA — CORREÇÕES FINAIS (rode 1x no SQL Editor do Supabase)
-- • Announcements: policies de INSERT/UPDATE/DELETE para staff
-- • Documents bucket: policies para staff baixar documentos
-- • Trigger: sincroniza profiles.form_status a partir de recruitment_forms
-- • Backfill: normaliza formulários existentes (Miguel etc.)
-- Idempotente.
-- =====================================================================

-- Helper (garantido)
CREATE OR REPLACE FUNCTION public.is_staff(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_uid, 'owner') OR public.has_role(_uid, 'admin')
$$;
GRANT EXECUTE ON FUNCTION public.is_staff(uuid) TO authenticated;

-- =====================================================================
-- 1) ANNOUNCEMENTS — corrige "new row violates row-level security policy"
-- =====================================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON public.announcements TO authenticated;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ann_select_all"    ON public.announcements;
DROP POLICY IF EXISTS "ann_insert_staff"  ON public.announcements;
DROP POLICY IF EXISTS "ann_update_staff"  ON public.announcements;
DROP POLICY IF EXISTS "ann_delete_staff"  ON public.announcements;

CREATE POLICY "ann_select_all"   ON public.announcements FOR SELECT TO authenticated
  USING (true);
CREATE POLICY "ann_insert_staff" ON public.announcements FOR INSERT TO authenticated
  WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "ann_update_staff" ON public.announcements FOR UPDATE TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "ann_delete_staff" ON public.announcements FOR DELETE TO authenticated
  USING (public.is_staff(auth.uid()));

-- =====================================================================
-- 2) STORAGE BUCKET "documents" — corrige botão "baixar"
-- =====================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "docs_read_self"   ON storage.objects;
DROP POLICY IF EXISTS "docs_read_staff"  ON storage.objects;
DROP POLICY IF EXISTS "docs_write_self"  ON storage.objects;
DROP POLICY IF EXISTS "docs_delete_own"  ON storage.objects;
DROP POLICY IF EXISTS "docs_delete_staff" ON storage.objects;

-- Dono do arquivo (path começa com o UUID dele) OU staff podem LER
CREATE POLICY "docs_read_self" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'documents' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "docs_read_staff" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'documents' AND public.is_staff(auth.uid()));

-- Membro só grava sob a própria pasta
CREATE POLICY "docs_write_self" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'documents' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "docs_delete_own" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'documents' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "docs_delete_staff" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'documents' AND public.is_staff(auth.uid()));

-- =====================================================================
-- 3) TRIGGER — sincroniza profiles.form_status
-- (resolve "Miguel enviou formulário mas admin vê not_submitted")
-- =====================================================================
CREATE OR REPLACE FUNCTION public.sync_profile_form_status()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'submitted' THEN
    UPDATE public.profiles
       SET form_status = 'submitted', updated_at = now()
     WHERE id = NEW.user_id
       AND form_status <> 'approved';
  ELSIF NEW.status = 'approved' THEN
    UPDATE public.profiles
       SET form_status = 'approved', status = 'approved', updated_at = now()
     WHERE id = NEW.user_id;
  ELSIF NEW.status = 'rejected' THEN
    UPDATE public.profiles
       SET form_status = 'rejected', updated_at = now()
     WHERE id = NEW.user_id;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_sync_profile_form_status ON public.recruitment_forms;
CREATE TRIGGER trg_sync_profile_form_status
  AFTER INSERT OR UPDATE OF status ON public.recruitment_forms
  FOR EACH ROW EXECUTE FUNCTION public.sync_profile_form_status();

-- Backfill: qualquer profile cujo form já está 'submitted' mas o profile marca 'not_submitted'
UPDATE public.profiles p
   SET form_status = f.status::public.form_status,
       updated_at  = now()
  FROM public.recruitment_forms f
 WHERE f.user_id = p.id
   AND f.status IN ('submitted','approved','rejected')
   AND p.form_status IS DISTINCT FROM f.status::public.form_status
   AND p.form_status <> 'approved';

-- =====================================================================
-- 4) Recarrega o cache do PostgREST
-- =====================================================================
NOTIFY pgrst, 'reload schema';

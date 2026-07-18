
-- Limpar policies antigas dos buckets (idempotente)
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

-- =========================
-- AVATARS (privado, foto do usuário na pasta {uid}/)
-- =========================
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

-- =========================
-- DOCUMENTS (formulário de recrutamento)
-- =========================
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

-- =========================
-- PAYMENT-PROOFS
-- =========================
CREATE POLICY "proofs: self read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id='payment-proofs' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "proofs: staff read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id='payment-proofs' AND public.is_staff(auth.uid()));
CREATE POLICY "proofs: self insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id='payment-proofs' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "proofs: staff manage" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id='payment-proofs' AND public.is_staff(auth.uid()))
  WITH CHECK (bucket_id='payment-proofs' AND public.is_staff(auth.uid()));

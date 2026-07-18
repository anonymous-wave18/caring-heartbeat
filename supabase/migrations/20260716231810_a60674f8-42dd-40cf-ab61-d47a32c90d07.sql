
-- Storage policies for avatars bucket
CREATE POLICY "Avatar: authenticated can view"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'avatars');

CREATE POLICY "Avatar: user can upload own"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Avatar: user can update own"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Avatar: user can delete own"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Avatar: admins manage all"
ON storage.objects FOR ALL TO authenticated
USING (bucket_id = 'avatars' AND public.has_role(auth.uid(), 'admin'))
WITH CHECK (bucket_id = 'avatars' AND public.has_role(auth.uid(), 'admin'));

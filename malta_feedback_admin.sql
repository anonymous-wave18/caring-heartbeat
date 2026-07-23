-- Permite staff atualizar/deletar feedbacks (marcar resolvido, descartar, apagar).
GRANT UPDATE, DELETE ON public.feedback TO authenticated;

DROP POLICY IF EXISTS "feedback_update_staff" ON public.feedback;
CREATE POLICY "feedback_update_staff" ON public.feedback
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'));

DROP POLICY IF EXISTS "feedback_delete_staff" ON public.feedback;
CREATE POLICY "feedback_delete_staff" ON public.feedback
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'));
-- =====================================================================
-- MALTA — CORREÇÃO: formulários enviados não apareciam em admin.
-- Causa: política forms_update_self com USING (status = 'submitted'),
-- que impedia o upsert do draft (not_submitted -> submitted).
-- =====================================================================

DROP POLICY IF EXISTS "forms_update_self" ON public.recruitment_forms;

-- Membro pode atualizar o próprio formulário enquanto NÃO estiver aprovado.
-- Cobre draft (not_submitted), reenvio após rejeição e transição para submitted.
CREATE POLICY "forms_update_self" ON public.recruitment_forms
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND status <> 'approved')
  WITH CHECK (user_id = auth.uid() AND status <> 'approved');

-- Backfill: qualquer form que ficou "preso" em not_submitted mas cujo profile
-- já marca form_status='submitted' (sinal de tentativa anterior de envio) é
-- realinhado para 'submitted'.
UPDATE public.recruitment_forms f
   SET status = 'submitted',
       submitted_at = COALESCE(f.submitted_at, now())
  FROM public.profiles p
 WHERE p.id = f.user_id
   AND f.status = 'not_submitted'
   AND p.form_status = 'submitted';

-- E o inverso: se o form já está submitted/approved/rejected e o profile
-- ainda marca not_submitted, sincroniza (usa o trigger sync_profile_form_status
-- se ele estiver instalado, mas garantimos por UPDATE direto).
UPDATE public.profiles p
   SET form_status = f.status::public.form_status,
       updated_at  = now()
  FROM public.recruitment_forms f
 WHERE f.user_id = p.id
   AND f.status IN ('submitted','approved','rejected')
   AND p.form_status IS DISTINCT FROM f.status::public.form_status
   AND p.form_status <> 'approved';

NOTIFY pgrst, 'reload schema';

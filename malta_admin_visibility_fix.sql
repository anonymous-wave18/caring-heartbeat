-- ============================================================
-- MALTA — FIX VISIBILIDADE STAFF (pagamentos, formulários,
-- documentos, feedback). Idempotente.
-- Corrige: admin/owner "sem registro" em Pagamentos, Formulários
-- e Documentos, e feedback "resolvido" sumindo da aba resolvido.
-- ============================================================

-- 0) helper (já existe, mas garantido)
CREATE OR REPLACE FUNCTION public.is_staff(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_uid, 'owner') OR public.has_role(_uid, 'admin')
$$;
GRANT EXECUTE ON FUNCTION public.is_staff(uuid) TO authenticated;

-- 1) PAYMENTS — staff enxerga tudo, membro enxerga só o próprio
GRANT SELECT, INSERT, UPDATE ON public.payments TO authenticated;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payments_select_self"  ON public.payments;
DROP POLICY IF EXISTS "payments_select_staff" ON public.payments;
DROP POLICY IF EXISTS "payments_update_staff" ON public.payments;
DROP POLICY IF EXISTS "payments_insert_staff" ON public.payments;

CREATE POLICY "payments_select_self"  ON public.payments FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "payments_select_staff" ON public.payments FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));
CREATE POLICY "payments_update_staff" ON public.payments FOR UPDATE TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "payments_insert_staff" ON public.payments FOR INSERT TO authenticated
  WITH CHECK (public.is_staff(auth.uid()) OR user_id = auth.uid());

-- 2) RECRUITMENT_FORMS — dono da row + staff
GRANT SELECT, INSERT, UPDATE ON public.recruitment_forms TO authenticated;
ALTER TABLE public.recruitment_forms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "forms_select_self"  ON public.recruitment_forms;
DROP POLICY IF EXISTS "forms_select_staff" ON public.recruitment_forms;
DROP POLICY IF EXISTS "forms_update_self"  ON public.recruitment_forms;
DROP POLICY IF EXISTS "forms_update_staff" ON public.recruitment_forms;
DROP POLICY IF EXISTS "forms_insert_self"  ON public.recruitment_forms;

CREATE POLICY "forms_select_self"  ON public.recruitment_forms FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "forms_select_staff" ON public.recruitment_forms FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));
CREATE POLICY "forms_insert_self"  ON public.recruitment_forms FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "forms_update_self"  ON public.recruitment_forms FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND status = 'submitted')
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "forms_update_staff" ON public.recruitment_forms FOR UPDATE TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

-- 3) RECRUITMENT_DOCUMENTS — dono + staff
GRANT SELECT, INSERT, DELETE ON public.recruitment_documents TO authenticated;
ALTER TABLE public.recruitment_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "docs_select_self"  ON public.recruitment_documents;
DROP POLICY IF EXISTS "docs_select_staff" ON public.recruitment_documents;
DROP POLICY IF EXISTS "docs_insert_self"  ON public.recruitment_documents;
DROP POLICY IF EXISTS "docs_delete_staff" ON public.recruitment_documents;

CREATE POLICY "docs_select_self"  ON public.recruitment_documents FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "docs_select_staff" ON public.recruitment_documents FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));
CREATE POLICY "docs_insert_self"  ON public.recruitment_documents FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "docs_delete_staff" ON public.recruitment_documents FOR DELETE TO authenticated
  USING (public.is_staff(auth.uid()));

-- 4) PAYMENT_PROOFS — staff enxerga tudo
GRANT SELECT, INSERT ON public.payment_proofs TO authenticated;
ALTER TABLE public.payment_proofs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "proofs_select_self"  ON public.payment_proofs;
DROP POLICY IF EXISTS "proofs_select_staff" ON public.payment_proofs;
DROP POLICY IF EXISTS "proofs_insert_self"  ON public.payment_proofs;

CREATE POLICY "proofs_select_self"  ON public.payment_proofs FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.payments p WHERE p.id = payment_id AND p.user_id = auth.uid()));
CREATE POLICY "proofs_select_staff" ON public.payment_proofs FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));
CREATE POLICY "proofs_insert_self"  ON public.payment_proofs FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.payments p WHERE p.id = payment_id AND p.user_id = auth.uid()));

-- 5) FEEDBACK — staff enxerga TODOS status (aberto/resolvido/descartado)
GRANT SELECT, UPDATE, DELETE ON public.feedback TO authenticated;
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "feedback_select_self"  ON public.feedback;
DROP POLICY IF EXISTS "feedback_select_staff" ON public.feedback;
DROP POLICY IF EXISTS "feedback_update_staff" ON public.feedback;
DROP POLICY IF EXISTS "feedback_delete_staff" ON public.feedback;

CREATE POLICY "feedback_select_self"  ON public.feedback FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "feedback_select_staff" ON public.feedback FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));
CREATE POLICY "feedback_update_staff" ON public.feedback FOR UPDATE TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "feedback_delete_staff" ON public.feedback FOR DELETE TO authenticated
  USING (public.is_staff(auth.uid()));

-- 6) Gate de status: força profiles NOVOS a ficarem 'pending' até aprovação.
-- (Corrige "usuário novo entrou pelo hambúrguer sem enviar formulário".)
ALTER TABLE public.profiles ALTER COLUMN status SET DEFAULT 'pending';
ALTER TABLE public.profiles ALTER COLUMN form_status SET DEFAULT 'not_submitted';

-- Normaliza usuários que estão como 'approved' sem terem enviado formulário.
UPDATE public.profiles
   SET status = 'pending'
 WHERE form_status <> 'approved'
   AND status = 'approved'
   AND id NOT IN (SELECT user_id FROM public.user_roles WHERE role IN ('admin','owner'));

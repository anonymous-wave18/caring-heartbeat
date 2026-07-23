-- ============================================================
-- MALTA – FIX PAGAMENTOS (idempotente, roda no SQL Editor)
-- Garante colunas, valor semanal, âncora de cobrança,
-- RPCs e gera cobranças da semana atual para todos aprovados.
-- ============================================================

-- 1) transfer_status enum
DO $$ BEGIN
  CREATE TYPE public.transfer_status AS ENUM ('none','pending','confirmed','rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) Colunas em payments e profiles
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS recruiter_admin_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS transfer_status public.transfer_status NOT NULL DEFAULT 'none';

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS billing_anchor_date DATE;

-- 3) Valor semanal padrão (se estiver 0/NULL, coloca R$ 10)
UPDATE public.site_settings
   SET weekly_amount = 10
 WHERE id = 1 AND (weekly_amount IS NULL OR weekly_amount = 0);

-- 4) Backfill: todo aprovado sem âncora recebe âncora = created_at (ou hoje)
UPDATE public.profiles
   SET billing_anchor_date = COALESCE(created_at::date, CURRENT_DATE)
 WHERE form_status = 'approved' AND billing_anchor_date IS NULL;

-- 5) Trigger para setar âncora ao aprovar
CREATE OR REPLACE FUNCTION public.set_billing_anchor_on_approval()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.form_status = 'approved'
     AND (OLD.form_status IS DISTINCT FROM 'approved')
     AND NEW.billing_anchor_date IS NULL THEN
    NEW.billing_anchor_date := CURRENT_DATE;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_set_billing_anchor ON public.profiles;
CREATE TRIGGER trg_set_billing_anchor
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_billing_anchor_on_approval();

-- 6) ensure_current_payment
CREATE OR REPLACE FUNCTION public.ensure_current_payment(_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s public.site_settings%ROWTYPE;
  fstatus public.form_status;
  anchor DATE;
  rec_admin uuid;
  days_since INT;
  k INT;
  wk_start DATE;
  wk_end DATE;
  due DATE;
  due_offset INT;
BEGIN
  SELECT * INTO s FROM public.site_settings WHERE id = 1;
  SELECT form_status, billing_anchor_date, recruited_by
    INTO fstatus, anchor, rec_admin
    FROM public.profiles WHERE id = _user_id;

  IF fstatus IS DISTINCT FROM 'approved' THEN RETURN; END IF;
  IF anchor IS NULL THEN
    anchor := CURRENT_DATE;
    UPDATE public.profiles SET billing_anchor_date = anchor WHERE id = _user_id;
  END IF;

  days_since := (CURRENT_DATE - anchor);
  IF days_since < 0 THEN RETURN; END IF;

  k := days_since / 7;
  wk_start := anchor + (k * 7);
  wk_end   := wk_start + 6;
  due_offset := GREATEST(1, LEAST(COALESCE(s.payment_due_day, 7), 7)) - 1;
  due := wk_start + due_offset;

  INSERT INTO public.payments (user_id, week_start, week_end, due_date, amount, status, recruiter_admin_id)
  VALUES (_user_id, wk_start, wk_end, due, COALESCE(s.weekly_amount, 10), 'pending', rec_admin)
  ON CONFLICT (user_id, week_start) DO UPDATE
    SET recruiter_admin_id = COALESCE(public.payments.recruiter_admin_id, EXCLUDED.recruiter_admin_id);

  UPDATE public.payments SET status = 'overdue'
    WHERE user_id = _user_id AND status = 'pending' AND due_date < CURRENT_DATE;
END; $$;

-- 7) generate_weekly_payments_all
CREATE OR REPLACE FUNCTION public.generate_weekly_payments_all()
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r RECORD; n INT := 0;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden: usuário atual não é staff';
  END IF;
  FOR r IN SELECT id FROM public.profiles WHERE form_status = 'approved' LOOP
    PERFORM public.ensure_current_payment(r.id);
    n := n + 1;
  END LOOP;
  RETURN n;
END; $$;

GRANT EXECUTE ON FUNCTION public.ensure_current_payment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_weekly_payments_all() TO authenticated;

-- 8) Gera imediatamente as cobranças (roda como SECURITY DEFINER via loop direto)
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.profiles WHERE form_status = 'approved' LOOP
    PERFORM public.ensure_current_payment(r.id);
  END LOOP;
END $$;

-- 9) Diagnóstico rápido: veja o que foi criado
SELECT p.user_id, pr.first_name, pr.last_name, p.week_start, p.due_date, p.amount, p.status, p.recruiter_admin_id
  FROM public.payments p
  JOIN public.profiles pr ON pr.id = p.user_id
 ORDER BY p.week_start DESC
 LIMIT 20;

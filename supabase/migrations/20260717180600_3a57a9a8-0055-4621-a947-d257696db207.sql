
-- Anchor date per member: cobrança semanal conta a partir do dia em que o membro foi aprovado
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS billing_anchor_date DATE;

-- Para membros já aprovados, se ainda não tem âncora, usa o created_at
UPDATE public.profiles
SET billing_anchor_date = created_at::date
WHERE form_status = 'approved' AND billing_anchor_date IS NULL;

-- Ao aprovar o formulário, seta a âncora automaticamente (se ainda não tiver)
CREATE OR REPLACE FUNCTION public.set_billing_anchor_on_approval()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.form_status = 'approved' AND (OLD.form_status IS DISTINCT FROM 'approved') AND NEW.billing_anchor_date IS NULL THEN
    NEW.billing_anchor_date := CURRENT_DATE;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_billing_anchor ON public.profiles;
CREATE TRIGGER trg_set_billing_anchor
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_billing_anchor_on_approval();

-- Recalcula ensure_current_payment usando a âncora do membro
CREATE OR REPLACE FUNCTION public.ensure_current_payment(_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s public.site_settings%ROWTYPE;
  fstatus public.form_status;
  anchor DATE;
  days_since INT;
  k INT;
  wk_start DATE;
  wk_end DATE;
  due DATE;
  due_offset INT;
BEGIN
  SELECT * INTO s FROM public.site_settings WHERE id = 1;
  SELECT form_status, billing_anchor_date INTO fstatus, anchor
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
  -- payment_due_day = quantos dias depois do início da semana do membro vence (1..7)
  due_offset := GREATEST(1, LEAST(COALESCE(s.payment_due_day, 5), 7)) - 1;
  due := wk_start + due_offset;

  INSERT INTO public.payments (user_id, week_start, week_end, due_date, amount, status)
  VALUES (_user_id, wk_start, wk_end, due, s.weekly_amount, 'pending')
  ON CONFLICT (user_id, week_start) DO NOTHING;

  -- Marca vencidos os pendentes com due_date passado
  UPDATE public.payments SET status = 'overdue'
    WHERE user_id = _user_id AND status = 'pending' AND due_date < CURRENT_DATE;
END;
$$;

-- Função para gerar cobrança da semana atual para TODOS os membros aprovados (usada pelo admin)
CREATE OR REPLACE FUNCTION public.generate_weekly_payments_all()
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r RECORD; n INT := 0;
BEGIN
  IF NOT (public.is_staff(auth.uid())) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  FOR r IN SELECT id FROM public.profiles WHERE form_status = 'approved' LOOP
    PERFORM public.ensure_current_payment(r.id);
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_weekly_payments_all() TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_current_payment(uuid) TO authenticated;

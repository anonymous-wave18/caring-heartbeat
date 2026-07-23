-- ============================================================
-- MALTA – Ajusta cobrança semanal:
--  1) Primeira semana é paga via Discord (fora do sistema),
--     entt a âncora de cobrança começa 7 dias após a aprovação.
--  2) O valor sempre respeita o weekly_amount do cargo do membro
--     (já implementado em ensure_current_payment; reforçado aqui).
--  3) Recalcula cobranças pendentes/atrasadas já criadas.
-- ============================================================

-- 1) Trigger de aprovação: âncora = data de aprovação + 7 dias
CREATE OR REPLACE FUNCTION public.set_billing_anchor_on_approval()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.form_status = 'approved'
     AND (OLD.form_status IS DISTINCT FROM 'approved') THEN
    -- Primeira semana paga no Discord → conta começa 7 dias depois
    NEW.billing_anchor_date := CURRENT_DATE + 7;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_set_billing_anchor ON public.profiles;
CREATE TRIGGER trg_set_billing_anchor
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_billing_anchor_on_approval();

-- 2) ensure_current_payment (mantém uso do valor do CARGO)
CREATE OR REPLACE FUNCTION public.ensure_current_payment(_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s public.site_settings%ROWTYPE;
  fstatus public.form_status;
  anchor DATE;
  rec_admin uuid;
  user_cargo uuid;
  cargo_amount NUMERIC;
  final_amount NUMERIC;
  days_since INT;
  k INT;
  wk_start DATE;
  wk_end DATE;
  due DATE;
  due_offset INT;
BEGIN
  SELECT * INTO s FROM public.site_settings WHERE id = 1;
  SELECT form_status, billing_anchor_date, recruited_by, cargo_id
    INTO fstatus, anchor, rec_admin, user_cargo
    FROM public.profiles WHERE id = _user_id;

  IF fstatus IS DISTINCT FROM 'approved' THEN RETURN; END IF;
  IF anchor IS NULL THEN
    -- fallback: aprovado sem âncora → primeira cobrança daqui 7 dias
    anchor := CURRENT_DATE + 7;
    UPDATE public.profiles SET billing_anchor_date = anchor WHERE id = _user_id;
  END IF;

  days_since := (CURRENT_DATE - anchor);
  -- Ainda dentro da semana grátis (paga no Discord): não gera cobrança
  IF days_since < 0 THEN RETURN; END IF;

  k := days_since / 7;
  wk_start := anchor + (k * 7);
  wk_end   := wk_start + 6;
  due_offset := GREATEST(1, LEAST(COALESCE(s.payment_due_day, 7), 7)) - 1;
  due := wk_start + due_offset;

  cargo_amount := NULL;
  IF user_cargo IS NOT NULL THEN
    SELECT weekly_amount INTO cargo_amount FROM public.cargos WHERE id = user_cargo;
  END IF;
  final_amount := COALESCE(cargo_amount, s.weekly_amount, 10);

  INSERT INTO public.payments (user_id, week_start, week_end, due_date, amount, status, recruiter_admin_id)
  VALUES (_user_id, wk_start, wk_end, due, final_amount, 'pending', rec_admin)
  ON CONFLICT (user_id, week_start) DO UPDATE
    SET recruiter_admin_id = COALESCE(public.payments.recruiter_admin_id, EXCLUDED.recruiter_admin_id),
        amount = CASE WHEN public.payments.status IN ('pending','overdue')
                      THEN EXCLUDED.amount ELSE public.payments.amount END;

  UPDATE public.payments SET status = 'overdue'
    WHERE user_id = _user_id AND status = 'pending' AND due_date < CURRENT_DATE;
END; $$;

GRANT EXECUTE ON FUNCTION public.ensure_current_payment(uuid) TO authenticated;

-- 3) Recalcula valor das cobranças pendentes/atrasadas usando o cargo atual
UPDATE public.payments p
   SET amount = COALESCE(c.weekly_amount, s.weekly_amount, 10)
  FROM public.profiles pr
  LEFT JOIN public.cargos c ON c.id = pr.cargo_id
  CROSS JOIN (SELECT weekly_amount FROM public.site_settings WHERE id = 1) s
 WHERE p.user_id = pr.id
   AND p.status IN ('pending','overdue')
   AND p.amount IS DISTINCT FROM COALESCE(c.weekly_amount, s.weekly_amount, 10);

-- 4) Remove cobranças "da primeira semana" ainda pendentes (foram pagas no Discord)
--    Critério seguro: cobrança pending cuja week_start <= data de aprovação do perfil
--    (aprovado nos últimos 14 dias). Não mexe em nada aprovado/enviado.
DELETE FROM public.payments p
 USING public.profiles pr
 WHERE p.user_id = pr.id
   AND p.status = 'pending'
   AND pr.billing_anchor_date IS NOT NULL
   AND p.week_start < pr.billing_anchor_date;

NOTIFY pgrst, 'reload schema';

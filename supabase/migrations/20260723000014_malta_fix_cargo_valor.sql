-- ============================================================
-- MALTA – Corrige valor do pagamento semanal por CARGO
-- Faz ensure_current_payment usar cargos.weekly_amount quando
-- definido no cargo do membro, com fallback para site_settings.
-- Também recalcula o valor de cobranças pendentes já criadas.
-- ============================================================

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

  -- Preferir valor do CARGO; fallback para o valor global do site.
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

-- Recalcula cobranças pendentes/atrasadas já existentes usando o valor do cargo atual.
UPDATE public.payments p
   SET amount = COALESCE(c.weekly_amount, s.weekly_amount, 10)
  FROM public.profiles pr
  LEFT JOIN public.cargos c ON c.id = pr.cargo_id
  CROSS JOIN (SELECT weekly_amount FROM public.site_settings WHERE id = 1) s
 WHERE p.user_id = pr.id
   AND p.status IN ('pending','overdue')
   AND p.amount IS DISTINCT FROM COALESCE(c.weekly_amount, s.weekly_amount, 10);

-- Diagnóstico
SELECT pr.first_name, pr.last_name, c.name AS cargo, c.weekly_amount AS valor_cargo,
       p.week_start, p.amount, p.status
  FROM public.payments p
  JOIN public.profiles pr ON pr.id = p.user_id
  LEFT JOIN public.cargos c ON c.id = pr.cargo_id
 WHERE p.status IN ('pending','overdue')
 ORDER BY p.week_start DESC
 LIMIT 20;
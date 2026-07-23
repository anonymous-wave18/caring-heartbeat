-- =========================================================
-- MASTER (SaaS) — Planos: Weekly Revshare (20%) + Monthly Fixed
-- Execute no SQL Editor do Supabase
-- =========================================================

-- 1) Colunas novas em organizations
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS billing_model   text NOT NULL DEFAULT 'weekly_revshare',
  ADD COLUMN IF NOT EXISTS revshare_percent numeric(5,2) NOT NULL DEFAULT 20.00,
  ADD COLUMN IF NOT EXISTS monthly_fee_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notes text;

-- 2) Constraint: billing_model só aceita os 2 valores
DO $$ BEGIN
  ALTER TABLE public.organizations
    ADD CONSTRAINT organizations_billing_model_check
    CHECK (billing_model IN ('weekly_revshare','monthly_fixed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3) Migrar registros antigos (starter/pro/enterprise) para o novo modelo:
--    tudo que não for 'monthly_fixed' vira 'weekly_revshare' com 20%.
UPDATE public.organizations
SET billing_model = 'weekly_revshare',
    revshare_percent = COALESCE(NULLIF(revshare_percent,0), 20.00)
WHERE billing_model NOT IN ('weekly_revshare','monthly_fixed');

-- 4) View de faturamento estimado por organização
CREATE OR REPLACE VIEW public.organizations_billing_view AS
WITH member_counts AS (
  SELECT o.id AS org_id,
         (SELECT COUNT(*) FROM public.profiles p WHERE p.status = 'approved') AS active_members,
         (SELECT COALESCE(SUM(ROUND(amount * 100)::bigint),0)
            FROM public.payments
           WHERE status = 'approved'
             AND created_at >= now() - interval '7 days') AS last_week_revenue_cents
  FROM public.organizations o
)
SELECT o.id, o.name, o.slug, o.billing_model, o.revshare_percent, o.monthly_fee_cents,
       o.owner_email, o.status,
       mc.active_members,
       mc.last_week_revenue_cents,
       CASE
         WHEN o.billing_model = 'weekly_revshare'
           THEN ROUND(mc.last_week_revenue_cents * (o.revshare_percent / 100.0))::bigint
         WHEN o.billing_model = 'monthly_fixed'
           THEN o.monthly_fee_cents::bigint
         ELSE 0
       END AS estimated_charge_cents
FROM public.organizations o
LEFT JOIN member_counts mc ON mc.org_id = o.id;

GRANT SELECT ON public.organizations_billing_view TO authenticated;

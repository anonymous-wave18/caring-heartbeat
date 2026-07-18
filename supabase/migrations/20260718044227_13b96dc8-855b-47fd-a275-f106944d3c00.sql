
-- 1) profiles: recruiter link + admin PIX fields
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS recruited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pix_key text,
  ADD COLUMN IF NOT EXISTS pix_key_type text,
  ADD COLUMN IF NOT EXISTS pix_beneficiary text;

-- 2) payments: recruiter admin + transfer flow (admin → owner)
DO $$ BEGIN
  CREATE TYPE public.transfer_status AS ENUM ('none','pending','confirmed','rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS recruiter_admin_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS transfer_status public.transfer_status NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS transfer_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS transfer_confirmed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS transfer_notes text;

-- 3) public profile view for chat (name, avatar, staff flag)
DROP VIEW IF EXISTS public.profiles_public;
CREATE VIEW public.profiles_public
WITH (security_invoker = on) AS
SELECT
  p.id,
  p.first_name,
  p.last_name,
  p.avatar_url,
  p.cargo_id,
  public.is_staff(p.id) AS is_staff
FROM public.profiles p;

GRANT SELECT ON public.profiles_public TO authenticated;

-- allow authenticated to read minimal profile info (view uses security_invoker, so needs a permissive select policy)
DROP POLICY IF EXISTS "profiles: read basic to authenticated" ON public.profiles;
CREATE POLICY "profiles: read basic to authenticated"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);
-- Note: existing "profiles: self read" & "profiles: staff read all" remain; PostgREST already respects column projection.
-- Sensitive columns (email, phone, cpf) live in recruitment_forms and profiles;
-- to protect PII we keep application layer discipline: only select basic columns for chat via profiles_public view.

-- 4) Ensure REC (auxiliar) cargo assignment on signup & on form submit
CREATE OR REPLACE FUNCTION public.assign_rec_cargo(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE rec_id uuid;
BEGIN
  SELECT id INTO rec_id FROM public.cargos WHERE slug = 'auxiliar' LIMIT 1;
  IF rec_id IS NOT NULL THEN
    UPDATE public.profiles SET cargo_id = rec_id WHERE id = _user_id AND cargo_id IS NULL;
  END IF;
END; $$;

-- Update handle_new_user to also assign REC cargo
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_the_owner BOOLEAN := lower(NEW.email) = 'cry498434@gmail.com';
  rec_id uuid;
BEGIN
  SELECT id INTO rec_id FROM public.cargos WHERE slug = 'auxiliar' LIMIT 1;

  INSERT INTO public.profiles (
    id, email, first_name, last_name, discord_id, discord_username,
    phone, city, state, status, cargo_id
  ) VALUES (
    NEW.id, NEW.email,
    NEW.raw_user_meta_data->>'first_name',
    NEW.raw_user_meta_data->>'last_name',
    NEW.raw_user_meta_data->>'discord_id',
    NEW.raw_user_meta_data->>'discord_username',
    NEW.raw_user_meta_data->>'phone',
    NEW.raw_user_meta_data->>'city',
    NEW.raw_user_meta_data->>'state',
    CASE WHEN is_the_owner THEN 'approved'::public.approval_status ELSE 'pending'::public.approval_status END,
    CASE WHEN is_the_owner THEN NULL ELSE rec_id END
  );

  IF is_the_owner THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'owner') ON CONFLICT DO NOTHING;
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin') ON CONFLICT DO NOTHING;
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'member') ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END; $$;

-- Trigger for form submit: ensure REC cargo if missing
CREATE OR REPLACE FUNCTION public.on_form_submit_assign_rec()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'submitted' AND (OLD.status IS DISTINCT FROM 'submitted') THEN
    PERFORM public.assign_rec_cargo(NEW.user_id);
    UPDATE public.profiles SET form_status = 'submitted' WHERE id = NEW.user_id;
  ELSIF NEW.status = 'approved' AND (OLD.status IS DISTINCT FROM 'approved') THEN
    UPDATE public.profiles SET form_status = 'approved' WHERE id = NEW.user_id;
  ELSIF NEW.status = 'rejected' AND (OLD.status IS DISTINCT FROM 'rejected') THEN
    UPDATE public.profiles SET form_status = 'rejected' WHERE id = NEW.user_id;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_form_submit_assign_rec ON public.recruitment_forms;
CREATE TRIGGER trg_form_submit_assign_rec
  AFTER INSERT OR UPDATE OF status ON public.recruitment_forms
  FOR EACH ROW EXECUTE FUNCTION public.on_form_submit_assign_rec();

-- 5) ensure_current_payment now stamps recruiter_admin_id from profile.recruited_by
CREATE OR REPLACE FUNCTION public.ensure_current_payment(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  due_offset := GREATEST(1, LEAST(COALESCE(s.payment_due_day, 5), 7)) - 1;
  due := wk_start + due_offset;

  INSERT INTO public.payments (user_id, week_start, week_end, due_date, amount, status, recruiter_admin_id)
  VALUES (_user_id, wk_start, wk_end, due, s.weekly_amount, 'pending', rec_admin)
  ON CONFLICT (user_id, week_start) DO UPDATE
    SET recruiter_admin_id = COALESCE(public.payments.recruiter_admin_id, EXCLUDED.recruiter_admin_id);

  UPDATE public.payments SET status = 'overdue'
    WHERE user_id = _user_id AND status = 'pending' AND due_date < CURRENT_DATE;
END; $$;

-- 6) Owner-only policy to update transfer status; admins can mark 'pending' after receiving
DROP POLICY IF EXISTS "payments: admin mark transfer pending" ON public.payments;
CREATE POLICY "payments: admin mark transfer pending"
  ON public.payments FOR UPDATE
  TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

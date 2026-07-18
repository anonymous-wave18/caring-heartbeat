
-- Cargos (positions)
CREATE TABLE public.cargos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  color TEXT NOT NULL DEFAULT '#f97316',
  weekly_amount NUMERIC(10,2),
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.cargos TO authenticated;
GRANT ALL ON public.cargos TO service_role;
ALTER TABLE public.cargos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cargos_read_authenticated" ON public.cargos FOR SELECT TO authenticated USING (true);
CREATE POLICY "cargos_staff_write" ON public.cargos FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE TRIGGER trg_cargos_updated BEFORE UPDATE ON public.cargos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed cargos padrão
INSERT INTO public.cargos (name, slug, description, color, sort_order) VALUES
  ('Auxiliar', 'auxiliar', 'Cargo inicial', '#94a3b8', 1),
  ('ADM',      'adm',      'Administrador operacional', '#f97316', 2),
  ('SUP',      'sup',      'Supervisor', '#eab308', 3),
  ('SS',       'ss',       'Suporte Sênior', '#22c55e', 4);

-- profiles: cargo assigned
ALTER TABLE public.profiles
  ADD COLUMN cargo_id UUID REFERENCES public.cargos(id) ON DELETE SET NULL;

-- recruitment_forms: campos completos
ALTER TABLE public.recruitment_forms
  ADD COLUMN cargo_desejado_id UUID REFERENCES public.cargos(id) ON DELETE SET NULL,
  ADD COLUMN full_name TEXT,
  ADD COLUMN birth_date DATE,
  ADD COLUMN cpf TEXT,
  ADD COLUMN bank_name TEXT,
  ADD COLUMN bank_holder TEXT,
  ADD COLUMN discord_avatar_url TEXT,
  ADD COLUMN phone_self TEXT,
  ADD COLUMN phone_father TEXT,
  ADD COLUMN phone_mother TEXT,
  ADD COLUMN location_lat NUMERIC(10,7),
  ADD COLUMN location_lng NUMERIC(10,7),
  ADD COLUMN location_captured_at TIMESTAMPTZ;

-- recruitment_documents: kind (rg_front, rg_back, selfie_rg, video, discord_avatar, other)
ALTER TABLE public.recruitment_documents
  ADD COLUMN kind TEXT NOT NULL DEFAULT 'other';

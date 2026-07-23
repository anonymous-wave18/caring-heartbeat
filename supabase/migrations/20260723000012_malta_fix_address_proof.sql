-- Corrige erro: "address_proof" não encontrada no cache do esquema.
ALTER TABLE public.recruitment_forms
  ADD COLUMN IF NOT EXISTS address_proof text;

-- Força o PostgREST a recarregar o cache do esquema (senão o erro persiste mesmo após criar a coluna).
NOTIFY pgrst, 'reload schema';

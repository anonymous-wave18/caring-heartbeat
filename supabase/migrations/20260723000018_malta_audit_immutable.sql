-- MALTA · Torna audit_log append-only (ninguém pode ALTERAR/APAGAR direto).
-- Somente o job de expurgo (SECURITY DEFINER) consegue remover linhas antigas.

alter table public.audit_log enable row level security;

-- Remove policies antigas se existirem
drop policy if exists "audit_log_insert_any" on public.audit_log;
drop policy if exists "audit_log_read_staff" on public.audit_log;
drop policy if exists "audit_log_no_update" on public.audit_log;
drop policy if exists "audit_log_no_delete" on public.audit_log;

-- Qualquer usuário autenticado pode gravar linhas (útil pra client-side fallback).
create policy "audit_log_insert_any" on public.audit_log
  for insert to authenticated with check (true);

-- Leitura restrita a staff (admin/owner).
create policy "audit_log_read_staff" on public.audit_log
  for select to authenticated
  using (public.is_staff(auth.uid()));

-- NENHUM update/delete via API. O purge roda como SECURITY DEFINER e ignora RLS.
-- (a ausência de policies FOR UPDATE/DELETE já bloqueia; deixamos explícito para clareza)

revoke update, delete on public.audit_log from authenticated;
revoke update, delete on public.audit_log from anon;

notify pgrst, 'reload schema';

-- =====================================================================
-- MALTA — Painel de Bot do Discord (owner-only)
-- Rode este arquivo inteiro no SQL Editor do Supabase.
-- Idempotente: pode rodar mais de uma vez sem quebrar nada.
-- NENHUM segredo (token do bot / shared secret) é guardado no banco.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Configurações do bot (linha única, id = TRUE)
-- ---------------------------------------------------------------------
create table if not exists public.discord_bot_settings (
  id boolean primary key default true,
  guild_id text,
  default_member_role_id text,
  overdue_role_id text,
  removal_after_days integer not null default 7,
  enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  constraint discord_bot_settings_singleton check (id = true),
  constraint discord_bot_settings_days check (removal_after_days between 1 and 90),
  constraint discord_bot_settings_guild check (guild_id is null or guild_id ~ '^[0-9]{15,25}$'),
  constraint discord_bot_settings_member_role check (default_member_role_id is null or default_member_role_id ~ '^[0-9]{15,25}$'),
  constraint discord_bot_settings_overdue_role check (overdue_role_id is null or overdue_role_id ~ '^[0-9]{15,25}$')
);

insert into public.discord_bot_settings (id) values (true)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- 2) Mapeamento cargo do SaaS -> cargo do Discord
-- ---------------------------------------------------------------------
create table if not exists public.discord_role_map (
  cargo_id uuid primary key references public.cargos(id) on delete cascade,
  discord_role_id text not null,
  updated_at timestamptz not null default now(),
  constraint discord_role_map_role_format check (discord_role_id ~ '^[0-9]{15,25}$')
);

-- ---------------------------------------------------------------------
-- 3) Mensagens padrão (templates)
-- ---------------------------------------------------------------------
create table if not exists public.discord_bot_messages (
  key text primary key,
  template text not null default '',
  updated_at timestamptz not null default now(),
  constraint discord_bot_messages_key check (
    key in ('welcome','payment_pending','payment_overdue','role_removed','renewed')
  ),
  constraint discord_bot_messages_len check (char_length(template) <= 1800)
);

insert into public.discord_bot_messages (key, template) values
  ('welcome',        'Bem-vindo(a), {nome}! Seu formulário foi aprovado e seu acesso já está liberado.'),
  ('payment_pending','Olá {nome}, sua mensalidade de {valor} vence em {vencimento}.'),
  ('payment_overdue','Atenção {nome}: sua cobrança de {valor} venceu em {vencimento}. Regularize para manter seus cargos.'),
  ('role_removed',   '{nome}, seus cargos foram removidos por falta de pagamento. Regularize para recuperar o acesso.'),
  ('renewed',        'Pagamento confirmado, {nome}! Seus cargos foram renovados. Obrigado.')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- 4) Log de atividades do bot (append-only)
-- ---------------------------------------------------------------------
create table if not exists public.bot_activity_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_user_id uuid references auth.users(id) on delete set null,
  discord_id text,
  status text not null default 'success',
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint bot_activity_logs_status check (status in ('success','error'))
);

create index if not exists bot_activity_logs_created_idx on public.bot_activity_logs (created_at desc);
create index if not exists bot_activity_logs_action_idx  on public.bot_activity_logs (action);

-- ---------------------------------------------------------------------
-- 5) GRANTs (PostgREST não concede nada por padrão)
-- ---------------------------------------------------------------------
grant select, insert, update on public.discord_bot_settings to authenticated;
grant select, insert, update, delete on public.discord_role_map to authenticated;
grant select, insert, update on public.discord_bot_messages to authenticated;
grant select, insert on public.bot_activity_logs to authenticated;
grant all on public.discord_bot_settings to service_role;
grant all on public.discord_role_map    to service_role;
grant all on public.discord_bot_messages to service_role;
grant all on public.bot_activity_logs   to service_role;

-- ---------------------------------------------------------------------
-- 6) RLS — tudo restrito ao owner
-- ---------------------------------------------------------------------
alter table public.discord_bot_settings enable row level security;
alter table public.discord_role_map     enable row level security;
alter table public.discord_bot_messages enable row level security;
alter table public.bot_activity_logs    enable row level security;

drop policy if exists "owner reads bot settings"   on public.discord_bot_settings;
drop policy if exists "owner writes bot settings"  on public.discord_bot_settings;
drop policy if exists "owner updates bot settings" on public.discord_bot_settings;
create policy "owner reads bot settings" on public.discord_bot_settings
  for select to authenticated using (public.has_role(auth.uid(), 'owner'));
create policy "owner writes bot settings" on public.discord_bot_settings
  for insert to authenticated with check (public.has_role(auth.uid(), 'owner'));
create policy "owner updates bot settings" on public.discord_bot_settings
  for update to authenticated
  using (public.has_role(auth.uid(), 'owner'))
  with check (public.has_role(auth.uid(), 'owner'));

drop policy if exists "owner manages role map" on public.discord_role_map;
create policy "owner manages role map" on public.discord_role_map
  for all to authenticated
  using (public.has_role(auth.uid(), 'owner'))
  with check (public.has_role(auth.uid(), 'owner'));

drop policy if exists "owner reads bot messages"   on public.discord_bot_messages;
drop policy if exists "owner writes bot messages"  on public.discord_bot_messages;
drop policy if exists "owner updates bot messages" on public.discord_bot_messages;
create policy "owner reads bot messages" on public.discord_bot_messages
  for select to authenticated using (public.has_role(auth.uid(), 'owner'));
create policy "owner writes bot messages" on public.discord_bot_messages
  for insert to authenticated with check (public.has_role(auth.uid(), 'owner'));
create policy "owner updates bot messages" on public.discord_bot_messages
  for update to authenticated
  using (public.has_role(auth.uid(), 'owner'))
  with check (public.has_role(auth.uid(), 'owner'));

-- append-only: só INSERT e SELECT, nunca UPDATE/DELETE
drop policy if exists "owner reads bot logs"  on public.bot_activity_logs;
drop policy if exists "staff writes bot logs" on public.bot_activity_logs;
create policy "owner reads bot logs" on public.bot_activity_logs
  for select to authenticated using (public.has_role(auth.uid(), 'owner'));
create policy "staff writes bot logs" on public.bot_activity_logs
  for insert to authenticated
  with check (actor_id = auth.uid() and public.is_staff(auth.uid()));

-- ---------------------------------------------------------------------
-- 7) Proteção do discord_id (usuário comum não pode falsificar)
-- ---------------------------------------------------------------------
create or replace function public.guard_profile_discord_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.discord_id is distinct from old.discord_id
     and not public.is_staff(auth.uid())
     and auth.uid() is not null then
    raise exception 'discord_id não pode ser alterado pelo próprio usuário';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_profile_discord_id on public.profiles;
create trigger trg_guard_profile_discord_id
  before update on public.profiles
  for each row execute function public.guard_profile_discord_id();

-- ---------------------------------------------------------------------
-- 8) Recarrega o cache do PostgREST
-- ---------------------------------------------------------------------
notify pgrst, 'reload schema';
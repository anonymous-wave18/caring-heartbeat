-- ============================================================
-- MALTA · Auditoria completa + retenção de 7 dias
-- Idempotente. Rode inteiro no SQL Editor do Supabase.
-- ============================================================

-- 1) Função genérica de auditoria via trigger --------------------------------
create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_action text;
  v_entity text := tg_table_name;
  v_entity_id text;
  v_meta jsonb := '{}'::jsonb;
begin
  if tg_op = 'INSERT' then
    v_action := v_entity || '.insert';
    v_entity_id := coalesce(new.id::text, null);
    v_meta := to_jsonb(new);
  elsif tg_op = 'UPDATE' then
    v_action := v_entity || '.update';
    v_entity_id := coalesce(new.id::text, old.id::text);
    -- registra só campos que mudaram
    select jsonb_object_agg(key, jsonb_build_object('from', old_val, 'to', new_val))
      into v_meta
    from (
      select key,
             to_jsonb(old) -> key as old_val,
             to_jsonb(new) -> key as new_val
      from jsonb_object_keys(to_jsonb(new)) as t(key)
      where to_jsonb(old) -> key is distinct from to_jsonb(new) -> key
    ) diff;
    if v_meta is null or v_meta = '{}'::jsonb then
      return null; -- nada mudou, não polui log
    end if;
  elsif tg_op = 'DELETE' then
    v_action := v_entity || '.delete';
    v_entity_id := coalesce(old.id::text, null);
    v_meta := to_jsonb(old);
  end if;

  insert into public.audit_log (actor_id, action, entity, entity_id, metadata)
  values (v_actor, v_action, v_entity, v_entity_id, coalesce(v_meta, '{}'::jsonb));

  return coalesce(new, old);
end;
$$;

-- 2) Aplicar triggers nas tabelas críticas -----------------------------------
do $$
declare
  t text;
  tables text[] := array[
    'user_roles','payments','recruitment_forms','site_settings',
    'profiles','announcements','platform_settings','organizations',
    'chat_threads','recruitment_documents'
  ];
begin
  foreach t in array tables loop
    if to_regclass('public.'||t) is not null then
      execute format('drop trigger if exists trg_audit_%1$s on public.%1$s', t);
      execute format(
        'create trigger trg_audit_%1$s
           after insert or update or delete on public.%1$s
           for each row execute function public.audit_row_change()', t);
    end if;
  end loop;
end $$;

-- 3) Índice para acelerar limpeza e listagem ---------------------------------
create index if not exists idx_audit_log_created_at on public.audit_log (created_at desc);

-- 4) Função de limpeza dos logs > 7 dias -------------------------------------
create or replace function public.purge_old_audit_logs()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  removed integer;
begin
  delete from public.audit_log where created_at < now() - interval '7 days';
  get diagnostics removed = row_count;
  return removed;
end;
$$;

grant execute on function public.purge_old_audit_logs() to authenticated;

-- 5) Cron diário (03:00 UTC) - requer extensão pg_cron ------------------------
create extension if not exists pg_cron;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'purge_audit_daily') then
    perform cron.unschedule('purge_audit_daily');
  end if;
  perform cron.schedule(
    'purge_audit_daily',
    '0 3 * * *',
    $c$ select public.purge_old_audit_logs(); $c$
  );
exception when undefined_table then
  -- pg_cron não disponível: ignora, front avisa
  null;
end $$;

-- 6) Função de status para o alerta na UI ------------------------------------
create or replace function public.audit_retention_status()
returns table (
  oldest_at timestamptz,
  oldest_age_days numeric,
  days_until_purge numeric,
  total_rows bigint,
  purge_after_days integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    min(created_at) as oldest_at,
    extract(epoch from (now() - min(created_at))) / 86400 as oldest_age_days,
    greatest(0, 7 - extract(epoch from (now() - min(created_at))) / 86400) as days_until_purge,
    count(*) as total_rows,
    7 as purge_after_days
  from public.audit_log;
$$;

grant execute on function public.audit_retention_status() to authenticated;

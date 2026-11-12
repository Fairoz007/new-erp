-- Phase 8: observability.
-- * client_errors: crashes and failed requests reported by the browser. Anyone signed in may
--   report their own; only Super Admins may read them. Capped in size and rate; old rows are purged.
-- * app_health(): a cheap check for uptime monitors and the Settings page (no business data).

create table if not exists public.client_errors (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  user_id uuid default auth.uid() references auth.users (id) on delete set null,
  kind text not null default 'error' check (kind in ('error', 'unhandledrejection', 'boundary', 'request')),
  page text check (char_length(page) <= 200),
  message text not null check (char_length(message) <= 2000),
  stack text check (char_length(stack) <= 8000),
  user_agent text check (char_length(user_agent) <= 400),
  app_version text check (char_length(app_version) <= 64),
  context jsonb not null default '{}'::jsonb check (pg_column_size(context) <= 4000)
);
create index if not exists client_errors_time_idx on public.client_errors (occurred_at desc);
create index if not exists client_errors_user_idx on public.client_errors (user_id, occurred_at desc);

alter table public.client_errors enable row level security;
alter table public.client_errors force row level security;
revoke all on public.client_errors from anon, public;
-- default privileges grant everything to authenticated; reports are append-only
revoke update, delete, truncate, references, trigger on public.client_errors from authenticated;
grant select, insert on public.client_errors to authenticated;

drop policy if exists client_errors_insert on public.client_errors;
create policy client_errors_insert on public.client_errors for insert to authenticated
  with check (user_id = auth.uid());
drop policy if exists client_errors_select on public.client_errors;
create policy client_errors_select on public.client_errors for select to authenticated
  using (public.is_super_admin());

-- At most 30 reports per user per minute (a crash loop must not fill the table).
create or replace function public.client_errors_rate_limit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.client_errors
       where user_id = new.user_id and occurred_at > now() - interval '1 minute') >= 30 then
    raise exception 'Too many error reports' using errcode = '54000';
  end if;
  new.occurred_at := now();               -- the client cannot backdate a report
  return new;
end $$;
revoke all on function public.client_errors_rate_limit() from public, anon, authenticated;
drop trigger if exists client_errors_rate_limit on public.client_errors;
create trigger client_errors_rate_limit before insert on public.client_errors
  for each row execute function public.client_errors_rate_limit();

-- Purge reports older than 90 days (run by the daily job).
create or replace function public.purge_client_errors(p_keep_days integer default 90) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if auth.uid() is not null and not public.is_super_admin() then
    raise exception 'Permission denied: only a Super Admin can purge error reports' using errcode = '42501';
  end if;
  delete from public.client_errors where occurred_at < now() - make_interval(days => greatest(p_keep_days, 7));
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.purge_client_errors(integer) from public, anon;
grant execute on function public.purge_client_errors(integer) to authenticated;

-- Health: database reachable, time, latest migration applied, and (Super Admin only) error counts.
create or replace function public.app_health() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'ok', true,
    'db_time', now(),
    'schema', '20261113002000',
    'signed_in', auth.uid() is not null,
    'client_errors_24h', case when public.is_super_admin()
      then (select count(*) from public.client_errors where occurred_at > now() - interval '24 hours') end
  )
$$;
-- signed-in users only: anon has no access beyond sign-in
revoke all on function public.app_health() from public, anon;
grant execute on function public.app_health() to authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('purge-client-errors', '30 2 * * *', 'select public.purge_client_errors(90)');
  end if;
end $$;

-- Health details for the Settings page (Super Admins only): migrations applied, pg_cron jobs with
-- their last run, storage bucket limits. Each part is read only if that schema exists here
-- (local test databases have no supabase_migrations / cron / storage.buckets limits).
create or replace function public.system_health() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_migrations jsonb := null;
  v_cron jsonb := null;
  v_buckets jsonb := null;
begin
  if not public.is_super_admin() then
    raise exception 'Permission denied: only a Super Admin can view system health' using errcode = '42501';
  end if;
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    execute $q$select jsonb_build_object('count', count(*), 'latest', max(version)) from supabase_migrations.schema_migrations$q$ into v_migrations;
  end if;
  if to_regclass('cron.job') is not null then
    if to_regclass('cron.job_run_details') is not null then
      execute $q$select coalesce(jsonb_agg(jsonb_build_object('name', j.jobname, 'schedule', j.schedule, 'active', j.active,
                 'last_run', r.start_time, 'last_status', r.status) order by j.jobname), '[]')
                 from cron.job j left join lateral (select start_time, status from cron.job_run_details d
                   where d.jobid = j.jobid order by start_time desc limit 1) r on true$q$ into v_cron;
    else
      execute $q$select coalesce(jsonb_agg(jsonb_build_object('name', jobname, 'schedule', schedule, 'active', active) order by jobname), '[]') from cron.job$q$ into v_cron;
    end if;
  end if;
  if to_regclass('storage.buckets') is not null then
    begin
      execute $q$select coalesce(jsonb_agg(jsonb_build_object('id', id, 'public', public, 'file_size_limit', file_size_limit,
                 'allowed_mime_types', allowed_mime_types) order by id), '[]') from storage.buckets$q$ into v_buckets;
    exception when undefined_column then
      execute $q$select coalesce(jsonb_agg(jsonb_build_object('id', id, 'public', public) order by id), '[]') from storage.buckets$q$ into v_buckets;
    end;
  end if;
  return jsonb_build_object('checked_at', now(), 'migrations', v_migrations, 'cron_jobs', v_cron, 'buckets', v_buckets,
    'client_errors_24h', (select count(*) from public.client_errors where occurred_at > now() - interval '24 hours'),
    'client_errors_7d', (select count(*) from public.client_errors where occurred_at > now() - interval '7 days'));
end $$;
revoke all on function public.system_health() from public, anon;
grant execute on function public.system_health() to authenticated;

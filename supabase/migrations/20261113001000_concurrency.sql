-- Phase 2: correctness under concurrency and failure.
--
-- 1. Optimistic locking. A client that edits a record sends back the `updated_at` it loaded. If
--    the row has changed since (its updated_at is newer), the update is refused with SQLSTATE
--    PT409 (HTTP 409) and a plain message. A client that does not send updated_at is not checked,
--    and server-side functions that set updated_at = now() are never refused (now() is never
--    older than the stored value).
-- 2. Idempotency. A form sends one request key (header x-request-key, a uuid) for every attempt
--    to save the same document. The first insert of a payment, journal, invoice or expense with
--    that key claims it; a second attempt (double click, retry after a timeout) is refused, so
--    the document is never created twice. Inserts in the same transaction share the claim
--    (record_payment inserts a payment and its journal).

-- ---------------------------------------------------------------- 1. optimistic locking
alter table public.employees add column if not exists updated_at timestamptz not null default now();
alter table public.tyres add column if not exists updated_at timestamptz not null default now();
alter table public.accidents add column if not exists updated_at timestamptz not null default now();

create or replace function public.trg_version_check() returns trigger
language plpgsql as $$
begin
  if new.updated_at is not null and old.updated_at is not null and new.updated_at < old.updated_at then
    raise exception 'This record was changed by someone else since you opened it. Reload it to see the latest version, then make your change again.'
      using errcode = 'PT409';
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke all on function public.trg_version_check() from public, anon, authenticated;

-- "a0_" sorts before every other trigger on these tables, so the check sees the client's value.
do $$
declare t text;
begin
  foreach t in array array['companies', 'suppliers', 'customers', 'vehicles', 'work_orders', 'fixed_assets',
                           'invoices', 'employees', 'tyres', 'accidents', 'contracts', 'drivers']
  loop
    if to_regclass('public.' || t) is not null and exists (
         select 1 from information_schema.columns where table_schema = 'public' and table_name = t and column_name = 'updated_at') then
      execute format('drop trigger if exists a0_version_check on public.%I', t);
      execute format('create trigger a0_version_check before update on public.%I for each row execute function public.trg_version_check()', t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------- 2. idempotency
create table if not exists public.request_keys (
  key uuid primary key,
  user_id uuid default auth.uid(),
  txid bigint not null default txid_current(),
  table_name text not null,
  created_at timestamptz not null default now()
);
alter table public.request_keys enable row level security;
alter table public.request_keys force row level security;
revoke all on public.request_keys from public, anon, authenticated;
create index if not exists request_keys_created_idx on public.request_keys (created_at);

create or replace function public.request_key() returns uuid
language plpgsql stable set search_path = public as $$
declare v text;
begin
  v := nullif(current_setting('request.headers', true), '')::json ->> 'x-request-key';
  if v is null or v !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return null; end if;
  return v::uuid;
exception when others then return null;
end $$;
revoke all on function public.request_key() from public, anon, authenticated;

create or replace function public.trg_claim_request_key() returns trigger
language plpgsql security definer set search_path = public as $$
declare k uuid := public.request_key(); prev record;
begin
  if k is null then return new; end if;
  select * into prev from public.request_keys where key = k;
  if found then
    if prev.txid = txid_current() then return new; end if;     -- same save, another row of it
    raise exception 'This was already saved. It was submitted twice (double click or retry), so the second copy was not created. Refresh the list to see it.'
      using errcode = 'PT409';
  end if;
  insert into public.request_keys (key, table_name) values (k, tg_table_name);
  return new;
end $$;
revoke all on function public.trg_claim_request_key() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['payments', 'journal_entries', 'invoices', 'expenses'] loop
    execute format('drop trigger if exists a0_request_key on public.%I', t);
    execute format('create trigger a0_request_key before insert on public.%I for each row execute function public.trg_claim_request_key()', t);
  end loop;
end $$;

-- Keys are only needed while a user might retry; keep 7 days.
create or replace function public.purge_request_keys() returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if auth.uid() is not null then raise exception 'Permission denied: server job only' using errcode = '42501'; end if;
  delete from public.request_keys where created_at < now() - interval '7 days';
  get diagnostics n = row_count; return n;
end $$;
revoke all on function public.purge_request_keys() from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('purge-request-keys', '45 2 * * *', 'select public.purge_request_keys()');
  end if;
end $$;

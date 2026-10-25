-- =====================================================================
-- Agent E (platform): document numbering, company bootstrap, security hardening.
-- See docs/audit/agent-E.md.
--
-- ORDER-INDEPENDENT BY DESIGN. On the linked project the later slots
-- (20261026000100..000600) were pushed before this file, so remotely it runs
-- LAST (`supabase db push --include-all`), while fresh databases (tests,
-- branches, db reset) run it FIRST. Therefore this file:
--   * never revokes EXECUTE from `authenticated` on functions it does not know
--     (only on the named internal functions of 000000-000200, on trigger
--     functions, and on its own internals), so other slots' RPC grants survive;
--   * only drops/recreates policies that no other slot recreates
--     (role_permissions_write / approval_limits_write belong to 000600_auth);
--   * uses `if exists` / `if not exists` / `create or replace` everywhere.
--
-- 1. Numbering: BEFORE INSERT triggers fill document numbers when null/''.
-- 2. Company bootstrap: chart of accounts from account_templates + creator membership.
-- 3. Hardening: function grants, default privileges, search_path, RLS policy fixes.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Document numbering
-- ---------------------------------------------------------------------

-- 1a. next_doc_number: now checks tenancy for app users, and never truncates
--     (lpad('1000', 3) = '100' made VH-1000 collide with VH-100).
create or replace function public.next_doc_number(p_company uuid, p_prefix text, p_pad int default 4)
returns text language plpgsql security definer set search_path = public as $$
declare v int; w int := greatest(coalesce(p_pad, 4), 1);
begin
  if p_company is null or coalesce(btrim(p_prefix), '') = '' then
    raise exception 'next_doc_number: company and prefix are required';
  end if;
  -- App users (JWT present) may only draw numbers for offices they belong to.
  -- Server-side callers (service role, SQL editor, cron: auth.uid() is null) are trusted.
  if auth.uid() is not null and not public.has_company_access(p_company) then
    raise exception 'Permission denied: no access to this office' using errcode = '42501';
  end if;
  insert into public.doc_sequences (company_id, prefix, last_value) values (p_company, p_prefix, 1)
  on conflict (company_id, prefix) do update set last_value = doc_sequences.last_value + 1
  returning last_value into v;          -- the row lock serialises concurrent callers until commit
  return p_prefix || '-' || case when length(v::text) >= w then v::text else lpad(v::text, w, '0') end;
end $$;

-- 1b. Group-level sequences (suppliers / customers have no company_id).
create table if not exists public.global_doc_sequences (
  prefix     text primary key,
  last_value integer not null default 0
);
alter table public.global_doc_sequences enable row level security;
alter table public.global_doc_sequences force row level security;
-- no policies and no grants: reached only through the SECURITY DEFINER helpers below

create or replace function public._fmt_doc_number(p_prefix text, p_value int, p_pad int)
returns text language sql immutable set search_path = public as $$
  select p_prefix || '-' || case when length(p_value::text) >= greatest(p_pad, 1) then p_value::text
                                 else lpad(p_value::text, greatest(p_pad, 1), '0') end
$$;

create or replace function public._doc_year(p_date date)
returns text language sql stable set search_path = public as $$
  select extract(year from coalesce(p_date, current_date))::int::text
$$;

-- Assign a per-company number when p_value is null/blank; otherwise keep the supplied
-- value and, if it matches <prefix>-<digits>, move the sequence past it (legacy import,
-- RPCs that pre-allocate with next_doc_number) so later automatic numbers never collide.
create or replace function public._assign_doc_number(p_company uuid, p_prefix text, p_pad int, p_value text)
returns text language plpgsql security definer set search_path = public as $$
declare s text;
begin
  if p_company is null then return p_value; end if;          -- NOT NULL on company_id reports it
  if coalesce(btrim(p_value), '') = '' then
    return public.next_doc_number(p_company, p_prefix, p_pad);
  end if;
  s := substring(p_value from ('^' || p_prefix || '-([0-9]{1,9})$'));
  if s is not null then
    insert into public.doc_sequences (company_id, prefix, last_value) values (p_company, p_prefix, s::int)
    on conflict (company_id, prefix) do update
      set last_value = greatest(doc_sequences.last_value, excluded.last_value);
  end if;
  return p_value;
end $$;

create or replace function public._assign_global_doc_number(p_prefix text, p_pad int, p_value text)
returns text language plpgsql security definer set search_path = public as $$
declare v int; s text;
begin
  if coalesce(btrim(p_value), '') = '' then
    insert into public.global_doc_sequences (prefix, last_value) values (p_prefix, 1)
    on conflict (prefix) do update set last_value = global_doc_sequences.last_value + 1
    returning last_value into v;
    return public._fmt_doc_number(p_prefix, v, p_pad);
  end if;
  s := substring(p_value from ('^' || p_prefix || '-([0-9]{1,9})$'));
  if s is not null then
    insert into public.global_doc_sequences (prefix, last_value) values (p_prefix, s::int)
    on conflict (prefix) do update set last_value = greatest(global_doc_sequences.last_value, excluded.last_value);
  end if;
  return p_value;
end $$;

-- One trigger function for every numbered table (plpgsql resolves NEW fields per table at run time).
-- Formats: docs/audit/CONTRACTS.md "Database numbering contract".
create or replace function public.trg_assign_doc_number() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  case tg_table_name
    when 'vehicles' then
      new.vehicle_code := public._assign_doc_number(new.company_id, 'VH', 3, new.vehicle_code);
    when 'work_orders' then
      new.work_order_number := public._assign_doc_number(new.company_id,
        'WO-' || public._doc_year(new.reported_date), 3, new.work_order_number);
    when 'maintenance_records' then
      new.record_number := public._assign_doc_number(new.company_id,
        'MNT-' || public._doc_year(new.maintenance_date), 3, new.record_number);
    when 'accidents' then
      new.accident_number := public._assign_doc_number(new.company_id,
        'ACC-' || public._doc_year(new.accident_date), 3, new.accident_number);
    when 'expenses' then
      new.expense_number := public._assign_doc_number(new.company_id,
        'EXP-' || public._doc_year(new.date), 4, new.expense_number);
    when 'invoices' then
      new.invoice_number := public._assign_doc_number(new.company_id,
        (case when coalesce(new.is_credit_note, false) then 'CN'
              when new.invoice_type = 'Sales' then 'INV' else 'PINV' end)
        || '-' || public._doc_year(new.invoice_date), 4, new.invoice_number);
    when 'reconciliations' then
      new.reconciliation_number := public._assign_doc_number(new.company_id,
        'REC-' || public._doc_year(new.reconciled_date), 3, new.reconciliation_number);
    when 'fixed_assets' then
      new.asset_code := public._assign_doc_number(new.company_id, 'FA', 3, new.asset_code);
    when 'depreciation_runs' then
      new.batch_number := public._assign_doc_number(new.company_id,
        'DEP-' || public._doc_year(new.period), 2, new.batch_number);
    when 'employees' then
      new.employee_code := public._assign_doc_number(new.company_id, 'EMP', 3, new.employee_code);
    when 'payroll_runs' then
      if coalesce(btrim(new.payroll_number), '') = '' and new.year is not null and new.month is not null then
        new.payroll_number := 'PR-' || new.year || '-' || lpad(new.month::text, 2, '0');
      end if;
    when 'suppliers' then
      new.supplier_code := public._assign_global_doc_number('SUP', 3, new.supplier_code);
    when 'customers' then
      new.customer_code := public._assign_global_doc_number('CUST', 3, new.customer_code);
    else
      raise exception 'trg_assign_doc_number: unsupported table %', tg_table_name;
  end case;
  return new;
end $$;

-- Triggers + column defaults ('' so generated TS Insert types make the column optional;
-- the trigger treats '' as "assign") + a not-blank check so '' can never be stored.
do $$
declare r record;
begin
  for r in select * from (values
      ('vehicles','vehicle_code'), ('work_orders','work_order_number'), ('maintenance_records','record_number'),
      ('accidents','accident_number'), ('expenses','expense_number'), ('invoices','invoice_number'),
      ('reconciliations','reconciliation_number'), ('fixed_assets','asset_code'),
      ('depreciation_runs','batch_number'), ('employees','employee_code'), ('payroll_runs','payroll_number'),
      ('suppliers','supplier_code'), ('customers','customer_code')
    ) as m(tbl, col)
  loop
    execute format('drop trigger if exists %I on public.%I', r.tbl || '_doc_number', r.tbl);
    execute format('create trigger %I before insert on public.%I for each row execute function public.trg_assign_doc_number()',
                   r.tbl || '_doc_number', r.tbl);
    execute format('alter table public.%I alter column %I set default %L', r.tbl, r.col, '');
    if not exists (select 1 from pg_constraint where conname = r.tbl || '_' || r.col || '_not_blank') then
      execute format('alter table public.%I add constraint %I check (btrim(%I) <> %L)',
                     r.tbl, r.tbl || '_' || r.col || '_not_blank', r.col, '');
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 2. Company bootstrap
-- ---------------------------------------------------------------------

-- 2a. Chart-of-accounts template (group-level reference data, editable by settings admins).
--     Ported from INITIAL_CHART_OF_ACCOUNTS (codes/names/categories only, no demo balances),
--     plus every code the posting RPCs/triggers use.
create table if not exists public.account_templates (
  code        text primary key,
  name        text not null,
  category    public.account_category not null,
  subcategory text not null,
  description text,
  is_system   boolean not null default true,
  active      boolean not null default true,
  sort_order  integer not null default 0
);
alter table public.account_templates enable row level security;
alter table public.account_templates force row level security;

insert into public.account_templates (code, name, category, subcategory, description, sort_order) values
  ('1010','Cash on Hand & Petty Cash','Asset','Current Assets','Default GL of bank_accounts.gl_account_code', 10),
  ('1020','Bank - Bank Muscat Corporate','Asset','Current Assets', null, 20),
  ('1030','Accounts Receivable (Trade Debtors)','Asset','Current Assets','Legacy AR account; posting RPCs use 1100', 30),
  ('1040','Prepaid Insurance & Licences','Asset','Current Assets', null, 40),
  ('1100','Accounts Receivable (Control)','Asset','Current Assets','AR control: post_invoice / record_payment (Sales)', 50),
  ('1300','VAT Input Tax Recoverable','Asset','Current Assets','Input VAT: post_invoice (Purchase)', 60),
  ('1510','Motor Vehicles Fleet at Cost','Asset','Fixed Assets', null, 70),
  ('1520','Accumulated Depreciation - Motor Vehicles','Asset','Fixed Assets','Contra asset: run_depreciation', 80),
  ('1530','Workshop Tools & Diagnostic Equipment','Asset','Fixed Assets', null, 90),
  ('2010','Accounts Payable (Trade Creditors)','Liability','Current Liabilities','AP control: post_invoice / record_payment (Purchase)', 100),
  ('2020','VAT Output Tax Payable','Liability','Current Liabilities','Legacy VAT account; posting RPCs use 2100 (output) / 1300 (input)', 110),
  ('2030','Accrued Operational Expenses','Liability','Current Liabilities', null, 120),
  ('2040','PASI / Social Insurance Payable','Liability','Current Liabilities','process_payroll', 130),
  ('2050','Salaries & Wages Payable','Liability','Current Liabilities','process_payroll', 140),
  ('2100','VAT Output Tax (Control)','Liability','Current Liabilities','Output VAT: post_invoice (Sales)', 150),
  ('2510','Commercial Vehicle Bank Loans','Liability','Long Term Liabilities', null, 160),
  ('3010','Shareholder Capital','Equity','Equity', null, 170),
  ('3020','Retained Earnings','Equity','Equity', null, 180),
  ('3030','Current Year Profit / (Loss)','Equity','Equity', null, 190),
  ('4000','Operating Revenue (Default)','Revenue','Operating Revenue','Default revenue for sales lines without a GL code', 200),
  ('4010','Fleet Haulage & Logistics Revenue','Revenue','Operating Revenue', null, 210),
  ('4020','Passenger Shuttle & Rental Income','Revenue','Operating Revenue', null, 220),
  ('4030','Other Incidental Income / Salvage Recovery','Revenue','Other Revenue', null, 230),
  ('5000','Vehicle Maintenance & Spare Parts','Expense','Direct Operating Expense','Default expense for purchase lines without a GL code', 240),
  ('5010','Fuel & Lubricants Expense','Expense','Direct Operating Expense', null, 250),
  ('5020','Tyres & Wheel Service Expense','Expense','Direct Operating Expense', null, 260),
  ('5025','Oil Service & Lubrication Expense','Expense','Direct Operating Expense', null, 270),
  ('5030','Motor Fleet Insurance Premium','Expense','Operating Expense', null, 280),
  ('5040','Vehicle Registration & Mulkiya Fees','Expense','Operating Expense', null, 290),
  ('5050','Accident Deductible & Net Damage Cost','Expense','Operating Expense', null, 300),
  ('5060','Tolls, Parking & Road User Levies','Expense','Operating Expense', null, 310),
  ('5070','Driver Allowances & Logistics Staff','Expense','Operating Expense','Gross salaries: process_payroll', 320),
  ('5075','PASI Employer Contribution Expense','Expense','Operating Expense','process_payroll', 330),
  ('5080','Depreciation Expense - Motor Vehicles','Expense','Depreciation','run_depreciation', 340),
  ('5090','Finance Interest & Bank Facility Charges','Expense','Finance Expense', null, 350)
on conflict (code) do nothing;

drop policy if exists account_templates_select on public.account_templates;
drop policy if exists account_templates_insert on public.account_templates;
drop policy if exists account_templates_update on public.account_templates;
drop policy if exists account_templates_delete on public.account_templates;
create policy account_templates_select on public.account_templates for select to authenticated using (true);
create policy account_templates_insert on public.account_templates for insert to authenticated
  with check ((select public.has_perm('settings','edit')));
create policy account_templates_update on public.account_templates for update to authenticated
  using ((select public.has_perm('settings','edit'))) with check ((select public.has_perm('settings','edit')));
create policy account_templates_delete on public.account_templates for delete to authenticated
  using ((select public.has_perm('settings','edit')));
revoke all on public.account_templates from anon;
grant select, insert, update, delete on public.account_templates to authenticated;

-- 2b. Seeding (idempotent: only missing codes are added; existing accounts are never changed)
create or replace function public._seed_chart_of_accounts(p_company uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  insert into public.accounts (company_id, code, name, category, subcategory, currency, description, is_system)
  select c.id, t.code, t.name, t.category, t.subcategory, c.currency, t.description, t.is_system
  from public.account_templates t
  join public.companies c on c.id = p_company
  where t.active
  on conflict (company_id, code) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

-- Callable RPC: add template accounts that an office is missing (e.g. after the template grew).
create or replace function public.seed_chart_of_accounts(p_company uuid) returns integer
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and
     (not public.has_company_access(p_company) or not public.has_perm('accounting', 'create')) then
    raise exception 'Permission denied' using errcode = '42501';
  end if;
  return public._seed_chart_of_accounts(p_company);
end $$;

-- 2c. created_by lets the creator read the new office immediately (INSERT ... RETURNING is
--     checked against the SELECT policy before the AFTER trigger adds the membership).
alter table public.companies add column if not exists created_by uuid references public.profiles(id) on delete set null;

create or replace function public.trg_company_created_by() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(auth.uid(), new.created_by);
  else
    new.created_by := old.created_by;      -- immutable
  end if;
  return new;
end $$;
drop trigger if exists companies_created_by on public.companies;
create trigger companies_created_by before insert or update on public.companies
  for each row execute function public.trg_company_created_by();

create or replace function public.trg_company_bootstrap() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  perform public._seed_chart_of_accounts(new.id);
  if v_uid is not null and exists (select 1 from public.profiles where id = v_uid) then
    insert into public.company_members (user_id, company_id) values (v_uid, new.id)
    on conflict (user_id, company_id) do nothing;
  end if;
  return null;
end $$;
drop trigger if exists companies_bootstrap on public.companies;
create trigger companies_bootstrap after insert on public.companies
  for each row execute function public.trg_company_bootstrap();

-- Offices that already exist (none on the linked project at the time of writing) get their CoA too.
select public._seed_chart_of_accounts(id) from public.companies;

-- ---------------------------------------------------------------------
-- 3. Security hardening
-- ---------------------------------------------------------------------

-- 3a. search_path on functions flagged by the advisor
alter function public.trg_touch() set search_path = public;
alter function public.storage_company(text) set search_path = public;

-- 3b. Audit trail: also audit identity/permission/config tables; better entity ids for
--     tables without an `id` column.
create or replace function public.trg_audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_row jsonb := to_jsonb(coalesce(new, old));
begin
  insert into public.audit_logs (company_id, action, entity_type, entity_id, old_value, new_value)
  values ((v_row->>'company_id')::uuid,
          case tg_op when 'INSERT' then 'CREATE' else tg_op end,
          tg_table_name,
          coalesce(v_row->>'id', v_row->>'code',
                   nullif(concat_ws('/', v_row->>'user_id', v_row->>'role', v_row->>'module', v_row->>'action'), '')),
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['profiles','company_members','role_permissions','approval_limits','approval_rules',
                           'accounts','account_templates']
  loop
    execute format('drop trigger if exists %I on public.%I', t || '_audit', t);
    execute format('create trigger %I after insert or update or delete on public.%I
                    for each row execute function public.trg_audit()', t || '_audit', t);
  end loop;
end $$;

-- 3c. RLS policy fixes
--   * auth_rls_initplan: auth.uid() wrapped as (select auth.uid()) (evaluated once per query)
--   * multiple_permissive_policies: FOR ALL write policies split into insert/update/delete
--   * companies: the FOR ALL policy also granted SELECT/UPDATE/DELETE on EVERY office to any
--     role with companies 'edit' (Company Admin, Finance Manager, Fleet Manager). Writes and
--     reads are now scoped to offices the user belongs to (+ the creator of a new office).
--   * invoice_lines: the FOR ALL policy let anyone with invoices 'view' DELETE lines
--     (USING applies to DELETE); writes now need 'edit' and an unposted invoice.

-- helper for profiles_select: the old inline join on company_members ran under the
-- caller's RLS (members_select only shows the caller's own rows), so colleagues were invisible.
create or replace function public.shares_company_with(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.company_members a
                 join public.company_members b on b.company_id = a.company_id
                 where a.user_id = auth.uid() and b.user_id = p_user)
$$;

-- companies
drop policy if exists companies_select on public.companies;
drop policy if exists companies_write  on public.companies;
drop policy if exists companies_insert on public.companies;
drop policy if exists companies_update on public.companies;
drop policy if exists companies_delete on public.companies;
create policy companies_select on public.companies for select to authenticated
  using (public.has_company_access(id) or created_by = (select auth.uid()));
create policy companies_insert on public.companies for insert to authenticated
  with check ((select public.has_perm('companies','create')));
create policy companies_update on public.companies for update to authenticated
  using (public.has_company_access(id) and (select public.has_perm('companies','edit')))
  with check (public.has_company_access(id) and (select public.has_perm('companies','edit')));
create policy companies_delete on public.companies for delete to authenticated
  using (public.has_company_access(id) and (select public.has_perm('companies','delete')));

-- company_members (write policies identical to 000600_auth, which drops/recreates the same names)
drop policy if exists members_select on public.company_members;
drop policy if exists members_write  on public.company_members;
drop policy if exists members_insert on public.company_members;
drop policy if exists members_update on public.company_members;
drop policy if exists members_delete on public.company_members;
create policy members_select on public.company_members for select to authenticated
  using (user_id = (select auth.uid()) or (select public.has_perm('users-roles','view'))
         or (select public.has_perm('users-roles','edit')));          -- same rows the old select+FOR ALL pair exposed
create policy members_insert on public.company_members for insert to authenticated
  with check (public.has_perm('users-roles','edit') and public.has_company_access(company_id));
create policy members_update on public.company_members for update to authenticated
  using (public.has_perm('users-roles','edit') and public.has_company_access(company_id))
  with check (public.has_perm('users-roles','edit') and public.has_company_access(company_id));
create policy members_delete on public.company_members for delete to authenticated
  using (public.has_perm('users-roles','edit') and public.has_company_access(company_id));

-- approval_rules (role_permissions / approval_limits write policies are owned by 000600_auth)
drop policy if exists approval_rules_select on public.approval_rules;
drop policy if exists approval_rules_write  on public.approval_rules;
drop policy if exists approval_rules_insert on public.approval_rules;
drop policy if exists approval_rules_update on public.approval_rules;
drop policy if exists approval_rules_delete on public.approval_rules;
create policy approval_rules_select on public.approval_rules for select to authenticated using (true);
create policy approval_rules_insert on public.approval_rules for insert to authenticated
  with check ((select public.has_perm('settings','edit')));
create policy approval_rules_update on public.approval_rules for update to authenticated
  using ((select public.has_perm('settings','edit'))) with check ((select public.has_perm('settings','edit')));
create policy approval_rules_delete on public.approval_rules for delete to authenticated
  using ((select public.has_perm('settings','edit')));

-- profiles
drop policy if exists profiles_select on public.profiles;
drop policy if exists profiles_update on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.has_perm('users-roles','view')) or public.shares_company_with(id));
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid()) or (select public.has_perm('users-roles','edit')))
  with check (id = (select auth.uid()) or (select public.has_perm('users-roles','edit')));   -- role/status guarded by trigger

-- approval_requests / notifications
drop policy if exists approval_requests_insert on public.approval_requests;
create policy approval_requests_insert on public.approval_requests for insert to authenticated
  with check (public.has_company_access(company_id) and requested_by = (select auth.uid()));

drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications for select to authenticated
  using (public.has_company_access(company_id) and (user_id is null or user_id = (select auth.uid())));

drop policy if exists notification_reads_own on public.notification_reads;
create policy notification_reads_own on public.notification_reads for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- invoice_lines
drop policy if exists invoice_lines_all    on public.invoice_lines;
drop policy if exists invoice_lines_select on public.invoice_lines;
drop policy if exists invoice_lines_insert on public.invoice_lines;
drop policy if exists invoice_lines_update on public.invoice_lines;
drop policy if exists invoice_lines_delete on public.invoice_lines;
create policy invoice_lines_select on public.invoice_lines for select to authenticated
  using (exists (select 1 from public.invoices i where i.id = invoice_id
                 and public.has_company_access(i.company_id) and public.has_perm('invoices','view')));
create policy invoice_lines_insert on public.invoice_lines for insert to authenticated
  with check (exists (select 1 from public.invoices i where i.id = invoice_id and i.journal_entry_id is null
                      and public.has_company_access(i.company_id)
                      and (public.has_perm('invoices','create') or public.has_perm('invoices','edit'))));
create policy invoice_lines_update on public.invoice_lines for update to authenticated
  using (exists (select 1 from public.invoices i where i.id = invoice_id and i.journal_entry_id is null
                 and public.has_company_access(i.company_id) and public.has_perm('invoices','edit')))
  with check (exists (select 1 from public.invoices i where i.id = invoice_id and i.journal_entry_id is null
                      and public.has_company_access(i.company_id) and public.has_perm('invoices','edit')));
create policy invoice_lines_delete on public.invoice_lines for delete to authenticated
  using (exists (select 1 from public.invoices i where i.id = invoice_id and i.journal_entry_id is null
                 and public.has_company_access(i.company_id) and public.has_perm('invoices','edit')));

-- 3d. Function EXECUTE privileges
-- Postgres grants EXECUTE to PUBLIC on every new function, and Supabase's default privileges
-- grant it to anon/authenticated. Nothing in this app is callable without signing in.
revoke execute on all functions in schema public from public, anon;

-- Internal functions of 000000-000200 and this file: never callable through /rest/v1/rpc.
revoke execute on function
  public.recalc_invoice_totals(uuid), public.recalc_invoice_settlement(uuid),
  public.handle_new_user(), public.guard_profile_update(),
  public._fmt_doc_number(text, int, int), public._doc_year(date),
  public._assign_doc_number(uuid, text, int, text), public._assign_global_doc_number(text, int, text),
  public._seed_chart_of_accounts(uuid)
from public, anon, authenticated;

-- Trigger functions are only ever invoked by triggers (EXECUTE is checked at CREATE TRIGGER,
-- not when the trigger fires), so no client role needs them. Covers every slot's trigger functions.
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p
           where p.pronamespace = 'public'::regnamespace and p.prorettype = 'trigger'::regtype
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
  end loop;
end $$;

-- Callable by signed-in users: RLS helpers (policies run as the caller) and RPCs that
-- re-check company + permission themselves.
grant execute on function
  public.app_role(), public.is_super_admin(), public.has_company_access(uuid),
  public.has_perm(text, public.permission_action), public.can_approve(text, numeric),
  public.storage_company(text), public.shares_company_with(uuid),
  public.post_journal_entry(uuid, date, text, jsonb, text, text, uuid),
  public.record_payment(uuid, numeric, date, text, uuid, text, text, text),
  public.post_invoice(uuid), public.decide_approval(uuid, text, text),
  public.complete_work_order(uuid, numeric), public.next_doc_number(uuid, text, int),
  public.seed_chart_of_accounts(uuid)
to authenticated;

-- 3e. Default privileges for objects `postgres` creates from now on (later migrations):
--     functions are not executable by anyone until a migration grants them explicitly
--     (CONTRACTS.md: "grant execute to authenticated only"); anon gets no table access.
alter default privileges for role postgres revoke execute on functions from public;
alter default privileges for role postgres in schema public revoke execute on functions from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;

-- 3f. anon has no business in this schema (also covers tables/views created by later slots
--     when this file runs last on the linked project). RLS stays the primary control.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

-- 3g. Every table in public must have RLS enabled and forced (new tables from this file).
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' and not rowsecurity loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
  end loop;
end $$;

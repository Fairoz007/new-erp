-- =====================================================================
-- Phase 2: office scoping for clients/suppliers, sharing between offices, audited transfers.
--
-- Decisions (also in AUDIT_REPORT.md):
--  * Every client and supplier has a home office (office_id) and a sharing mode:
--      office        visible only to its home office
--      selected      home office + the offices listed in party_office_shares
--      organization  visible to every office
--    Existing parties were global, so they are migrated as 'organization' (no one loses access);
--    their home office is the office of their first invoice, else the first office.
--  * A party can only be used (invoice, expense, work order …) in an office that can see it.
--  * Vehicles, employees, clients and suppliers move between offices only through
--    transfer_to_office(), which needs edit rights in the old office and create rights in the
--    new one, a reason, and writes office_transfers + the audit log. History stays in the old office.
--    A vehicle's fixed asset moves with it at net book value through the 1600 inter-office account.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Party ownership and sharing
-- ---------------------------------------------------------------------
alter table public.customers add column if not exists office_id uuid references public.companies(id) on delete restrict;
alter table public.suppliers add column if not exists office_id uuid references public.companies(id) on delete restrict;
alter table public.customers add column if not exists sharing text not null default 'office';
alter table public.suppliers add column if not exists sharing text not null default 'office';
alter table public.customers drop constraint if exists customers_sharing_check;
alter table public.customers add constraint customers_sharing_check check (sharing in ('office', 'selected', 'organization'));
alter table public.suppliers drop constraint if exists suppliers_sharing_check;
alter table public.suppliers add constraint suppliers_sharing_check check (sharing in ('office', 'selected', 'organization'));

-- backfill: existing parties stay visible everywhere; home office = first invoice's office
update public.customers c set sharing = 'organization',
  office_id = coalesce((select i.company_id from public.invoices i where i.customer_id = c.id order by i.invoice_date, i.created_at limit 1),
                       (select id from public.companies order by created_at, name limit 1))
where c.office_id is null;
update public.suppliers s set sharing = 'organization',
  office_id = coalesce((select i.company_id from public.invoices i where i.supplier_id = s.id order by i.invoice_date, i.created_at limit 1),
                       (select e.company_id from public.expenses e where e.supplier_id = s.id order by e.date limit 1),
                       (select id from public.companies order by created_at, name limit 1))
where s.office_id is null;
do $$
begin
  if not exists (select 1 from public.customers where office_id is null) then alter table public.customers alter column office_id set not null; end if;
  if not exists (select 1 from public.suppliers where office_id is null) then alter table public.suppliers alter column office_id set not null; end if;
end $$;
create index if not exists customers_office on public.customers (office_id);
create index if not exists suppliers_office on public.suppliers (office_id);

-- home office default: app users with one office get it; server-side inserts (imports, SQL editor)
-- go to the first office shared organization-wide (the behaviour parties had before)
create or replace function public.trg_party_office_default() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_offices uuid[];
begin
  if new.office_id is null then
    if auth.uid() is null then
      new.office_id := (select id from public.companies order by created_at, name limit 1);
      new.sharing := 'organization';
    else
      v_offices := public.perm_company_ids(tg_table_name, 'create');
      if cardinality(v_offices) = 1 then new.office_id := v_offices[1];
      else raise exception 'Choose the office this % belongs to', case tg_table_name when 'customers' then 'client' else 'supplier' end; end if;
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.trg_party_office_default() from anon, authenticated, public;
drop trigger if exists customers_a_office_default on public.customers;
create trigger customers_a_office_default before insert on public.customers for each row execute function public.trg_party_office_default();
drop trigger if exists suppliers_a_office_default on public.suppliers;
create trigger suppliers_a_office_default before insert on public.suppliers for each row execute function public.trg_party_office_default();

create table if not exists public.party_office_shares (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id) on delete cascade,
  supplier_id uuid references public.suppliers(id) on delete cascade,
  company_id  uuid not null references public.companies(id) on delete cascade,
  created_by  uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),
  check ((customer_id is null) <> (supplier_id is null))
);
create unique index if not exists party_office_shares_customer on public.party_office_shares (customer_id, company_id) where customer_id is not null;
create unique index if not exists party_office_shares_supplier on public.party_office_shares (supplier_id, company_id) where supplier_id is not null;
create index if not exists party_office_shares_company on public.party_office_shares (company_id);

-- offices a party is available in (security definer: used inside RLS without recursion)
create or replace function public.party_office_ids(p_type text, p_id uuid) returns uuid[]
language sql stable security definer set search_path = public as $$
  with p as (
    select office_id, sharing from public.customers where p_type = 'Customer' and id = p_id
    union all
    select office_id, sharing from public.suppliers where p_type = 'Supplier' and id = p_id
  )
  select case when (select sharing from p) = 'organization' then (select coalesce(array_agg(id), '{}') from public.companies)
              else array(select office_id from p
                         union select company_id from public.party_office_shares s, p
                               where p.sharing = 'selected'
                                 and ((p_type = 'Customer' and s.customer_id = p_id) or (p_type = 'Supplier' and s.supplier_id = p_id))) end
$$;
revoke execute on function public.party_office_ids(text, uuid) from anon, public;
grant execute on function public.party_office_ids(text, uuid) to authenticated;

-- offices where the caller may see parties of this kind (the party module, or invoices / expenses that use them)
create or replace function public.party_view_offices(p_module text) returns uuid[]
language sql stable security definer set search_path = public as $$
  select array(select unnest(public.perm_company_ids(p_module, 'view'))
               union select unnest(public.perm_company_ids('invoices', 'view'))
               union select unnest(case when p_module = 'suppliers' then public.perm_company_ids('expenses', 'view')
                                                                        || public.perm_company_ids('maintenance', 'view')
                                                                        || public.perm_company_ids('work-orders', 'view')
                                        else '{}'::uuid[] end))
$$;
revoke execute on function public.party_view_offices(text) from anon, public;
grant execute on function public.party_view_offices(text) to authenticated;

-- RLS: replace the global has_perm() policies
do $$
declare t text; m text; k text;
begin
  foreach t in array array['customers', 'suppliers'] loop
    m := t;
    k := case t when 'customers' then 'Customer' else 'Supplier' end;
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format($p$create policy %I on public.%I for select to authenticated using (
        office_id = any((select public.party_view_offices(%L))::uuid[])
        or (sharing = 'organization' and cardinality((select public.party_view_offices(%L))::uuid[]) > 0)
        or (sharing = 'selected' and public.party_office_ids(%L, id) && (select public.party_view_offices(%L))::uuid[]))$p$,
      t || '_select', t, m, m, k, m);
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (office_id = any((select public.perm_company_ids(%L, ''create''))::uuid[]))', t || '_insert', t, m);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('create policy %I on public.%I for update to authenticated using (office_id = any((select public.perm_company_ids(%L, ''edit''))::uuid[])) with check (office_id = any((select public.perm_company_ids(%L, ''edit''))::uuid[]))', t || '_update', t, m, m);
    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
    execute format('create policy %I on public.%I for delete to authenticated using (office_id = any((select public.perm_company_ids(%L, ''delete''))::uuid[]))', t || '_delete', t, m);
  end loop;
end $$;

-- shares: readable where the caller sees the party's home office or the shared office; written via RPC
alter table public.party_office_shares enable row level security;
alter table public.party_office_shares force row level security;
revoke all on public.party_office_shares from anon;
revoke insert, update, delete on public.party_office_shares from authenticated;
grant select on public.party_office_shares to authenticated;
drop policy if exists party_office_shares_select on public.party_office_shares;
create policy party_office_shares_select on public.party_office_shares for select to authenticated using (
  company_id = any((select public.party_view_offices(case when customer_id is not null then 'customers' else 'suppliers' end))::uuid[])
  or (customer_id is not null and (select office_id from public.customers where id = customer_id) = any((select public.party_view_offices('customers'))::uuid[]))
  or (supplier_id is not null and (select office_id from public.suppliers where id = supplier_id) = any((select public.party_view_offices('suppliers'))::uuid[])));

-- set sharing mode and (for 'selected') the office list; home-office edit permission required
create or replace function public.set_party_sharing(p_type text, p_id uuid, p_sharing text, p_offices uuid[] default '{}')
returns void language plpgsql security definer set search_path = public as $$
declare v_office uuid; v_module text := case p_type when 'Customer' then 'customers' when 'Supplier' then 'suppliers' end;
begin
  if v_module is null then raise exception 'Party type must be Customer or Supplier'; end if;
  if p_sharing not in ('office', 'selected', 'organization') then raise exception 'Sharing must be office, selected or organization'; end if;
  if p_type = 'Customer' then select office_id into v_office from public.customers where id = p_id;
  else select office_id into v_office from public.suppliers where id = p_id; end if;
  if v_office is null then raise exception '% not found', p_type; end if;
  if not public.can_in(v_office, v_module, 'edit') then raise exception 'Permission denied' using errcode = '42501'; end if;
  if p_sharing = 'selected' and cardinality(coalesce(p_offices, '{}')) = 0 then raise exception 'Choose at least one office to share with'; end if;
  if exists (select 1 from unnest(coalesce(p_offices, '{}')) o where not exists (select 1 from public.companies c where c.id = o)) then
    raise exception 'Unknown office in the share list';
  end if;
  perform set_config('erp.party_sharing', 'on', true);
  if p_type = 'Customer' then update public.customers set sharing = p_sharing where id = p_id;
  else update public.suppliers set sharing = p_sharing where id = p_id; end if;
  perform set_config('erp.party_sharing', '', true);
  delete from public.party_office_shares where (p_type = 'Customer' and customer_id = p_id) or (p_type = 'Supplier' and supplier_id = p_id);
  if p_sharing = 'selected' then
    insert into public.party_office_shares (customer_id, supplier_id, company_id)
    select case when p_type = 'Customer' then p_id end, case when p_type = 'Supplier' then p_id end, o
    from (select distinct unnest(p_offices) o) x where o <> v_office;
  end if;
end $$;
revoke execute on function public.set_party_sharing(text, uuid, text, uuid[]) from anon, public;
grant execute on function public.set_party_sharing(text, uuid, text, uuid[]) to authenticated;

-- ---------------------------------------------------------------------
-- 2. Parties can only be used in offices that can see them
-- ---------------------------------------------------------------------
create or replace function public.trg_party_available() returns trigger
language plpgsql security definer set search_path = public as $$
declare j jsonb := to_jsonb(new); o jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) end; v_company uuid := (j->>'company_id')::uuid;
begin
  if j ? 'supplier_id' and j->>'supplier_id' is not null
     and (o is null or o->>'supplier_id' is distinct from j->>'supplier_id' or o->>'company_id' is distinct from j->>'company_id')
     and not (v_company = any(public.party_office_ids('Supplier', (j->>'supplier_id')::uuid))) then
    raise exception 'This supplier is not shared with this office';
  end if;
  if j ? 'customer_id' and j->>'customer_id' is not null
     and (o is null or o->>'customer_id' is distinct from j->>'customer_id' or o->>'company_id' is distinct from j->>'company_id')
     and not (v_company = any(public.party_office_ids('Customer', (j->>'customer_id')::uuid))) then
    raise exception 'This client is not shared with this office';
  end if;
  return new;
end $$;
revoke execute on function public.trg_party_available() from anon, authenticated, public;
do $$
declare t text;
begin
  foreach t in array array['invoices', 'expenses', 'recurring_expenses', 'work_orders', 'maintenance_records', 'accidents',
                           'oil_changes', 'tyres', 'tyre_events', 'fixed_assets'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_party_available', t);
    execute format('create trigger %I before insert or update on public.%I for each row execute function public.trg_party_available()', t || '_party_available', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 3. Office moves only through transfer_to_office()
-- ---------------------------------------------------------------------
create table if not exists public.office_transfers (
  id              uuid primary key default gen_random_uuid(),
  entity          text not null check (entity in ('vehicle', 'employee', 'client', 'supplier')),
  record_id       uuid not null,
  record_label    text,
  from_company_id uuid not null references public.companies(id) on delete restrict,
  to_company_id   uuid not null references public.companies(id) on delete restrict,
  effective_date  date not null default current_date,
  reason          text not null check (btrim(reason) <> ''),
  details         jsonb not null default '{}'::jsonb,
  transferred_by  uuid references public.profiles(id) on delete set null default auth.uid(),
  transferred_at  timestamptz not null default now(),
  check (from_company_id <> to_company_id)
);
create index if not exists office_transfers_record on public.office_transfers (entity, record_id, transferred_at desc);
alter table public.office_transfers enable row level security;
alter table public.office_transfers force row level security;
revoke all on public.office_transfers from anon;
revoke insert, update, delete on public.office_transfers from authenticated;
grant select on public.office_transfers to authenticated;
drop policy if exists office_transfers_select on public.office_transfers;
create policy office_transfers_select on public.office_transfers for select to authenticated using (
  from_company_id = any((select public.my_company_ids())::uuid[]) or to_company_id = any((select public.my_company_ids())::uuid[]));

create or replace function public.trg_block_office_move() returns trigger
language plpgsql security definer set search_path = public as $$
declare j jsonb := to_jsonb(new); o jsonb := to_jsonb(old); col text := case when tg_table_name in ('customers', 'suppliers') then 'office_id' else 'company_id' end;
begin
  if j->>col is distinct from o->>col and auth.uid() is not null
     and coalesce(current_setting('erp.office_transfer', true), '') <> 'on' then
    raise exception 'Use "Transfer to office" to move this record to another office (the move is audited)';
  end if;
  if tg_table_name in ('customers', 'suppliers') and j->>'sharing' is distinct from o->>'sharing' and auth.uid() is not null
     and coalesce(current_setting('erp.party_sharing', true), '') <> 'on' then
    raise exception 'Change sharing with set_party_sharing()';
  end if;
  return new;
end $$;
revoke execute on function public.trg_block_office_move() from anon, authenticated, public;
do $$
declare t text;
begin
  foreach t in array array['vehicles', 'employees', 'customers', 'suppliers'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_block_office_move', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.trg_block_office_move()', t || '_block_office_move', t);
  end loop;
end $$;

insert into public.account_templates (code, name, category, subcategory, description, is_system, sort_order)
values ('1600', 'Inter-Office Current Account', 'Asset', 'Inter-office', 'Balances between offices (asset transfers). Nets to zero across the organization.', true, 160)
on conflict (code) do nothing;

-- journal lines from [account, side, amount] triples, skipping zero amounts
create or replace function public._je_lines(p text[]) returns jsonb
language sql immutable set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('account_code', p[i][1], p[i][2], p[i][3]::numeric)), '[]'::jsonb)
  from generate_subscripts(p, 1) i where p[i][3]::numeric <> 0
$$;
revoke execute on function public._je_lines(text[]) from anon, authenticated, public;

create or replace function public.transfer_to_office(p_entity text, p_id uuid, p_to uuid, p_reason text, p_effective date default current_date)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_module text := case p_entity when 'vehicle' then 'vehicles' when 'employee' then 'hr' when 'client' then 'customers' when 'supplier' then 'suppliers' end;
  v_from uuid; v_label text; v_id uuid; v_details jsonb := '{}'::jsonb; a public.fixed_assets; v_nbv numeric; v_n int;
  v_from_name text; v_to_name text;
begin
  if v_module is null then raise exception 'Unknown record type %', p_entity; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'A reason is required for an office transfer'; end if;
  if p_effective is null then raise exception 'Effective date is required'; end if;
  select name into v_to_name from public.companies where id = p_to and active;
  if v_to_name is null then raise exception 'Destination office not found or inactive'; end if;

  case p_entity
    when 'vehicle' then select company_id, plate_number into v_from, v_label from public.vehicles where id = p_id for update;
    when 'employee' then select company_id, name || ' (' || employee_code || ')' into v_from, v_label from public.employees where id = p_id for update;
    when 'client' then select office_id, name into v_from, v_label from public.customers where id = p_id for update;
    else select office_id, name into v_from, v_label from public.suppliers where id = p_id for update;
  end case;
  if v_from is null then raise exception 'Record not found'; end if;
  if v_from = p_to then raise exception 'The record is already in this office'; end if;
  if not public.can_in(v_from, v_module, 'edit') or not public.can_in(p_to, v_module, 'create') then
    raise exception 'Permission denied: you need edit rights in the current office and create rights in the destination office' using errcode = '42501';
  end if;
  select name into v_from_name from public.companies where id = v_from;

  perform set_config('erp.office_transfer', 'on', true);
  if p_entity = 'vehicle' then
    select count(*) into v_n from public.work_orders where vehicle_id = p_id and status not in ('Completed', 'Cancelled');
    if v_n > 0 then raise exception 'Close or cancel the vehicle''s % open work order(s) first', v_n; end if;
    update public.vehicles set company_id = p_to where id = p_id;
    -- mounted tyres travel with the vehicle; their past events stay in the old office
    update public.tyres set company_id = p_to where vehicle_id = p_id and status not in ('Replaced', 'Scrapped');
    get diagnostics v_n = row_count;
    v_details := v_details || jsonb_build_object('tyres_moved', v_n);
    -- drivers of the old office lose the assignment
    update public.employees set assigned_vehicle_id = null where assigned_vehicle_id = p_id and company_id <> p_to;
    get diagnostics v_n = row_count;
    v_details := v_details || jsonb_build_object('driver_assignments_cleared', v_n);
    -- the vehicle's fixed asset moves at book value through the inter-office account
    for a in select * from public.fixed_assets where vehicle_id = p_id and company_id = v_from and status <> 'Disposed' loop
      perform public.ensure_system_account(v_from, '1600', 'Inter-Office Current Account', 'Asset', 'Inter-office');
      perform public.ensure_system_account(p_to, '1600', 'Inter-Office Current Account', 'Asset', 'Inter-office');
      perform public.ensure_system_account(p_to, a.gl_asset_account, (select name from public.account_templates where code = a.gl_asset_account), 'Asset', 'Fixed Assets');
      perform public.ensure_system_account(p_to, a.gl_accum_dep_account, (select name from public.account_templates where code = a.gl_accum_dep_account), 'Asset', 'Fixed Assets');
      v_nbv := round(a.purchase_cost - a.accumulated_depreciation, 3);
      perform public.post_journal_entry(v_from, p_effective, 'Transfer of ' || a.name || ' to ' || v_to_name,
        public._je_lines(array[['1600', 'debit', v_nbv::text], [a.gl_accum_dep_account, 'debit', round(a.accumulated_depreciation, 3)::text],
                               [a.gl_asset_account, 'credit', round(a.purchase_cost, 3)::text]]),
        null, 'Transfer', a.id);
      perform public.post_journal_entry(p_to, p_effective, 'Transfer of ' || a.name || ' from ' || v_from_name,
        public._je_lines(array[[a.gl_asset_account, 'debit', round(a.purchase_cost, 3)::text], [a.gl_accum_dep_account, 'credit', round(a.accumulated_depreciation, 3)::text],
                               ['1600', 'credit', v_nbv::text]]),
        null, 'Transfer', a.id);
      update public.fixed_assets set company_id = p_to where id = a.id;
      v_details := v_details || jsonb_build_object('fixed_asset', a.asset_code, 'book_value', v_nbv);
    end loop;
    insert into public.vehicle_timeline (company_id, vehicle_id, date, title, description, category, reference_type)
    values (p_to, p_id, p_effective, 'Transferred from ' || v_from_name, btrim(p_reason), 'Transfer', 'office_transfer');
  elsif p_entity = 'employee' then
    update public.employees set company_id = p_to,
      assigned_vehicle_id = case when assigned_vehicle_id is not null
                                  and (select company_id from public.vehicles where id = assigned_vehicle_id) <> p_to then null
                                 else assigned_vehicle_id end
    where id = p_id;
  elsif p_entity = 'client' then
    update public.customers set office_id = p_to where id = p_id;
    delete from public.party_office_shares where customer_id = p_id and company_id = p_to;
  else
    update public.suppliers set office_id = p_to where id = p_id;
    delete from public.party_office_shares where supplier_id = p_id and company_id = p_to;
  end if;
  perform set_config('erp.office_transfer', '', true);

  insert into public.office_transfers (entity, record_id, record_label, from_company_id, to_company_id, effective_date, reason, details)
  values (p_entity, p_id, v_label, v_from, p_to, p_effective, btrim(p_reason), v_details)
  returning id into v_id;
  return v_id;
end $$;
revoke execute on function public.transfer_to_office(text, uuid, uuid, text, date) from anon, public;
grant execute on function public.transfer_to_office(text, uuid, uuid, text, date) to authenticated;

drop trigger if exists office_transfers_audit on public.office_transfers;
create trigger office_transfers_audit after insert on public.office_transfers for each row execute function public.trg_audit();
drop trigger if exists party_office_shares_audit on public.party_office_shares;
create trigger party_office_shares_audit after insert or delete on public.party_office_shares for each row execute function public.trg_audit();

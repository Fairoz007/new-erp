-- Phase 4: client & supplier registration.
--  * registration approval: when the organization requires it, a client/supplier created by a user
--    without approve rights starts Pending; it cannot be used on any transaction until approved
--    with review_party() (approve rights in its home office; not the person who submitted it)
--  * duplicates blocked: VAT number, CR number and email are unique per record type (normalised;
--    rejected registrations do not count). Existing duplicates are reported by party_duplicates()
--  * opening balances: the free-typed opening_balance column is no longer writable from the app
--    (it never reached the ledger). Opening balances are posted with post_opening_party_balance();
--    v_party_summary no longer counts both for the same party
--  * client / supplier contracts with rate cards; contract_rate() picks the rate for an invoice line

-- ---------------------------------------------------------------------
-- 1. Registration status
-- ---------------------------------------------------------------------
alter table public.organizations add column if not exists party_approval_required boolean not null default false;

do $$
declare t text;
begin
  foreach t in array array['customers', 'suppliers'] loop
    execute format('alter table public.%I add column if not exists cr_number text', t);
    execute format($f$alter table public.%I add column if not exists registration_status text not null default 'Approved'
                    check (registration_status in ('Pending', 'Approved', 'Rejected'))$f$, t);
    execute format('alter table public.%I add column if not exists submitted_by uuid references public.profiles(id) on delete set null', t);
    execute format('alter table public.%I add column if not exists reviewed_by uuid references public.profiles(id) on delete set null', t);
    execute format('alter table public.%I add column if not exists reviewed_at timestamptz', t);
    execute format('alter table public.%I add column if not exists review_note text', t);
    execute format('create index if not exists %I on public.%I (registration_status) where registration_status <> ''Approved''', t || '_registration_pending', t);
  end loop;
end $$;

create or replace function public.trg_party_registration() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_module text := tg_table_name; v_required boolean;
begin
  select coalesce(party_approval_required, false) into v_required from public.organizations limit 1;
  if tg_op = 'INSERT' then
    new.submitted_by := coalesce(new.submitted_by, auth.uid());
    if auth.uid() is null then
      new.registration_status := coalesce(new.registration_status, 'Approved');      -- server / migration
    elsif coalesce(v_required, false) and not public.can_in(new.office_id, v_module, 'approve') then
      new.registration_status := 'Pending';
      new.reviewed_by := null; new.reviewed_at := null; new.review_note := null;
    else
      new.registration_status := 'Approved';
      new.reviewed_by := auth.uid(); new.reviewed_at := now();
    end if;
    return new;
  end if;
  -- UPDATE
  if new.registration_status is distinct from old.registration_status and auth.uid() is not null
     and coalesce(current_setting('erp.party_review', true), '') <> 'on' then
    raise exception 'Use Approve / Reject to change the registration status';
  end if;
  if new.reviewed_by is distinct from old.reviewed_by and auth.uid() is not null
     and coalesce(current_setting('erp.party_review', true), '') <> 'on' then
    raise exception 'Use Approve / Reject to change the registration status';
  end if;
  -- a rejected registration that is corrected goes back to the queue
  if old.registration_status = 'Rejected' and auth.uid() is not null
     and coalesce(current_setting('erp.party_review', true), '') <> 'on' then
    new.registration_status := 'Pending';
    new.reviewed_by := null; new.reviewed_at := null;
  end if;
  return new;
end $$;
revoke execute on function public.trg_party_registration() from anon, authenticated, public;
drop trigger if exists customers_b_registration on public.customers;
create trigger customers_b_registration before insert or update on public.customers for each row execute function public.trg_party_registration();
drop trigger if exists suppliers_b_registration on public.suppliers;
create trigger suppliers_b_registration before insert or update on public.suppliers for each row execute function public.trg_party_registration();

create or replace function public.review_party(p_type text, p_id uuid, p_decision text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_table text; v_module text; v_office uuid; v_by uuid; v_status text; v_name text;
begin
  v_table := case p_type when 'Customer' then 'customers' when 'Supplier' then 'suppliers' end;
  if v_table is null then raise exception 'Party type must be Customer or Supplier'; end if;
  v_module := v_table;
  if p_decision not in ('Approved', 'Rejected') then raise exception 'Decision must be Approved or Rejected'; end if;
  execute format('select office_id, submitted_by, registration_status, name from public.%I where id = $1 for update', v_table)
    into v_office, v_by, v_status, v_name using p_id;
  if v_office is null then raise exception '% not found', p_type; end if;
  if not public.can_in(v_office, v_module, 'approve') then raise exception 'Permission denied' using errcode = '42501'; end if;
  if v_status <> 'Pending' then raise exception 'Only pending registrations can be reviewed (this one is %)', v_status; end if;
  if v_by = auth.uid() and not public.is_super_admin() then
    raise exception 'You cannot approve or reject a registration you submitted';
  end if;
  if p_decision = 'Rejected' and coalesce(btrim(p_note), '') = '' then raise exception 'A reason is required to reject'; end if;
  perform set_config('erp.party_review', 'on', true);
  execute format('update public.%I set registration_status = $1, reviewed_by = auth.uid(), reviewed_at = now(), review_note = nullif(btrim($2), '''') where id = $3', v_table)
    using p_decision, p_note, p_id;
  perform set_config('erp.party_review', '', true);
  if v_by is not null then
    insert into public.notifications (company_id, user_id, type, title, message, severity, link, reference_id)
    values (v_office, v_by, 'party_review',
            case p_type when 'Customer' then 'Client ' else 'Supplier ' end || lower(p_decision),
            v_name || case when p_decision = 'Rejected' then ': ' || btrim(p_note) else ' can now be used.' end,
            case when p_decision = 'Approved' then 'success' else 'warning' end,
            case p_type when 'Customer' then '#customer-detail?id=' else '#supplier-detail?id=' end || p_id, p_id);
  end if;
end $$;
revoke execute on function public.review_party(text, uuid, text, text) from anon, public;
grant execute on function public.review_party(text, uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- 2. Duplicates: VAT, CR and email unique per record type
-- ---------------------------------------------------------------------
create or replace function public.norm_ident(p text) returns text
language sql immutable set search_path = public as $$
  select nullif(upper(regexp_replace(coalesce(p, ''), '[\s\-./]', '', 'g')), '')
$$;
create or replace function public.norm_email(p text) returns text
language sql immutable set search_path = public as $$ select nullif(lower(btrim(coalesce(p, ''))), '') $$;
-- used by expression indexes, so every role that writes the tables needs execute
grant execute on function public.norm_ident(text), public.norm_email(text) to authenticated;

create index if not exists customers_vat_norm on public.customers (public.norm_ident(vat_number));
create index if not exists customers_cr_norm on public.customers (public.norm_ident(cr_number));
create index if not exists customers_email_norm on public.customers (public.norm_email(email));
create index if not exists suppliers_vat_norm on public.suppliers (public.norm_ident(vat_number));
create index if not exists suppliers_cr_norm on public.suppliers (public.norm_ident(cr_number));
create index if not exists suppliers_email_norm on public.suppliers (public.norm_email(email));

create or replace function public.trg_party_duplicates() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_code text; v_noun text := case tg_table_name when 'customers' then 'client' else 'supplier' end;
        v_code_col text := case tg_table_name when 'customers' then 'customer_code' else 'supplier_code' end;
begin
  if new.registration_status = 'Rejected' then return new; end if;
  if public.norm_ident(new.vat_number) is not null
     and (tg_op = 'INSERT' or public.norm_ident(new.vat_number) is distinct from public.norm_ident(old.vat_number) or old.registration_status = 'Rejected') then
    perform pg_advisory_xact_lock(hashtext(tg_table_name || ':vat:' || public.norm_ident(new.vat_number)));
    execute format('select %I from public.%I where id <> $1 and registration_status <> ''Rejected'' and public.norm_ident(vat_number) = public.norm_ident($2) limit 1', v_code_col, tg_table_name)
      into v_code using new.id, new.vat_number;
    if v_code is not null then raise exception 'A % with VAT number % is already registered (%)', v_noun, btrim(new.vat_number), v_code using errcode = '23505'; end if;
  end if;
  if public.norm_ident(new.cr_number) is not null
     and (tg_op = 'INSERT' or public.norm_ident(new.cr_number) is distinct from public.norm_ident(old.cr_number) or old.registration_status = 'Rejected') then
    perform pg_advisory_xact_lock(hashtext(tg_table_name || ':cr:' || public.norm_ident(new.cr_number)));
    execute format('select %I from public.%I where id <> $1 and registration_status <> ''Rejected'' and public.norm_ident(cr_number) = public.norm_ident($2) limit 1', v_code_col, tg_table_name)
      into v_code using new.id, new.cr_number;
    if v_code is not null then raise exception 'A % with CR number % is already registered (%)', v_noun, btrim(new.cr_number), v_code using errcode = '23505'; end if;
  end if;
  if public.norm_email(new.email) is not null
     and (tg_op = 'INSERT' or public.norm_email(new.email) is distinct from public.norm_email(old.email) or old.registration_status = 'Rejected') then
    perform pg_advisory_xact_lock(hashtext(tg_table_name || ':email:' || public.norm_email(new.email)));
    execute format('select %I from public.%I where id <> $1 and registration_status <> ''Rejected'' and public.norm_email(email) = public.norm_email($2) limit 1', v_code_col, tg_table_name)
      into v_code using new.id, new.email;
    if v_code is not null then raise exception 'A % with email % is already registered (%)', v_noun, btrim(new.email), v_code using errcode = '23505'; end if;
  end if;
  return new;
end $$;
revoke execute on function public.trg_party_duplicates() from anon, authenticated, public;
-- "zy": after the code is assigned and the registration status is set, before custom fields
drop trigger if exists customers_zy_duplicates on public.customers;
create trigger customers_zy_duplicates before insert or update on public.customers for each row execute function public.trg_party_duplicates();
drop trigger if exists suppliers_zy_duplicates on public.suppliers;
create trigger suppliers_zy_duplicates before insert or update on public.suppliers for each row execute function public.trg_party_duplicates();

-- Existing duplicates (data entered before this check existed), for the review screen
create or replace function public.party_duplicates(p_type text)
returns table (field text, value text, codes text[], names text[])
language plpgsql stable security definer set search_path = public as $$
declare v_table text := case p_type when 'Customer' then 'customers' when 'Supplier' then 'suppliers' end;
        v_code text := case p_type when 'Customer' then 'customer_code' else 'supplier_code' end;
begin
  if v_table is null then raise exception 'Party type must be Customer or Supplier'; end if;
  if not public.has_perm(v_table, 'view') then raise exception 'Permission denied' using errcode = '42501'; end if;
  return query execute format($q$
    select f, v, array_agg(code order by code), array_agg(nm order by code) from (
      select 'VAT number' f, public.norm_ident(vat_number) v, %1$I code, name nm from public.%2$I where registration_status <> 'Rejected'
      union all select 'CR number', public.norm_ident(cr_number), %1$I, name from public.%2$I where registration_status <> 'Rejected'
      union all select 'Email', public.norm_email(email), %1$I, name from public.%2$I where registration_status <> 'Rejected'
    ) x where v is not null group by f, v having count(*) > 1 order by f, v$q$, v_code, v_table);
end $$;
revoke execute on function public.party_duplicates(text) from anon, public;
grant execute on function public.party_duplicates(text) to authenticated;

-- ---------------------------------------------------------------------
-- 3. Parties must be approved (and shared) to be used
-- ---------------------------------------------------------------------
create or replace function public.trg_party_available() returns trigger
language plpgsql security definer set search_path = public as $$
declare j jsonb := to_jsonb(new); o jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) end; v_company uuid := (j->>'company_id')::uuid; v_status text;
begin
  if j ? 'supplier_id' and j->>'supplier_id' is not null
     and (o is null or o->>'supplier_id' is distinct from j->>'supplier_id' or o->>'company_id' is distinct from j->>'company_id') then
    if not (v_company = any(public.party_office_ids('Supplier', (j->>'supplier_id')::uuid))) then
      raise exception 'This supplier is not shared with this office';
    end if;
    select registration_status into v_status from public.suppliers where id = (j->>'supplier_id')::uuid;
    if v_status <> 'Approved' then raise exception 'This supplier''s registration is %; it cannot be used yet', lower(v_status); end if;
  end if;
  if j ? 'customer_id' and j->>'customer_id' is not null
     and (o is null or o->>'customer_id' is distinct from j->>'customer_id' or o->>'company_id' is distinct from j->>'company_id') then
    if not (v_company = any(public.party_office_ids('Customer', (j->>'customer_id')::uuid))) then
      raise exception 'This client is not shared with this office';
    end if;
    select registration_status into v_status from public.customers where id = (j->>'customer_id')::uuid;
    if v_status <> 'Approved' then raise exception 'This client''s registration is %; it cannot be used yet', lower(v_status); end if;
  end if;
  return new;
end $$;
revoke execute on function public.trg_party_available() from anon, authenticated, public;

-- ---------------------------------------------------------------------
-- 4. Opening balances only through the ledger
-- ---------------------------------------------------------------------
create or replace function public.trg_party_opening_balance_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if (tg_op = 'INSERT' and coalesce(new.opening_balance, 0) <> 0)
     or (tg_op = 'UPDATE' and new.opening_balance is distinct from old.opening_balance) then
    raise exception 'Opening balances are posted to the ledger: use "Post opening balance" on the record (Finance)';
  end if;
  return new;
end $$;
revoke execute on function public.trg_party_opening_balance_guard() from anon, authenticated, public;
drop trigger if exists customers_opening_guard on public.customers;
create trigger customers_opening_guard before insert or update on public.customers for each row execute function public.trg_party_opening_balance_guard();
drop trigger if exists suppliers_opening_guard on public.suppliers;
create trigger suppliers_opening_guard before insert or update on public.suppliers for each row execute function public.trg_party_opening_balance_guard();

-- the legacy memo balance counts only for parties without a posted opening invoice
create or replace view public.v_party_summary with (security_invoker = true) as
select 'Supplier'::public.party_type as party_type, s.id as party_id,
       case when bool_or(i.reference_number = 'OPENING' or i.notes = 'Opening balance at go-live') then 0::numeric(14,3) else s.opening_balance end as opening_balance,
       coalesce(sum(i.grand_total) filter (where not i.is_credit_note), 0)        as total_invoiced,
       coalesce(sum(i.amount_paid) filter (where not i.is_credit_note), 0)        as total_paid,
       coalesce(sum(i.grand_total) filter (where i.is_credit_note), 0)            as total_credited,
       coalesce(sum(i.outstanding_amount) filter (where not i.is_credit_note), 0) as outstanding,
       count(i.id) filter (where not i.is_credit_note)                            as invoice_count,
       case when bool_or(i.reference_number = 'OPENING' or i.notes = 'Opening balance at go-live') then 0 else s.opening_balance end
         + coalesce(sum(i.outstanding_amount) filter (where not i.is_credit_note), 0) as current_balance
from public.suppliers s
left join public.invoices i on i.supplier_id = s.id and i.approval_status = 'Approved'
group by s.id
union all
select 'Customer'::public.party_type, c.id,
       case when bool_or(i.reference_number = 'OPENING' or i.notes = 'Opening balance at go-live') then 0::numeric(14,3) else c.opening_balance end,
       coalesce(sum(i.grand_total) filter (where not i.is_credit_note), 0),
       coalesce(sum(i.amount_paid) filter (where not i.is_credit_note), 0),
       coalesce(sum(i.grand_total) filter (where i.is_credit_note), 0),
       coalesce(sum(i.outstanding_amount) filter (where not i.is_credit_note), 0),
       count(i.id) filter (where not i.is_credit_note),
       case when bool_or(i.reference_number = 'OPENING' or i.notes = 'Opening balance at go-live') then 0 else c.opening_balance end
         + coalesce(sum(i.outstanding_amount) filter (where not i.is_credit_note), 0)
from public.customers c
left join public.invoices i on i.customer_id = c.id and i.approval_status = 'Approved'
group by c.id;
grant select on public.v_party_summary to authenticated;

-- ---------------------------------------------------------------------
-- 5. Contracts and rate cards
-- ---------------------------------------------------------------------
create table if not exists public.contracts (
  id                 uuid primary key default gen_random_uuid(),
  company_id         uuid not null references public.companies(id) on delete restrict,
  contract_number    text,
  party_type         public.party_type not null,
  customer_id        uuid references public.customers(id) on delete restrict,
  supplier_id        uuid references public.suppliers(id) on delete restrict,
  title              text not null check (btrim(title) <> ''),
  start_date         date not null,
  end_date           date,
  status             text not null default 'Draft' check (status in ('Draft', 'Active', 'Suspended', 'Terminated')),
  contract_value     numeric(14,3) check (contract_value is null or contract_value >= 0),
  currency           text not null default 'OMR' check (currency ~ '^[A-Z]{3}$'),
  billing_cycle      text not null default 'Monthly' check (billing_cycle in ('One-off', 'Monthly', 'Quarterly', 'Annual', 'Per trip')),
  payment_terms_days integer not null default 30 check (payment_terms_days between 0 and 365),
  auto_renew         boolean not null default false,
  notice_days        integer not null default 30 check (notice_days between 0 and 365),
  document_path      text,
  notes              text,
  created_by         uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (end_date is null or end_date >= start_date),
  check ((party_type = 'Customer' and customer_id is not null and supplier_id is null)
      or (party_type = 'Supplier' and supplier_id is not null and customer_id is null)),
  unique (company_id, contract_number)
);
create index if not exists contracts_customer on public.contracts (customer_id) where customer_id is not null;
create index if not exists contracts_supplier on public.contracts (supplier_id) where supplier_id is not null;

create table if not exists public.contract_rates (
  id              uuid primary key default gen_random_uuid(),
  contract_id     uuid not null references public.contracts(id) on delete cascade,
  description     text not null check (btrim(description) <> ''),
  vehicle_type_id uuid references public.vehicle_types(id) on delete restrict,
  unit_code       text references public.units(code) on update cascade on delete restrict,
  rate            numeric(14,3) not null check (rate >= 0),
  tax_rate_id     uuid references public.tax_rates(id) on delete restrict,
  min_quantity    numeric(12,3) not null default 0 check (min_quantity >= 0),
  fee_item_id     uuid references public.fee_items(id) on delete set null,
  sort_order      integer not null default 100,
  created_at      timestamptz not null default now()
);
create index if not exists contract_rates_contract on public.contract_rates (contract_id, sort_order);

-- numbering (document_formats 'contract'), currency default, updated_at
create or replace function public.trg_contract_defaults() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.contract_number := public._assign_doc_number(new.company_id, public.doc_prefix('contract', new.company_id, new.start_date), public.doc_pad('contract'), new.contract_number);
    if new.currency is null or new.currency = 'OMR' then
      new.currency := coalesce((select currency from public.companies where id = new.company_id), new.currency);
    end if;
  else
    if new.company_id is distinct from old.company_id then raise exception 'A contract cannot move to another office'; end if;
    if new.contract_number is distinct from old.contract_number then raise exception 'The contract number cannot change'; end if;
    new.updated_at := now();
  end if;
  if new.document_path is not null and new.document_path !~ ('^' || new.company_id::text || '/') then
    raise exception 'The contract document must be a file uploaded for this office';
  end if;
  return new;
end $$;
revoke execute on function public.trg_contract_defaults() from anon, authenticated, public;
drop trigger if exists contracts_defaults on public.contracts;
create trigger contracts_defaults before insert or update on public.contracts for each row execute function public.trg_contract_defaults();
drop trigger if exists contracts_party_available on public.contracts;
create trigger contracts_party_available before insert or update on public.contracts for each row execute function public.trg_party_available();

alter table public.contracts enable row level security;
alter table public.contracts force row level security;
alter table public.contract_rates enable row level security;
alter table public.contract_rates force row level security;
revoke all on public.contracts, public.contract_rates from anon;
grant select, insert, update, delete on public.contracts, public.contract_rates to authenticated;

drop policy if exists contracts_select on public.contracts;
create policy contracts_select on public.contracts for select to authenticated
  using (company_id = any((select public.perm_company_ids('contracts', 'view'))::uuid[]));
drop policy if exists contracts_insert on public.contracts;
create policy contracts_insert on public.contracts for insert to authenticated
  with check (company_id = any((select public.perm_company_ids('contracts', 'create'))::uuid[]));
drop policy if exists contracts_update on public.contracts;
create policy contracts_update on public.contracts for update to authenticated
  using (company_id = any((select public.perm_company_ids('contracts', 'edit'))::uuid[]))
  with check (company_id = any((select public.perm_company_ids('contracts', 'edit'))::uuid[]));
drop policy if exists contracts_delete on public.contracts;
create policy contracts_delete on public.contracts for delete to authenticated
  using (company_id = any((select public.perm_company_ids('contracts', 'delete'))::uuid[]) and status = 'Draft');

drop policy if exists contract_rates_select on public.contract_rates;
create policy contract_rates_select on public.contract_rates for select to authenticated
  using (exists (select 1 from public.contracts c where c.id = contract_id
                 and c.company_id = any((select public.perm_company_ids('contracts', 'view'))::uuid[])));
drop policy if exists contract_rates_write on public.contract_rates;
create policy contract_rates_write on public.contract_rates for all to authenticated
  using (exists (select 1 from public.contracts c where c.id = contract_id
                 and c.company_id = any((select public.perm_company_ids('contracts', 'edit'))::uuid[])))
  with check (exists (select 1 from public.contracts c where c.id = contract_id
                 and c.company_id = any((select public.perm_company_ids('contracts', 'edit'))::uuid[])));

drop trigger if exists contracts_audit on public.contracts;
create trigger contracts_audit after insert or update or delete on public.contracts for each row execute function public.trg_audit();
drop trigger if exists contract_rates_audit on public.contract_rates;
create trigger contract_rates_audit after insert or update or delete on public.contract_rates for each row execute function public.trg_audit();

-- Rate for an invoice line: the active contract covering the date wins, then the default fee schedule.
create or replace function public.contract_rate(p_company uuid, p_customer uuid, p_date date, p_vehicle_type uuid default null, p_unit text default null)
returns table (source text, contract_id uuid, contract_number text, description text, rate numeric, tax_rate_id uuid, unit_code text)
language sql stable security invoker set search_path = public as $$
  (select 'contract', c.id, c.contract_number, r.description, r.rate, r.tax_rate_id, r.unit_code
   from public.contracts c join public.contract_rates r on r.contract_id = c.id
   where c.company_id = p_company and c.customer_id = p_customer and c.status = 'Active'
     and p_date >= c.start_date and (c.end_date is null or p_date <= c.end_date)
     and (p_vehicle_type is null or r.vehicle_type_id is null or r.vehicle_type_id = p_vehicle_type)
     and (p_unit is null or r.unit_code is null or r.unit_code = p_unit)
   order by (r.vehicle_type_id is not null) desc, (r.unit_code is not null) desc, r.sort_order limit 1)
  union all
  (select 'fee_schedule', null, null, f.name, f.rate, f.tax_rate_id, f.unit_code
   from public.fee_schedules s join public.fee_items f on f.schedule_id = s.id
   where s.is_default and s.active and (s.valid_from is null or p_date >= s.valid_from) and (s.valid_to is null or p_date <= s.valid_to)
     and (p_vehicle_type is null or f.vehicle_type_id is null or f.vehicle_type_id = p_vehicle_type)
     and (p_unit is null or f.unit_code is null or f.unit_code = p_unit)
   order by (f.vehicle_type_id is not null) desc, (f.unit_code is not null) desc limit 1)
  limit 1
$$;
grant execute on function public.contract_rate(uuid, uuid, date, uuid, text) to authenticated;

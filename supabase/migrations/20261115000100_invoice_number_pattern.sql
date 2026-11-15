-- Upgrade stage 9: sales invoice numbers as {n}-FT-{yyyy}, one company-wide series (decision 1).
--
-- The company's invoices are numbered <running number>-FT-<year>; the last one issued by the old
-- system is 446-FT-2026, so the first one from the app is 447-FT-2026. doc_prefix() can only build
-- <PREFIX>[-<OFFICE>][-<YEAR>]-<n> (the number last), so document_formats gets a `pattern` column:
--   {n}       the running number (padded to `padding` digits; padding 1 = no padding)
--   {yyyy}    four-digit year of the document date      {yy}  two-digit year
--   {office}  office code (only for office-scoped formats)
-- A format with a pattern is numbered from one sequence per resolved pattern, e.g. '{n}-FT-2026':
--   * scope 'organization': global_doc_sequences (one series for every office);
--   * scope 'office':        doc_sequences of the office.
-- The year is part of the key, so the series starts again at 1 in a new year (the suffix changes).
-- The sequences are rows, not Postgres sequences: the row lock serialises two people saving at once
-- and a rolled-back save gives its number back, so the series has no gaps.
--
-- Only sales_invoice gets a pattern. Every other format (credit notes CN-HO-2026-0001, purchase bills,
-- payments, ...) keeps prefix numbering, and numbers already issued never change.
--
-- Opening balances (post_opening_party_balance) are stored as invoices but are not tax invoices: they
-- now take their own numbers from a new 'opening_balance' format (OB-<OFFICE>-<YEAR>-NNNN), so they
-- never use up an FT number.

alter table public.document_formats add column if not exists pattern text;
alter table public.document_formats drop constraint if exists document_formats_pattern_check;
alter table public.document_formats add constraint document_formats_pattern_check check (
  pattern is null or (
    length(pattern) between 3 and 40
    and pattern ~ '^[A-Za-z0-9{}/-]+$'
    and (length(pattern) - length(replace(pattern, '{n}', ''))) = 3          -- exactly one {n}
    and regexp_replace(pattern, '\{(n|yyyy|yy|office)\}', '', 'g') !~ '[{}]'  -- no other tokens
  ));
comment on column public.document_formats.pattern is
  'Optional number layout with tokens {n} (running number), {yyyy}, {yy}, {office}, e.g. {n}-FT-{yyyy}. When set it replaces prefix/include_year/include_office_code; padding still applies to {n}.';

-- the pattern with every token except {n} filled in: the sequence key and the number's frame
create or replace function public._doc_pattern_key(p_pattern text, p_company uuid, p_date date) returns text
language sql stable security definer set search_path = public as $$
  select replace(replace(replace(p_pattern,
           '{yyyy}', public._doc_year(p_date)),
           '{yy}', right(public._doc_year(p_date), 2)),
           '{office}', coalesce((select upper(regexp_replace(code, '[^A-Za-z0-9]', '', 'g')) from public.companies where id = p_company), ''))
$$;

create or replace function public._doc_pattern_fmt(p_key text, p_value int, p_pad int) returns text
language sql immutable set search_path = public as $$
  select replace(p_key, '{n}', case when length(p_value::text) >= greatest(p_pad, 1) then p_value::text
                                    else lpad(p_value::text, greatest(p_pad, 1), '0') end)
$$;

-- '{n}-FT-2026' -> '^([0-9]{1,9})-FT-2026$' (only letters, digits, - and / can occur besides {n})
create or replace function public._doc_pattern_regex(p_key text) returns text
language sql immutable set search_path = public as $$
  select '^' || replace(p_key, '{n}', '([0-9]{1,9})') || '$'
$$;

-- Number for a document of a patterned format. Blank p_value: the next number of the series.
-- A supplied value that fits the pattern (import, a number typed for an old invoice) is kept and
-- moves the series past it, as _assign_doc_number does for prefixes.
create or replace function public._assign_pattern_number(p_type text, p_company uuid, p_date date, p_value text)
returns text language plpgsql security definer set search_path = public as $$
declare f public.document_formats; k text; v int; s text;
begin
  select * into f from public.document_formats where doc_type = p_type;
  k := public._doc_pattern_key(f.pattern, p_company, coalesce(p_date, current_date));
  s := case when coalesce(btrim(p_value), '') = '' then null else substring(p_value from public._doc_pattern_regex(k)) end;
  if coalesce(btrim(p_value), '') <> '' and s is null then return p_value; end if;
  if f.scope = 'organization' then
    insert into public.global_doc_sequences (prefix, last_value) values (k, coalesce(s::int, 1))
    on conflict (prefix) do update
      set last_value = case when s is null then global_doc_sequences.last_value + 1
                            else greatest(global_doc_sequences.last_value, excluded.last_value) end
    returning last_value into v;
  else
    if p_company is null then return p_value; end if;
    insert into public.doc_sequences (company_id, prefix, last_value) values (p_company, k, coalesce(s::int, 1))
    on conflict (company_id, prefix) do update
      set last_value = case when s is null then doc_sequences.last_value + 1
                            else greatest(doc_sequences.last_value, excluded.last_value) end
    returning last_value into v;
  end if;
  return coalesce(nullif(btrim(p_value), ''), public._doc_pattern_fmt(k, v, f.padding));
end $$;

revoke all on function public._doc_pattern_key(text, uuid, date), public._doc_pattern_fmt(text, int, int),
  public._doc_pattern_regex(text), public._assign_pattern_number(text, uuid, date, text) from public, anon, authenticated;

-- Number for any invoice row: credit note / sales invoice / purchase bill, by its format
create or replace function public._invoice_doc_number(p_company uuid, p_type text, p_date date, p_value text)
returns text language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.document_formats where doc_type = p_type and pattern is not null) then
    return public._assign_pattern_number(p_type, p_company, p_date, p_value);
  end if;
  return public._assign_doc_number(p_company, public.doc_prefix(p_type, p_company, p_date), public.doc_pad(p_type), p_value);
end $$;
revoke all on function public._invoice_doc_number(uuid, text, date, text) from public, anon, authenticated;

-- Same trigger as 20261112000200_organization_setup.sql; only the invoices branch changes.
create or replace function public.trg_assign_doc_number() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  case tg_table_name
    when 'vehicles' then
      new.vehicle_code := public._assign_doc_number(new.company_id, public.doc_prefix('vehicle', new.company_id), public.doc_pad('vehicle'), new.vehicle_code);
    when 'work_orders' then
      new.work_order_number := public._assign_doc_number(new.company_id, public.doc_prefix('work_order', new.company_id, new.reported_date), public.doc_pad('work_order'), new.work_order_number);
    when 'maintenance_records' then
      new.record_number := public._assign_doc_number(new.company_id, public.doc_prefix('maintenance', new.company_id, new.maintenance_date), public.doc_pad('maintenance'), new.record_number);
    when 'accidents' then
      new.accident_number := public._assign_doc_number(new.company_id, public.doc_prefix('accident', new.company_id, new.accident_date), public.doc_pad('accident'), new.accident_number);
    when 'expenses' then
      new.expense_number := public._assign_doc_number(new.company_id, public.doc_prefix('expense', new.company_id, new.date), public.doc_pad('expense'), new.expense_number);
    when 'invoices' then
      new.invoice_number := public._invoice_doc_number(new.company_id,
        case when coalesce(new.is_credit_note, false) then 'credit_note'
             when new.invoice_type = 'Sales' then 'sales_invoice' else 'purchase_invoice' end,
        new.invoice_date, new.invoice_number);
    when 'reconciliations' then
      new.reconciliation_number := public._assign_doc_number(new.company_id, public.doc_prefix('reconciliation', new.company_id, new.reconciled_date), public.doc_pad('reconciliation'), new.reconciliation_number);
    when 'fixed_assets' then
      new.asset_code := public._assign_doc_number(new.company_id, public.doc_prefix('fixed_asset', new.company_id), public.doc_pad('fixed_asset'), new.asset_code);
    when 'depreciation_runs' then
      new.batch_number := public._assign_doc_number(new.company_id, public.doc_prefix('depreciation', new.company_id, new.period), public.doc_pad('depreciation'), new.batch_number);
    when 'employees' then
      new.employee_code := public._assign_doc_number(new.company_id, public.doc_prefix('employee', new.company_id), public.doc_pad('employee'), new.employee_code);
    when 'payroll_runs' then
      if coalesce(btrim(new.payroll_number), '') = '' and new.year is not null and new.month is not null then
        new.payroll_number := 'PR-' || new.year || '-' || lpad(new.month::text, 2, '0');
      end if;
    when 'suppliers' then
      new.supplier_code := public._assign_global_doc_number(public.doc_prefix('supplier', null), public.doc_pad('supplier'), new.supplier_code);
    when 'customers' then
      new.customer_code := public._assign_global_doc_number(public.doc_prefix('customer', null), public.doc_pad('customer'), new.customer_code);
    else
      raise exception 'trg_assign_doc_number: unsupported table %', tg_table_name;
  end case;
  return new;
end $$;

-- Preview without consuming (Settings, invoice form). Same access rule as before
-- (20261113003000_security_hardening.sql); patterned formats read their own series.
create or replace function public.preview_doc_number(p_type text, p_company uuid default null) returns text
language plpgsql stable security definer set search_path = public as $$
declare f public.document_formats; k text; p text;
begin
  if not (p_company is null or auth.uid() is null or public.has_company_access(p_company)) then return null; end if;
  select * into f from public.document_formats where doc_type = p_type;
  if f.pattern is not null then
    k := public._doc_pattern_key(f.pattern, p_company, current_date);
    return public._doc_pattern_fmt(k, coalesce(case when f.scope = 'organization'
        then (select last_value from public.global_doc_sequences where prefix = k)
        else (select last_value from public.doc_sequences where company_id = p_company and prefix = k) end, 0) + 1, f.padding);
  end if;
  p := public.doc_prefix(p_type, p_company, current_date);
  return public._fmt_doc_number(p, coalesce((select last_value from public.doc_sequences where company_id = p_company and prefix = p), 0) + 1,
                                public.doc_pad(p_type));
end $$;
revoke all on function public.preview_doc_number(text, uuid) from public, anon;
grant execute on function public.preview_doc_number(text, uuid) to authenticated;

-- Opening balances: own number series, never an FT tax-invoice number
insert into public.document_formats (doc_type, label, prefix, include_year, include_office_code, padding, scope, sort_order)
values ('opening_balance', 'Opening balance', 'OB', true, true, 4, 'office', 35)
on conflict (doc_type) do nothing;

create or replace function public.post_opening_party_balance(p_company uuid, p_party_type public.party_type, p_party uuid,
  p_amount numeric, p_date date, p_due_date date default null, p_reference text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_inv uuid; v_no text;
begin
  if not public.can_in(p_company, 'invoices', 'create') or not public.can_in(p_company, 'accounting', 'create') then
    raise exception 'Permission denied' using errcode = '42501';
  end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Opening balance must be greater than zero'; end if;
  if p_date is null then raise exception 'Opening balance date is required'; end if;
  if p_party_type = 'Customer' and not exists (select 1 from public.customers where id = p_party) then raise exception 'Customer not found'; end if;
  if p_party_type = 'Supplier' and not exists (select 1 from public.suppliers where id = p_party) then raise exception 'Supplier not found'; end if;
  perform public.ensure_system_account(p_company, '3900', 'Opening Balance Equity', 'Equity', 'Equity');
  v_no := public.next_doc_number(p_company, public.doc_prefix('opening_balance', p_company, p_date), public.doc_pad('opening_balance'));
  insert into public.invoices (company_id, invoice_number, invoice_type, party_type, supplier_id, customer_id, invoice_date, due_date,
                               reference_number, notes, payment_terms_days)
  values (p_company, v_no, case p_party_type when 'Customer' then 'Sales' else 'Purchase' end::public.invoice_type, p_party_type,
          case when p_party_type = 'Supplier' then p_party end, case when p_party_type = 'Customer' then p_party end,
          p_date, coalesce(p_due_date, p_date), coalesce(nullif(btrim(p_reference), ''), 'OPENING'), 'Opening balance at go-live', 0)
  returning id into v_inv;
  insert into public.invoice_lines (invoice_id, line_no, description, quantity, unit_price, tax_rate_percentage, gl_account_code)
  values (v_inv, 1, 'Opening balance', 1, round(p_amount, 3), 0, '3900');
  perform public.post_invoice(v_inv);
  return v_inv;
end $$;
revoke execute on function public.post_opening_party_balance(uuid, public.party_type, uuid, numeric, date, date, text) from anon, public;
grant execute on function public.post_opening_party_balance(uuid, public.party_type, uuid, numeric, date, date, text) to authenticated;

-- The sales invoice format and the series' starting point (the old system's last number, 446-FT-2026)
update public.document_formats
   set pattern = '{n}-FT-{yyyy}', scope = 'organization', include_office_code = false, include_year = true, padding = 1
 where doc_type = 'sales_invoice';
insert into public.global_doc_sequences (prefix, last_value) values ('{n}-FT-2026', 446)
on conflict (prefix) do update set last_value = greatest(global_doc_sequences.last_value, 446);

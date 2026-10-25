-- =====================================================================
-- Agent C: accounting, fixed assets, depreciation, HR & payroll
--   * run_depreciation(...)  : atomic monthly depreciation run + GL posting
--   * process_payroll(...)   : atomic payroll run + balanced GL posting
--     (fixes audit item D: payroll never credited the selected bank account
--      and never booked the employer PASI contribution)
--   * guards so the ledger-affecting columns of fixed assets / runs can only
--     change through these RPCs
-- Additive only: new columns, functions, triggers and grant tightening.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Schema additions
-- ---------------------------------------------------------------------
-- Employer PASI share per payslip line (was never stored; needed for the GL entry and audits).
alter table public.payroll_items
  add column if not exists pasi_employer_contribution numeric(14,3) not null default 0
  check (pasi_employer_contribution >= 0);

-- ---------------------------------------------------------------------
-- 1. Internal helper: make sure a system account exists in a company's chart.
--    Used only for the fixed set of codes these RPCs post to by default,
--    so a company whose chart was seeded from an older template still works.
--    Not granted to clients.
-- ---------------------------------------------------------------------
create or replace function public.ensure_system_account(
  p_company uuid, p_code text, p_name text, p_category public.account_category, p_subcategory text)
returns void language sql security definer set search_path = public as $$
  insert into public.accounts (company_id, code, name, category, subcategory, is_system)
  values (p_company, p_code, p_name, p_category, p_subcategory, true)
  on conflict (company_id, code) do nothing
$$;
revoke execute on function public.ensure_system_account(uuid, text, text, public.account_category, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. Depreciation
-- ---------------------------------------------------------------------
-- Monthly depreciation for one company and one calendar month.
-- Methods (per asset, monthly):
--   Straight-Line     : (cost - salvage) / (useful_life_years * 12)
--   Reducing Balance  : book_value * annual_rate% / 12   (rate 0 -> 100/useful_life)
--   Double Declining  : book_value * (2 / useful_life_years) / 12
-- Every amount is capped so book value never drops below salvage.
create or replace function public.run_depreciation(
  p_company uuid, p_period date, p_notes text default null, p_post_gl boolean default true)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_period   date;
  v_end      date;
  v_label    text;
  v_run      uuid;
  v_total    numeric(14,3) := 0;
  v_count    integer := 0;
  v_je       uuid;
  v_lines    jsonb;
  v_missing  text;
  a          record;
  v_bv       numeric;
  v_room     numeric;
  v_amt      numeric(14,3);
  v_rate     numeric;
begin
  if p_company is null or p_period is null then raise exception 'Company and period are required'; end if;
  if not public.has_company_access(p_company) or not public.has_perm('fixed-assets', 'create') then
    raise exception 'Permission denied';
  end if;
  if p_post_gl and not public.has_perm('accounting', 'create') then
    raise exception 'Permission denied: posting to the general ledger requires accounting rights';
  end if;

  v_period := date_trunc('month', p_period)::date;
  v_end    := (v_period + interval '1 month' - interval '1 day')::date;
  v_label  := to_char(v_period, 'FMMonth YYYY');
  if v_period > date_trunc('month', current_date)::date then
    raise exception 'Cannot run depreciation for a future period (%)', v_label;
  end if;
  if exists (select 1 from public.depreciation_runs where company_id = p_company and period = v_period) then
    raise exception 'Depreciation already run for % in this company', v_label;
  end if;

  -- Header first: the unique (company_id, period) constraint also stops concurrent duplicates.
  insert into public.depreciation_runs (company_id, batch_number, period, period_label, run_date, notes, status)
  values (p_company, public.next_doc_number(p_company, 'DEP-' || extract(year from v_period)::int, 2),
          v_period, v_label, current_date,
          coalesce(nullif(trim(p_notes), ''), 'Monthly depreciation for ' || v_label), 'Posted')
  returning id into v_run;

  for a in
    select * from public.fixed_assets
    where company_id = p_company
      and status in ('Active', 'Under Maintenance')     -- an asset under repair is still in service
      and purchase_date <= v_end                        -- not yet acquired in this period -> no charge
    order by asset_code
    for update
  loop
    v_bv   := a.purchase_cost - a.accumulated_depreciation;
    v_room := greatest(0, v_bv - a.salvage_value);
    if v_room <= 0 then
      update public.fixed_assets set status = 'Fully Depreciated' where id = a.id;
      continue;
    end if;

    if a.depreciation_method = 'Straight-Line' then
      v_amt := round((a.purchase_cost - a.salvage_value) / (a.useful_life_years * 12), 3);
    elsif a.depreciation_method = 'Double Declining' then
      v_amt := round(v_bv * (2.0 / a.useful_life_years) / 12, 3);
    else -- Reducing Balance (written-down value)
      v_rate := coalesce(nullif(a.annual_rate_percentage, 0), 100.0 / a.useful_life_years);
      v_amt  := round(v_bv * v_rate / 100 / 12, 3);
    end if;
    v_amt := least(v_amt, round(v_room, 3));            -- salvage floor
    if v_amt <= 0 then continue; end if;

    insert into public.depreciation_run_items (run_id, asset_id, previous_book_value, depreciation_amount, new_book_value)
    values (v_run, a.id, v_bv, v_amt, v_bv - v_amt);

    update public.fixed_assets set
      accumulated_depreciation = accumulated_depreciation + v_amt,
      status = case when v_bv - v_amt <= salvage_value + 0.0005 then 'Fully Depreciated' else status end
    where id = a.id;

    v_total := v_total + v_amt;
    v_count := v_count + 1;
  end loop;

  update public.depreciation_runs set total_assets = v_count, total_amount = v_total where id = v_run;

  if p_post_gl and v_total > 0 then
    -- default accounts from the standard chart; per-asset accounts must exist in this company's chart
    perform public.ensure_system_account(p_company, '5080', 'Depreciation Expense - Motor Vehicles', 'Expense', 'Depreciation');
    perform public.ensure_system_account(p_company, '1520', 'Accumulated Depreciation - Motor Vehicles', 'Asset', 'Fixed Assets');

    select string_agg(distinct c.code, ', ') into v_missing
    from (select f.gl_expense_account code from public.depreciation_run_items i join public.fixed_assets f on f.id = i.asset_id where i.run_id = v_run
          union select f.gl_accum_dep_account from public.depreciation_run_items i join public.fixed_assets f on f.id = i.asset_id where i.run_id = v_run) c
    where not exists (select 1 from public.accounts ac where ac.company_id = p_company and ac.code = c.code);
    if v_missing is not null then
      raise exception 'GL account(s) % used by fixed assets are missing from this company''s chart of accounts', v_missing;
    end if;

    -- Dr depreciation expense / Cr accumulated depreciation, grouped by each asset's own GL accounts
    select jsonb_agg(x) into v_lines from (
      select jsonb_build_object('account_code', f.gl_expense_account, 'debit', sum(i.depreciation_amount),
                                'description', 'Depreciation ' || v_label) x
      from public.depreciation_run_items i join public.fixed_assets f on f.id = i.asset_id
      where i.run_id = v_run group by f.gl_expense_account
      union all
      select jsonb_build_object('account_code', f.gl_accum_dep_account, 'credit', sum(i.depreciation_amount),
                                'description', 'Accumulated depreciation ' || v_label)
      from public.depreciation_run_items i join public.fixed_assets f on f.id = i.asset_id
      where i.run_id = v_run group by f.gl_accum_dep_account
    ) s;

    v_je := public.post_journal_entry(p_company, v_end,
              'Depreciation for ' || v_label || ' (' || v_count || ' assets)', v_lines,
              (select batch_number from public.depreciation_runs where id = v_run), 'Depreciation', v_run);
    update public.depreciation_runs set journal_entry_id = v_je where id = v_run;
  end if;

  return v_run;
end $$;

-- ---------------------------------------------------------------------
-- 3. Payroll
-- ---------------------------------------------------------------------
-- One payroll per company and month. Eligible: Active / Probation employees who joined
-- on or before the last day of the month. PASI is computed on basic salary (as before):
--   employee share = basic * pasi_employee_pct / 100  (deducted from pay)
--   employer share = basic * pasi_employer_pct / 100  (company cost)
-- GL (balanced by construction: gross + er = (ee + er) + net):
--   Dr 5070 salaries expense        gross
--   Dr 5075 PASI employer expense   er
--   Cr 2040 PASI payable            ee + er
--   Cr <bank GL> (bank given)       net      | Cr 2050 salaries payable (no bank)
create or replace function public.process_payroll(
  p_company uuid, p_year integer, p_month integer, p_payment_date date default null,
  p_bank_account uuid default null, p_post_gl boolean default true)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_period date; v_end date; v_label text; v_run uuid; v_je uuid; v_bank public.bank_accounts;
  v_gross numeric; v_ee numeric; v_er numeric; v_net numeric; v_count int; v_net_code text;
begin
  if p_company is null or p_year is null or p_month is null then raise exception 'Company, year and month are required'; end if;
  if not public.has_company_access(p_company) or not public.has_perm('payroll', 'create') then
    raise exception 'Permission denied';
  end if;
  if p_post_gl and not public.has_perm('accounting', 'create') then
    raise exception 'Permission denied: posting to the general ledger requires accounting rights';
  end if;
  if p_month not between 1 and 12 or p_year not between 2000 and 2100 then raise exception 'Invalid payroll period'; end if;

  v_period := make_date(p_year, p_month, 1);
  v_end    := (v_period + interval '1 month' - interval '1 day')::date;
  v_label  := to_char(v_period, 'FMMonth YYYY');
  if exists (select 1 from public.payroll_runs where company_id = p_company and year = p_year and month = p_month) then
    raise exception 'Payroll already processed for % in this company', v_label;
  end if;

  if p_bank_account is not null then
    select * into v_bank from public.bank_accounts where id = p_bank_account and company_id = p_company and active;
    if not found then raise exception 'Bank account not found for this company'; end if;
  end if;

  insert into public.payroll_runs (company_id, payroll_number, month, year, status, approved_by, approved_date,
                                   payment_date, bank_account_id, notes)
  values (p_company, 'PR-' || p_year || '-' || lpad(p_month::text, 2, '0'), p_month, p_year,
          case when p_bank_account is not null then 'Paid' else 'Approved' end, auth.uid(), now(),
          coalesce(p_payment_date, v_end), p_bank_account,
          'Payroll for ' || v_label || case when p_bank_account is null then ' (net pay accrued to salaries payable)' else '' end)
  returning id into v_run;

  insert into public.payroll_items (run_id, employee_id, basic_salary, housing_allowance, transport_allowance,
                                    other_allowances, pasi_employee_deduction, pasi_employer_contribution, status)
  select v_run, e.id, e.basic_salary, e.housing_allowance, e.transport_allowance, e.other_allowances,
         round(e.basic_salary * e.pasi_employee_pct / 100, 3), round(e.basic_salary * e.pasi_employer_pct / 100, 3),
         case when p_bank_account is not null then 'Paid' else 'Processed' end
  from public.employees e
  where e.company_id = p_company and e.status in ('Active', 'Probation') and e.joining_date <= v_end;

  get diagnostics v_count = row_count;
  if v_count = 0 then raise exception 'No eligible employees for % in this company', v_label; end if;

  select sum(gross_pay), sum(pasi_employee_deduction), sum(pasi_employer_contribution), sum(net_pay)
    into v_gross, v_ee, v_er, v_net
  from public.payroll_items where run_id = v_run;

  if p_post_gl and v_gross > 0 then
    perform public.ensure_system_account(p_company, '5070', 'Driver Allowances & Logistics Staff', 'Expense', 'Operating Expense');
    perform public.ensure_system_account(p_company, '5075', 'PASI Employer Contribution Expense', 'Expense', 'Operating Expense');
    perform public.ensure_system_account(p_company, '2040', 'PASI / Social Insurance Payable', 'Liability', 'Current Liabilities');
    perform public.ensure_system_account(p_company, '2050', 'Salaries & Wages Payable', 'Liability', 'Current Liabilities');
    v_net_code := coalesce(v_bank.gl_account_code, '2050');
    if not exists (select 1 from public.accounts where company_id = p_company and code = v_net_code) then
      raise exception 'Bank GL account % is missing from this company''s chart of accounts', v_net_code;
    end if;

    v_je := public.post_journal_entry(p_company, coalesce(p_payment_date, v_end),
      'Payroll ' || v_label || ' (' || v_count || ' employees)',
      jsonb_build_array(
        jsonb_build_object('account_code', '5070', 'debit', v_gross, 'description', 'Gross salaries ' || v_label),
        jsonb_build_object('account_code', '5075', 'debit', v_er, 'description', 'Employer PASI ' || v_label),
        jsonb_build_object('account_code', '2040', 'credit', v_ee + v_er, 'description', 'PASI payable (employee + employer) ' || v_label),
        jsonb_build_object('account_code', v_net_code, 'credit', v_net,
          'description', case when p_bank_account is not null then 'Net salaries paid from ' || v_bank.bank_name
                              else 'Net salaries payable' end)),
      'PR-' || p_year || '-' || lpad(p_month::text, 2, '0'), 'Payroll', v_run);
    update public.payroll_runs set journal_entry_id = v_je where id = v_run;
  end if;

  return v_run;
end $$;

revoke execute on function public.run_depreciation(uuid, date, text, boolean) from public, anon;
revoke execute on function public.process_payroll(uuid, integer, integer, date, uuid, boolean) from public, anon;
grant execute on function public.run_depreciation(uuid, date, text, boolean) to authenticated;
grant execute on function public.process_payroll(uuid, integer, integer, date, uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- 4. Guards: ledger-affecting rows only change through the RPCs above.
--    Inside the SECURITY DEFINER RPCs current_user is the function owner,
--    so these checks only bind direct client (PostgREST) writes.
-- ---------------------------------------------------------------------
create or replace function public.trg_fixed_asset_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon')
     and new.accumulated_depreciation is distinct from old.accumulated_depreciation then
    raise exception 'Accumulated depreciation can only change through a depreciation run';
  end if;
  return new;
end $$;
create trigger fixed_assets_guard before update on public.fixed_assets
  for each row execute function public.trg_fixed_asset_guard();

-- Payroll run headers: clients may only create/keep Draft headers; paid/posted runs are immutable.
create or replace function public.trg_payroll_run_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user not in ('authenticated', 'anon') then return coalesce(new, old); end if;
  if tg_op = 'INSERT' then
    if new.status <> 'Draft' or new.journal_entry_id is not null then
      raise exception 'Payroll runs are processed with process_payroll()';
    end if;
    return new;
  end if;
  if old.journal_entry_id is not null or old.status in ('Approved', 'Paid') then
    if tg_op = 'DELETE' then raise exception 'A processed payroll run cannot be deleted'; end if;
    if new.status is distinct from old.status and not (old.status = 'Approved' and new.status = 'Paid')
       or new.journal_entry_id is distinct from old.journal_entry_id
       or new.month <> old.month or new.year <> old.year or new.company_id <> old.company_id then
      raise exception 'A processed payroll run is immutable';
    end if;
  elsif tg_op = 'UPDATE' and (new.status in ('Approved', 'Paid') or new.journal_entry_id is not null) then
    raise exception 'Payroll runs are processed with process_payroll()';
  end if;
  return coalesce(new, old);
end $$;
create trigger payroll_runs_guard before insert or update or delete on public.payroll_runs
  for each row execute function public.trg_payroll_run_guard();

-- Payslip lines and depreciation runs are written by the RPCs only.
-- (closes: payroll_items_all let any user with payroll VIEW delete payslip lines, because a
--  FOR ALL policy's USING clause is the only check applied to DELETE)
revoke insert, update, delete on public.payroll_items from authenticated;
revoke insert, update, delete on public.depreciation_runs from authenticated;

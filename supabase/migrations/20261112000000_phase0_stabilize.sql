-- =====================================================================
-- Phase 0: stabilise the ledger (fix-and-complete brief, AUDIT_REPORT.md section I).
-- Additive and idempotent. Never deletes business data.
--
--  1. can_in(office, module, action): single office-scoped permission check used by every
--     new RPC. Phase 9 redefines only this function for per-office roles.
--  2. Bank balances come from the general ledger: journal_lines.bank_account_id tags the bank
--     line of every posting; v_bank_balances = sum of tagged lines (payroll and manual journals
--     on a bank were previously ignored, audit C-11). A bank account's opening balance is posted
--     as an opening journal against 3900 Opening Balance Equity, so trial balance = bank register.
--  3. post_journal_entry: validates accounts and bank tags; client calls are always recorded
--     as source 'Manual' (audit C-14 / E-10: provenance could be forged).
--  4. Posted journals can no longer be voided in place (audit E-11); reverse_journal_entry()
--     posts a mirror entry instead.
--  5. post_invoice posts other_charges (audit E-4: AP/AR was under-credited) and refuses
--     Cancelled / Rejected invoices (audit E-5).
--  6. record_payment and process_payroll tag the bank line.
--  7. decide_approval: a requester may not approve their own request; clients can no longer
--     insert approval requests directly (audit E-8), the DEFINER triggers raise them.
--  8. Chart-of-accounts template: neutral bank naming and the accounts later phases post to.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Office-scoped permission helper
-- ---------------------------------------------------------------------
create or replace function public.can_in(p_company uuid, p_module text, p_action public.permission_action)
returns boolean language sql stable security definer set search_path = public as $$
  select p_company is not null and public.has_company_access(p_company) and public.has_perm(p_module, p_action)
$$;
revoke execute on function public.can_in(uuid, text, public.permission_action) from anon, public;
grant execute on function public.can_in(uuid, text, public.permission_action) to authenticated;

-- ---------------------------------------------------------------------
-- 8. Template accounts (before the functions that post to them)
-- ---------------------------------------------------------------------
update public.account_templates set name = 'Bank - Main Current Account' where code = '1020' and name = 'Bank - Bank Muscat Corporate';
insert into public.account_templates (code, name, category, subcategory, description, is_system, sort_order) values
  ('1000','Cash in Hand','Asset','Current Assets','Cash expenses and receipts', true, 5),
  ('1050','Prepaid Expenses','Asset','Current Assets', null, false, 45),
  ('1200','Employee Advances & Loans','Asset','Current Assets','Payroll loan / advance deductions', true, 55),
  ('1540','Office Furniture & Equipment','Asset','Fixed Assets', null, false, 95),
  ('1550','Accumulated Depreciation - Other Assets','Asset','Fixed Assets','Contra asset', false, 96),
  ('2060','End-of-Service Gratuity Provision','Liability','Long Term Liabilities','Gratuity accrual: payroll', true, 145),
  ('2070','Payroll Deductions Payable','Liability','Current Liabilities','Other payroll deductions withheld', true, 146),
  ('3900','Opening Balance Equity','Equity','Equity','Offset of opening balances entered at go-live', true, 195),
  ('4040','Bus Hire & Contract Revenue','Revenue','Operating Revenue', null, false, 225),
  ('4900','Other Charges Recovered','Revenue','Other Revenue','Sales invoice other charges', true, 240),
  ('5100','Office & Depot Rent','Expense','Operating Expense', null, false, 360),
  ('5110','Utilities (Electricity, Water, Telecom)','Expense','Operating Expense', null, false, 370),
  ('5120','Permits, Licences & Government Fees','Expense','Operating Expense', null, false, 380),
  ('5130','Office & Administrative Expenses','Expense','Operating Expense', null, false, 390),
  ('5140','End-of-Service Gratuity Expense','Expense','Operating Expense','Gratuity accrual: payroll', true, 400),
  ('5150','Overtime & Bonus Expense','Expense','Operating Expense','Payroll overtime and bonus', true, 410),
  ('5900','Other Charges on Purchases','Expense','Operating Expense','Purchase invoice other charges', true, 420),
  ('5990','Rounding Differences','Expense','Operating Expense', null, true, 430)
on conflict (code) do nothing;

-- Offices that already exist get the new template accounts (existing accounts are never changed)
do $$
declare c record;
begin
  for c in select id from public.companies loop
    perform public._seed_chart_of_accounts(c.id);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 2. Bank tagging on journal lines
-- ---------------------------------------------------------------------
alter table public.journal_lines add column if not exists bank_account_id uuid references public.bank_accounts(id) on delete restrict;
create index if not exists journal_lines_bank_idx on public.journal_lines (bank_account_id) where bank_account_id is not null;

-- Backfill: the bank line of existing payment and payroll postings
update public.journal_lines jl set bank_account_id = p.bank_account_id
from public.payments p join public.bank_accounts b on b.id = p.bank_account_id
where jl.entry_id = p.journal_entry_id and jl.account_code = b.gl_account_code and jl.bank_account_id is null;

update public.journal_lines jl set bank_account_id = r.bank_account_id
from public.payroll_runs r join public.bank_accounts b on b.id = r.bank_account_id
where jl.entry_id = r.journal_entry_id and jl.account_code = b.gl_account_code and jl.bank_account_id is null;

alter table public.journal_entries drop constraint if exists journal_entries_source_module_check;
alter table public.journal_entries add constraint journal_entries_source_module_check check (source_module in
  ('Maintenance','Invoice','Payment','Depreciation','Expense','Payroll','Manual','Opening Balance','Reversal',
   'Gratuity','Asset Disposal','Period Close','Transfer'));

-- ---------------------------------------------------------------------
-- 3. post_journal_entry
-- ---------------------------------------------------------------------
create or replace function public.post_journal_entry(p_company uuid, p_date date, p_description text, p_lines jsonb,
  p_reference text default null, p_source text default 'Manual', p_source_id uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_ctx text; v_direct boolean; v_bad text; v_source text := coalesce(p_source, 'Manual');
        v_source_id uuid := p_source_id;
begin
  -- Called straight from the API (one PL/pgSQL frame on the stack) or from another posting RPC?
  get diagnostics v_ctx = pg_context;
  v_direct := array_length(regexp_split_to_array(v_ctx, E'\n'), 1) <= 1;
  if v_direct then
    v_source := 'Manual'; v_source_id := null;          -- clients cannot forge system provenance
    if not public.can_in(p_company, 'accounting', 'create') then
      raise exception 'Permission denied' using errcode = '42501';
    end if;
  elsif auth.uid() is not null and not public.has_company_access(p_company) then
    raise exception 'Permission denied: no access to this office' using errcode = '42501';
  end if;
  if p_date is null then raise exception 'Journal date is required'; end if;
  if coalesce(btrim(p_description), '') = '' then raise exception 'Journal description is required'; end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) < 2 then
    raise exception 'A journal entry needs at least two lines';
  end if;

  select string_agg(distinct l->>'account_code', ', ') into v_bad
  from jsonb_array_elements(p_lines) l
  where not exists (select 1 from public.accounts a where a.company_id = p_company and a.code = l->>'account_code');
  if v_bad is not null then raise exception 'Unknown account code(s) for this office: %', v_bad; end if;

  if exists (select 1 from jsonb_array_elements(p_lines) l
             where coalesce((l->>'debit')::numeric, 0) < 0 or coalesce((l->>'credit')::numeric, 0) < 0
                or (coalesce((l->>'debit')::numeric, 0) > 0 and coalesce((l->>'credit')::numeric, 0) > 0)) then
    raise exception 'Each journal line must be either a positive debit or a positive credit';
  end if;

  if exists (select 1 from jsonb_array_elements(p_lines) l
             where nullif(l->>'bank_account_id', '') is not null
               and not exists (select 1 from public.bank_accounts b
                               where b.id = (l->>'bank_account_id')::uuid and b.company_id = p_company
                                 and b.gl_account_code = l->>'account_code')) then
    raise exception 'Bank account does not belong to this office or does not match the line''s GL account';
  end if;

  insert into public.journal_entries (company_id, entry_number, date, reference, description, source_module, source_id, posted_by)
  values (p_company, public.next_doc_number(p_company, 'JE-' || extract(year from p_date)::int), p_date,
          p_reference, p_description, v_source, v_source_id, auth.uid())
  returning id into v_id;
  insert into public.journal_lines (entry_id, company_id, account_code, debit, credit, description, vehicle_id, cost_centre, bank_account_id)
  select v_id, p_company, l->>'account_code', round(coalesce((l->>'debit')::numeric, 0), 3), round(coalesce((l->>'credit')::numeric, 0), 3),
         l->>'description', nullif(l->>'vehicle_id','')::uuid, l->>'cost_centre', nullif(l->>'bank_account_id','')::uuid
  from jsonb_array_elements(p_lines) l
  where coalesce((l->>'debit')::numeric, 0) > 0 or coalesce((l->>'credit')::numeric, 0) > 0;
  return v_id;   -- balance is verified by the deferred constraint trigger at commit
end $$;
revoke execute on function public.post_journal_entry(uuid, date, text, jsonb, text, text, uuid) from anon, public;
grant execute on function public.post_journal_entry(uuid, date, text, jsonb, text, text, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 2b. Bank balances from the GL; opening balances are posted
-- ---------------------------------------------------------------------
create or replace function public.trg_bank_opening_balance() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_je uuid;
begin
  if tg_op = 'UPDATE' and new.opening_balance is distinct from old.opening_balance
     and coalesce(current_setting('erp.bank_ob_adjust', true), '') <> 'on' then
    raise exception 'Change a bank opening balance with adjust_bank_opening_balance(), which posts the difference';
  end if;
  if tg_op = 'INSERT' and coalesce(new.opening_balance, 0) <> 0 then
    if not exists (select 1 from public.accounts where company_id = new.company_id and code = new.gl_account_code) then
      raise exception 'GL account % is not in this office''s chart of accounts', new.gl_account_code;
    end if;
    perform public.ensure_system_account(new.company_id, '3900', 'Opening Balance Equity', 'Equity', 'Equity');
    v_je := public.post_journal_entry(new.company_id, coalesce(new.created_at::date, current_date),
      'Opening balance ' || new.bank_name || ' ' || new.account_number,
      jsonb_build_array(
        jsonb_build_object('account_code', new.gl_account_code, 'bank_account_id', new.id,
          case when new.opening_balance > 0 then 'debit' else 'credit' end, abs(new.opening_balance)),
        jsonb_build_object('account_code', '3900',
          case when new.opening_balance > 0 then 'credit' else 'debit' end, abs(new.opening_balance))),
      null, 'Opening Balance', new.id);
  end if;
  return null;
end $$;
revoke execute on function public.trg_bank_opening_balance() from anon, authenticated, public;
drop trigger if exists bank_accounts_opening_balance on public.bank_accounts;
create trigger bank_accounts_opening_balance after insert or update of opening_balance on public.bank_accounts
  for each row execute function public.trg_bank_opening_balance();

-- Existing bank accounts with an opening balance and no opening journal: post it now (server side)
do $$
declare b record;
begin
  for b in select * from public.bank_accounts ba
           where coalesce(ba.opening_balance, 0) <> 0
             and not exists (select 1 from public.journal_entries j where j.source_module = 'Opening Balance' and j.source_id = ba.id)
             and exists (select 1 from public.accounts a where a.company_id = ba.company_id and a.code = ba.gl_account_code)
  loop
    perform public.ensure_system_account(b.company_id, '3900', 'Opening Balance Equity', 'Equity', 'Equity');
    perform public.post_journal_entry(b.company_id, b.created_at::date,
      'Opening balance ' || b.bank_name || ' ' || b.account_number,
      jsonb_build_array(
        jsonb_build_object('account_code', b.gl_account_code, 'bank_account_id', b.id,
          case when b.opening_balance > 0 then 'debit' else 'credit' end, abs(b.opening_balance)),
        jsonb_build_object('account_code', '3900',
          case when b.opening_balance > 0 then 'credit' else 'debit' end, abs(b.opening_balance))),
      null, 'Opening Balance', b.id);
  end loop;
end $$;

create or replace function public.adjust_bank_opening_balance(p_bank uuid, p_new_balance numeric)
returns uuid language plpgsql security definer set search_path = public as $$
declare b public.bank_accounts; v_delta numeric; v_je uuid;
begin
  select * into b from public.bank_accounts where id = p_bank for update;
  if not found then raise exception 'Bank account not found'; end if;
  if not public.can_in(b.company_id, 'payments', 'edit') or not public.can_in(b.company_id, 'accounting', 'create') then
    raise exception 'Permission denied' using errcode = '42501';
  end if;
  v_delta := round(coalesce(p_new_balance, 0) - b.opening_balance, 3);
  if v_delta = 0 then return null; end if;
  perform public.ensure_system_account(b.company_id, '3900', 'Opening Balance Equity', 'Equity', 'Equity');
  v_je := public.post_journal_entry(b.company_id, current_date,
    'Opening balance adjustment ' || b.bank_name || ' ' || b.account_number,
    jsonb_build_array(
      jsonb_build_object('account_code', b.gl_account_code, 'bank_account_id', b.id,
        case when v_delta > 0 then 'debit' else 'credit' end, abs(v_delta)),
      jsonb_build_object('account_code', '3900', case when v_delta > 0 then 'credit' else 'debit' end, abs(v_delta))),
    null, 'Opening Balance', b.id);
  perform set_config('erp.bank_ob_adjust', 'on', true);
  update public.bank_accounts set opening_balance = p_new_balance where id = p_bank;
  perform set_config('erp.bank_ob_adjust', '', true);
  return v_je;
end $$;
revoke execute on function public.adjust_bank_opening_balance(uuid, numeric) from anon, public;
grant execute on function public.adjust_bank_opening_balance(uuid, numeric) to authenticated;

create or replace view public.v_bank_balances with (security_invoker = true) as
select b.id, b.company_id, b.bank_name, b.account_name, b.account_number,
       coalesce((select sum(jl.debit - jl.credit)
                 from public.journal_lines jl join public.journal_entries je on je.id = jl.entry_id
                 where jl.bank_account_id = b.id and je.status = 'Posted'), 0)::numeric as current_balance
from public.bank_accounts b;
revoke all on public.v_bank_balances from anon;
revoke insert, update, delete on public.v_bank_balances from authenticated;
grant select on public.v_bank_balances to authenticated;

-- ---------------------------------------------------------------------
-- 4. Journal immutability and reversal
-- ---------------------------------------------------------------------
create or replace function public.trg_journal_immutable() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' and old.status = 'Posted' then
    raise exception 'Posted journal entries cannot be deleted; post a reversal instead';
  end if;
  if tg_op = 'UPDATE' and old.status = 'Posted' and
     (new.status <> 'Posted' or new.date <> old.date or new.company_id <> old.company_id) then
    raise exception 'Posted journal entries are immutable; post a reversal instead';
  end if;
  return coalesce(new, old);
end $$;

create or replace function public.reverse_journal_entry(p_entry uuid, p_date date default null, p_reason text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare je public.journal_entries; v_lines jsonb; v_id uuid;
begin
  select * into je from public.journal_entries where id = p_entry for update;
  if not found then raise exception 'Journal entry not found'; end if;
  if not public.can_in(je.company_id, 'accounting', 'create') then raise exception 'Permission denied' using errcode = '42501'; end if;
  if je.status <> 'Posted' then raise exception 'Only posted entries can be reversed'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'A reason is required to reverse a journal entry'; end if;
  if exists (select 1 from public.journal_entries where reverses_entry_id = p_entry) then
    raise exception 'Journal entry % has already been reversed', je.entry_number;
  end if;
  if je.source_module not in ('Manual', 'Opening Balance') then
    raise exception 'Entries created by % must be reversed from their source document (credit note, cancellation)', je.source_module;
  end if;
  select jsonb_agg(jsonb_build_object('account_code', account_code, 'debit', credit, 'credit', debit,
           'description', description, 'vehicle_id', vehicle_id, 'cost_centre', cost_centre, 'bank_account_id', bank_account_id))
    into v_lines from public.journal_lines where entry_id = p_entry;
  v_id := public.post_journal_entry(je.company_id, coalesce(p_date, current_date),
            'Reversal of ' || je.entry_number || ': ' || btrim(p_reason), v_lines, je.entry_number, 'Reversal', p_entry);
  update public.journal_entries set reverses_entry_id = p_entry where id = v_id;
  return v_id;
end $$;
revoke execute on function public.reverse_journal_entry(uuid, date, text) from anon, public;
grant execute on function public.reverse_journal_entry(uuid, date, text) to authenticated;

-- ---------------------------------------------------------------------
-- 5. post_invoice: other charges, status guard
-- ---------------------------------------------------------------------
create or replace function public.post_invoice(p_invoice uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare inv public.invoices; v_lines jsonb; v_je uuid; v_ctrl text; v_vat text; v_other text; v_dr boolean;
begin
  select * into inv from public.invoices where id = p_invoice;
  if not found then raise exception 'Invoice not found'; end if;
  if not public.has_company_access(inv.company_id) or not public.can_approve('invoice', inv.grand_total) then
    raise exception 'Permission denied' using errcode = '42501';
  end if;
  perform 1 from public.invoices where id = p_invoice for update;
  select * into inv from public.invoices where id = p_invoice;
  if inv.journal_entry_id is not null then raise exception 'Invoice already posted'; end if;
  if inv.approval_status in ('Cancelled', 'Rejected') or inv.payment_status = 'Cancelled' then
    raise exception 'A % invoice cannot be posted', lower(coalesce(nullif(inv.approval_status, 'Approved'), inv.payment_status));
  end if;
  if inv.grand_total <= 0 then raise exception 'Invoice has no lines'; end if;

  v_ctrl  := case inv.invoice_type when 'Purchase' then '2010' else '1100' end;
  v_vat   := case inv.invoice_type when 'Purchase' then '1300' else '2100' end;   -- input / output VAT
  v_other := case inv.invoice_type when 'Purchase' then '5900' else '4900' end;
  v_dr    := (inv.invoice_type = 'Purchase') <> inv.is_credit_note;               -- lines on the debit side?
  if inv.other_charges <> 0 then
    perform public.ensure_system_account(inv.company_id, v_other,
      case inv.invoice_type when 'Purchase' then 'Other Charges on Purchases' else 'Other Charges Recovered' end,
      case inv.invoice_type when 'Purchase' then 'Expense' else 'Revenue' end::public.account_category,
      case inv.invoice_type when 'Purchase' then 'Operating Expense' else 'Other Revenue' end);
  end if;

  select jsonb_agg(x) into v_lines from (
    select jsonb_build_object('account_code', g.code, case when v_dr then 'debit' else 'credit' end, g.net,
                              'vehicle_id', g.vehicle_id, 'cost_centre', g.cost_centre) x
    from (select coalesce(gl_account_code, case inv.invoice_type when 'Purchase' then '5000' else '4000' end) code,
                 vehicle_id, coalesce(cost_centre, inv.cost_centre) cost_centre,
                 round(sum(line_total - tax_amount), 3) net
          from public.invoice_lines where invoice_id = p_invoice group by 1, 2, 3) g
    where g.net <> 0
    union all
    select jsonb_build_object('account_code', v_vat, case when v_dr then 'debit' else 'credit' end, inv.tax_total)
    where inv.tax_total > 0
    union all
    select jsonb_build_object('account_code', v_other,
             case when (inv.other_charges > 0) = v_dr then 'debit' else 'credit' end, abs(inv.other_charges))
    where inv.other_charges <> 0
    union all
    select jsonb_build_object('account_code', v_ctrl, case when v_dr then 'credit' else 'debit' end, inv.grand_total)
  ) s;

  v_je := public.post_journal_entry(inv.company_id, inv.invoice_date,
            (case when inv.is_credit_note then 'Credit note ' else 'Invoice ' end) || inv.invoice_number,
            v_lines, inv.reference_number, 'Invoice', p_invoice);
  update public.invoices set journal_entry_id = v_je, approval_status = 'Approved',
         approved_by = auth.uid(), approval_date = now() where id = p_invoice;
  return v_je;
end $$;
revoke execute on function public.post_invoice(uuid) from anon, public;
grant execute on function public.post_invoice(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 6. record_payment / process_payroll tag the bank line
-- ---------------------------------------------------------------------
create or replace function public.record_payment(p_invoice uuid, p_amount numeric, p_date date, p_method text,
  p_bank_account uuid, p_reference text default null, p_cheque text default null, p_notes text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare inv public.invoices; ba public.bank_accounts; v_pay uuid; v_je uuid; v_ctrl text;
begin
  select * into inv from public.invoices where id = p_invoice;
  if not found then raise exception 'Invoice not found'; end if;
  if not public.can_in(inv.company_id, 'payments', 'create') then raise exception 'Permission denied' using errcode = '42501'; end if;
  select * into inv from public.invoices where id = p_invoice for update;   -- serialize concurrent payments
  if inv.is_credit_note or inv.payment_status = 'Cancelled' then raise exception 'Invoice cannot be paid'; end if;
  if inv.journal_entry_id is null then raise exception 'Only approved and posted invoices can be paid'; end if;
  if p_date is null then raise exception 'Payment date is required'; end if;
  if coalesce(btrim(p_method), '') = '' then raise exception 'Payment method is required'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > inv.outstanding_amount + 0.0005 then
    raise exception 'Payment amount must be between 0 and outstanding %', inv.outstanding_amount;
  end if;
  select * into ba from public.bank_accounts where id = p_bank_account and company_id = inv.company_id and active;
  if not found then raise exception 'Bank account not found for this company'; end if;

  v_ctrl := case inv.invoice_type when 'Purchase' then '2010' else '1100' end;   -- AP / AR control accounts
  v_je := public.post_journal_entry(inv.company_id, p_date, 'Payment for ' || inv.invoice_number,
    case inv.invoice_type
      when 'Purchase' then jsonb_build_array(
        jsonb_build_object('account_code', v_ctrl, 'debit', p_amount),
        jsonb_build_object('account_code', ba.gl_account_code, 'credit', p_amount, 'bank_account_id', ba.id))
      else jsonb_build_array(
        jsonb_build_object('account_code', ba.gl_account_code, 'debit', p_amount, 'bank_account_id', ba.id),
        jsonb_build_object('account_code', v_ctrl, 'credit', p_amount)) end,
    p_reference, 'Payment', p_invoice);

  insert into public.payments (company_id, payment_number, invoice_id, payment_date, amount, payment_method,
                               bank_account_id, transaction_reference, cheque_number, notes, journal_entry_id, created_by)
  values (inv.company_id, public.next_doc_number(inv.company_id, 'PAY-' || extract(year from p_date)::int),
          p_invoice, p_date, p_amount, p_method, p_bank_account, p_reference, p_cheque, p_notes, v_je, auth.uid())
  returning id into v_pay;
  return v_pay;
end $$;
revoke execute on function public.record_payment(uuid, numeric, date, text, uuid, text, text, text) from anon, public;
grant execute on function public.record_payment(uuid, numeric, date, text, uuid, text, text, text) to authenticated;

create or replace function public.trg_tag_payroll_bank_line() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- process_payroll posts the net-pay line on the bank's GL code; tag it so bank balances include payroll
  if new.journal_entry_id is not null and new.bank_account_id is not null
     and (old.journal_entry_id is distinct from new.journal_entry_id) then
    update public.journal_lines jl set bank_account_id = new.bank_account_id
    from public.bank_accounts b
    where b.id = new.bank_account_id and jl.entry_id = new.journal_entry_id
      and jl.account_code = b.gl_account_code and jl.credit > 0 and jl.bank_account_id is null;
  end if;
  return null;
end $$;
revoke execute on function public.trg_tag_payroll_bank_line() from anon, authenticated, public;
drop trigger if exists payroll_runs_tag_bank on public.payroll_runs;
create trigger payroll_runs_tag_bank after update of journal_entry_id on public.payroll_runs
  for each row execute function public.trg_tag_payroll_bank_line();

-- journal lines may be tagged after insert by the trigger above (same transaction, before posting is final)
create or replace function public.trg_journal_lines_company() returns trigger
language plpgsql set search_path = public as $$
begin
  select company_id into new.company_id from public.journal_entries where id = new.entry_id;
  if tg_op = 'UPDATE' and exists (select 1 from public.journal_entries where id = new.entry_id and status = 'Posted')
     and (new.account_code, new.debit, new.credit, new.entry_id) is distinct from (old.account_code, old.debit, old.credit, old.entry_id)
  then
    raise exception 'Lines of a posted journal entry are immutable';
  end if;
  if tg_op = 'UPDATE' and old.bank_account_id is not null and new.bank_account_id is distinct from old.bank_account_id then
    raise exception 'Lines of a posted journal entry are immutable';
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------
-- 7. Approvals
-- ---------------------------------------------------------------------
drop policy if exists approval_requests_insert on public.approval_requests;
revoke insert on public.approval_requests from authenticated;

create or replace function public.decide_approval(p_request uuid, p_action text, p_comment text)
returns void language plpgsql security definer set search_path = public as $$
declare r public.approval_requests; v_role public.user_role := public.app_role(); v_module text;
begin
  select * into r from public.approval_requests where id = p_request for update;
  if not found then raise exception 'Request not found'; end if;
  if r.status <> 'Pending' then raise exception 'Request already %', r.status; end if;
  if p_action not in ('Approved','Rejected') then raise exception 'Invalid action'; end if;
  if coalesce(btrim(p_comment), '') = '' then raise exception 'A comment is required'; end if;
  v_module := case r.reference_type when 'WorkOrder' then 'maintenance' when 'Invoice' then 'invoice' else 'expense' end;
  if not public.has_company_access(r.company_id) or not public.can_approve(v_module, r.amount)
     or (cardinality(r.required_roles) > 0 and not public.is_super_admin() and not v_role = any(r.required_roles)) then
    raise exception 'You are not authorised to decide this request' using errcode = '42501';
  end if;
  if r.requested_by = auth.uid() and p_action = 'Approved' then
    raise exception 'You cannot approve your own request' using errcode = '42501';
  end if;

  insert into public.approval_actions (request_id, level, approver_id, approver_role, action, comment)
  values (p_request, r.current_level, auth.uid(), v_role, p_action, btrim(p_comment));

  update public.approval_requests set
    status = case when p_action = 'Rejected' then 'Rejected'
                  when r.current_level >= r.total_levels then 'Approved' else 'Pending' end,
    current_level = case when p_action = 'Approved' and r.current_level < r.total_levels
                         then r.current_level + 1 else r.current_level end
  where id = p_request;

  if r.reference_type = 'WorkOrder' and (p_action = 'Rejected' or r.current_level >= r.total_levels) then
    update public.work_orders set approval_status = p_action,
           status = case when p_action = 'Approved' and status = 'Requested' then 'Approved' else status end
    where id = r.reference_id;
  end if;
end $$;
revoke execute on function public.decide_approval(uuid, text, text) from anon, public;
grant execute on function public.decide_approval(uuid, text, text) to authenticated;

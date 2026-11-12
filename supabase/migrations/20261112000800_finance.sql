-- Phase 7: Finance controls.
--   1. Period lock: accounting_periods per office and month; a closed month rejects every posting
--      (insert or date change of a journal entry), whatever the source.
--   2. Manual journals above the caller's journal limit go to journal_requests and are posted when
--      an approver (not the requester) approves them. Direct post_journal_entry() calls must be
--      within the caller's journal limit.
--   3. Payments must be within the caller's payment approval limit.
--   4. Debit notes: an extra charge on an approved invoice or bill (invoices.is_debit_note).
--   5. Bank reconciliation: bank statements and statement lines matched one-to-one with bank lines
--      in the ledger.
--   6. Cash flow statement (direct method, classified by the counter-accounts).
--   7. Budgets per office and year with monthly lines per account, approval and budget vs actual.
--   8. Fixed asset disposal posted to the ledger.
--   9. Fix: payroll gratuity posts to 5085 End of Service Benefits (5080 is depreciation).

-- ---------------------------------------------------------------------
-- 0. Default limits for accountants (editable in Settings → Roles)
-- ---------------------------------------------------------------------
insert into public.role_approval_limits (role_id, module, max_amount)
select r.id, m.module, 5000 from public.roles r cross join (values ('payment'), ('journal')) m(module)
where r.name = 'Accountant' on conflict do nothing;

-- ---------------------------------------------------------------------
-- 1. Period lock
-- ---------------------------------------------------------------------
create table if not exists public.accounting_periods (
  company_id  uuid not null references public.companies(id),
  year        int not null check (year between 2000 and 2100),
  month       int not null check (month between 1 and 12),
  status      text not null default 'Closed' check (status in ('Open', 'Closed')),
  closed_by   uuid references public.profiles(id),
  closed_at   timestamptz,
  reopened_by uuid references public.profiles(id),
  reopened_at timestamptz,
  note        text,
  primary key (company_id, year, month)
);

create or replace function public.period_is_closed(p_company uuid, p_date date) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.accounting_periods
                 where company_id = p_company and status = 'Closed'
                   and year = extract(year from p_date)::int and month = extract(month from p_date)::int)
$$;
grant execute on function public.period_is_closed(uuid, date) to authenticated;

create or replace function public.trg_journal_period_lock() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.period_is_closed(new.company_id, new.date) then
    raise exception 'The accounting period % is closed for this office; reopen it or post in an open month',
      to_char(new.date, 'Mon YYYY');
  end if;
  if tg_op = 'UPDATE' and new.date is distinct from old.date and public.period_is_closed(old.company_id, old.date) then
    raise exception 'The accounting period % is closed for this office', to_char(old.date, 'Mon YYYY');
  end if;
  return new;
end $$;
revoke execute on function public.trg_journal_period_lock() from anon, authenticated, public;
drop trigger if exists a_journal_period_lock on public.journal_entries;
create trigger a_journal_period_lock before insert or update of date, company_id on public.journal_entries
  for each row execute function public.trg_journal_period_lock();

create or replace function public.close_period(p_company uuid, p_year int, p_month int, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.can_in(p_company, 'accounting', 'approve') then raise exception 'Permission denied' using errcode = '42501'; end if;
  if p_month not between 1 and 12 then raise exception 'Month must be 1 to 12'; end if;
  if (make_date(p_year, p_month, 1) + interval '1 month')::date > current_date then
    raise exception 'A month can be closed only after it has ended';
  end if;
  if exists (select 1 from public.payroll_runs where company_id = p_company and year = p_year and month = p_month
             and status in ('Draft', 'Under Review')) then
    raise exception 'Payroll for this month is not approved yet';
  end if;
  insert into public.accounting_periods (company_id, year, month, status, closed_by, closed_at, note)
  values (p_company, p_year, p_month, 'Closed', auth.uid(), now(), nullif(btrim(coalesce(p_note, '')), ''))
  on conflict (company_id, year, month) do update set status = 'Closed', closed_by = auth.uid(), closed_at = now(),
    note = coalesce(excluded.note, public.accounting_periods.note);
end $$;

create or replace function public.reopen_period(p_company uuid, p_year int, p_month int, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.can_in(p_company, 'accounting', 'approve') then raise exception 'Permission denied' using errcode = '42501'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'A reason is required to reopen a period'; end if;
  update public.accounting_periods set status = 'Open', reopened_by = auth.uid(), reopened_at = now(),
         note = btrim(p_reason)
   where company_id = p_company and year = p_year and month = p_month and status = 'Closed';
  if not found then raise exception 'This period is not closed'; end if;
end $$;
revoke execute on function public.close_period(uuid, int, int, text), public.reopen_period(uuid, int, int, text) from anon, public;
grant execute on function public.close_period(uuid, int, int, text), public.reopen_period(uuid, int, int, text) to authenticated;

-- ---------------------------------------------------------------------
-- 2. Manual journals: limit on direct posting, approval requests above it
-- ---------------------------------------------------------------------
create or replace function public._journal_total(p_lines jsonb) returns numeric
language sql immutable as $$
  select coalesce(sum(round(coalesce((l->>'debit')::numeric, 0), 3)), 0) from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) l
$$;

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
    if jsonb_typeof(p_lines) = 'array' and not public.can_approve_in(p_company, 'journal', public._journal_total(p_lines)) then
      raise exception 'This journal is above your journal approval limit; submit it for approval instead';
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
  values (p_company, public.next_doc_number(p_company, public.doc_prefix('journal', p_company, p_date), public.doc_pad('journal')), p_date,
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

create table if not exists public.journal_requests (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references public.companies(id),
  request_number   text not null,
  entry_date       date not null,
  description      text not null check (btrim(description) <> ''),
  reference        text,
  lines            jsonb not null check (jsonb_typeof(lines) = 'array'),
  total            numeric(14,3) not null check (total > 0),
  status           text not null default 'Pending' check (status in ('Pending', 'Approved', 'Rejected', 'Cancelled')),
  requested_by     uuid references public.profiles(id) default auth.uid(),
  reviewed_by      uuid references public.profiles(id),
  reviewed_at      timestamptz,
  review_note      text,
  journal_entry_id uuid references public.journal_entries(id),
  created_at       timestamptz not null default now(),
  unique (company_id, request_number)
);
create index if not exists journal_requests_pending on public.journal_requests (company_id) where status = 'Pending';

-- Validates like post_journal_entry without posting (balanced, known accounts, one side per line).
create or replace function public._journal_check(p_company uuid, p_date date, p_description text, p_lines jsonb)
returns numeric language plpgsql stable security definer set search_path = public as $$
declare v_bad text; v_dr numeric; v_cr numeric;
begin
  if p_date is null then raise exception 'Journal date is required'; end if;
  if coalesce(btrim(p_description), '') = '' then raise exception 'Journal description is required'; end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) < 2 then
    raise exception 'A journal entry needs at least two lines';
  end if;
  select string_agg(distinct l->>'account_code', ', ') into v_bad from jsonb_array_elements(p_lines) l
  where not exists (select 1 from public.accounts a where a.company_id = p_company and a.code = l->>'account_code');
  if v_bad is not null then raise exception 'Unknown account code(s) for this office: %', v_bad; end if;
  if exists (select 1 from jsonb_array_elements(p_lines) l
             where coalesce((l->>'debit')::numeric, 0) < 0 or coalesce((l->>'credit')::numeric, 0) < 0
                or (coalesce((l->>'debit')::numeric, 0) > 0) = (coalesce((l->>'credit')::numeric, 0) > 0)) then
    raise exception 'Each journal line must be either a positive debit or a positive credit';
  end if;
  select sum(round(coalesce((l->>'debit')::numeric, 0), 3)), sum(round(coalesce((l->>'credit')::numeric, 0), 3))
    into v_dr, v_cr from jsonb_array_elements(p_lines) l;
  if abs(v_dr - v_cr) > 0.0005 then raise exception 'Journal is not balanced: debits % and credits %', v_dr, v_cr; end if;
  if public.period_is_closed(p_company, p_date) then
    raise exception 'The accounting period % is closed for this office', to_char(p_date, 'Mon YYYY');
  end if;
  return v_dr;
end $$;
revoke execute on function public._journal_check(uuid, date, text, jsonb) from anon, authenticated, public;

-- Posts at once when within the caller's journal limit, otherwise creates a pending request.
create or replace function public.submit_manual_journal(p_company uuid, p_date date, p_description text, p_lines jsonb,
  p_reference text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_total numeric; v_id uuid; v_je uuid; v_no text;
begin
  if not public.can_in(p_company, 'accounting', 'create') then raise exception 'Permission denied' using errcode = '42501'; end if;
  v_total := public._journal_check(p_company, p_date, p_description, p_lines);
  if public.can_approve_in(p_company, 'journal', v_total) then
    v_je := public.post_journal_entry(p_company, p_date, btrim(p_description), p_lines, nullif(btrim(coalesce(p_reference, '')), ''), 'Manual', null);
    return jsonb_build_object('status', 'Posted', 'journal_entry_id', v_je);
  end if;
  v_no := public.next_doc_number(p_company, 'JR-' || extract(year from p_date)::int);
  insert into public.journal_requests (company_id, request_number, entry_date, description, reference, lines, total)
  values (p_company, v_no, p_date, btrim(p_description), nullif(btrim(coalesce(p_reference, '')), ''), p_lines, v_total)
  returning id into v_id;
  insert into public.notifications (company_id, user_id, type, title, message, severity, link, reference_id)
  values (p_company, null, 'approval_required', 'Journal waiting for approval: ' || v_no,
          btrim(p_description) || ' (' || v_total || ')', 'warning', 'approvals', v_id);
  return jsonb_build_object('status', 'Pending', 'id', v_id, 'request_number', v_no);
end $$;

create or replace function public.review_manual_journal(p_id uuid, p_decision text, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare r public.journal_requests; v_je uuid;
begin
  select * into r from public.journal_requests where id = p_id for update;
  if not found then raise exception 'Journal request not found'; end if;
  if r.status <> 'Pending' then raise exception 'This journal request has already been decided'; end if;
  if p_decision = 'Cancelled' then
    if r.requested_by is distinct from auth.uid() and not public.can_in(r.company_id, 'accounting', 'approve') then
      raise exception 'Permission denied' using errcode = '42501';
    end if;
  elsif p_decision in ('Approved', 'Rejected') then
    if not public.can_in(r.company_id, 'accounting', 'approve') then raise exception 'Permission denied' using errcode = '42501'; end if;
    if r.requested_by = auth.uid() and not public.is_super_admin() then
      raise exception 'You cannot approve a journal you submitted';
    end if;
    if p_decision = 'Approved' and not public.can_approve_in(r.company_id, 'journal', r.total) then
      raise exception 'This journal is above your journal approval limit';
    end if;
    if p_decision = 'Rejected' and coalesce(btrim(p_note), '') = '' then raise exception 'A reason is required to reject'; end if;
  else
    raise exception 'Unknown decision %', p_decision;
  end if;
  if p_decision = 'Approved' then
    perform public._journal_check(r.company_id, r.entry_date, r.description, r.lines);
    v_je := public.post_journal_entry(r.company_id, r.entry_date, r.description, r.lines,
              coalesce(r.reference, r.request_number), 'Manual', null);
  end if;
  update public.journal_requests set status = p_decision, reviewed_by = auth.uid(), reviewed_at = now(),
         review_note = nullif(btrim(coalesce(p_note, '')), ''), journal_entry_id = v_je where id = p_id;
  if r.requested_by is not null and p_decision <> 'Cancelled' then
    insert into public.notifications (company_id, user_id, type, title, message, severity, link, reference_id)
    values (r.company_id, r.requested_by, 'journal_' || lower(p_decision), 'Journal ' || lower(p_decision) || ': ' || r.request_number,
            coalesce(nullif(btrim(coalesce(p_note, '')), ''), r.description), case p_decision when 'Approved' then 'success' else 'warning' end,
            'accounting', r.id);
  end if;
  return v_je;
end $$;
revoke execute on function public.submit_manual_journal(uuid, date, text, jsonb, text), public.review_manual_journal(uuid, text, text) from anon, public;
grant execute on function public.submit_manual_journal(uuid, date, text, jsonb, text), public.review_manual_journal(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- 3. Payments within the payment approval limit
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
  if not public.can_approve_in(inv.company_id, 'payment', p_amount) then
    raise exception 'This payment is above your payment approval limit; ask a Finance Manager to record it';
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
  values (inv.company_id, public.next_doc_number(inv.company_id, public.doc_prefix('payment', inv.company_id, p_date), public.doc_pad('payment')),
          p_invoice, p_date, p_amount, p_method, p_bank_account, p_reference, p_cheque, p_notes, v_je, auth.uid())
  returning id into v_pay;
  return v_pay;
end $$;
revoke execute on function public.record_payment(uuid, numeric, date, text, uuid, text, text, text) from anon, public;
grant execute on function public.record_payment(uuid, numeric, date, text, uuid, text, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- 4. Debit notes
-- ---------------------------------------------------------------------
alter table public.invoices add column if not exists is_debit_note boolean not null default false;
alter table public.invoices drop constraint if exists invoices_note_kind;
alter table public.invoices add constraint invoices_note_kind check (not (is_credit_note and is_debit_note));
alter table public.invoices drop constraint if exists invoices_debit_note_parent;
alter table public.invoices add constraint invoices_debit_note_parent check (not is_debit_note or parent_invoice_id is not null);

create or replace function public.trg_invoice_debit_note_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user = 'authenticated' and (
       (tg_op = 'INSERT' and new.is_debit_note)
    or (tg_op = 'UPDATE' and new.is_debit_note is distinct from old.is_debit_note)) then
    raise exception 'Debit notes must be created with create_debit_note()';
  end if;
  return new;
end $$;
drop trigger if exists invoices_debit_note_guard on public.invoices;
create trigger invoices_debit_note_guard before insert or update of is_debit_note on public.invoices
  for each row execute function public.trg_invoice_debit_note_guard();

-- p_lines: invoice lines as for create_invoice (description, quantity, unit_price, tax_rate_percentage,
-- gl_account_code, ...). The note follows the normal approval: posted at once within the caller's
-- invoice limit, otherwise sent for approval. Returns the new invoice id.
create or replace function public.create_debit_note(p_invoice uuid, p_reason text, p_lines jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare inv public.invoices; v_id uuid;
begin
  select * into inv from public.invoices where id = p_invoice for update;
  if not found then raise exception 'Invoice not found'; end if;
  if not public.can_in(inv.company_id, 'invoices', 'create') then raise exception 'Permission denied' using errcode = '42501'; end if;
  if inv.is_credit_note or inv.is_debit_note then raise exception 'A debit note can only be raised against an invoice or bill'; end if;
  if inv.approval_status <> 'Approved' or inv.journal_entry_id is null then
    raise exception 'Only approved (posted) invoices can take a debit note';
  end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'A reason is required for a debit note'; end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'A debit note needs at least one line';
  end if;
  v_id := public.create_invoice(jsonb_build_object(
      'company_id', inv.company_id, 'invoice_type', inv.invoice_type, 'supplier_id', inv.supplier_id, 'customer_id', inv.customer_id,
      'invoice_date', current_date, 'due_date', current_date + coalesce(inv.payment_terms_days, 0),
      'reference_number', inv.invoice_number, 'vehicle_id', inv.vehicle_id, 'cost_centre', inv.cost_centre,
      'currency', inv.currency, 'exchange_rate', inv.exchange_rate, 'payment_terms_days', inv.payment_terms_days,
      'notes', 'Debit note against ' || inv.invoice_number || '. Reason: ' || btrim(p_reason)), p_lines, false);
  update public.invoices set is_debit_note = true, parent_invoice_id = inv.id where id = v_id;
  perform public.submit_invoice(v_id);
  return v_id;
end $$;
revoke execute on function public.create_debit_note(uuid, text, jsonb) from anon, public;
grant execute on function public.create_debit_note(uuid, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 5. Bank reconciliation
-- ---------------------------------------------------------------------
create table if not exists public.bank_statements (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references public.companies(id),
  bank_account_id  uuid not null references public.bank_accounts(id),
  period_start     date not null,
  period_end       date not null,
  opening_balance  numeric(14,3) not null,
  closing_balance  numeric(14,3) not null,
  status           text not null default 'Open' check (status in ('Open', 'Reconciled')),
  notes            text,
  created_by       uuid references public.profiles(id) default auth.uid(),
  created_at       timestamptz not null default now(),
  reconciled_by    uuid references public.profiles(id),
  reconciled_at    timestamptz,
  check (period_end >= period_start),
  unique (bank_account_id, period_end)
);
create table if not exists public.bank_statement_lines (
  id              uuid primary key default gen_random_uuid(),
  statement_id    uuid not null references public.bank_statements(id) on delete cascade,
  company_id      uuid not null references public.companies(id),
  txn_date        date not null,
  description     text not null check (btrim(description) <> ''),
  reference       text,
  amount          numeric(14,3) not null check (amount <> 0),     -- money in > 0, money out < 0
  journal_line_id uuid unique references public.journal_lines(id),
  matched_by      uuid references public.profiles(id),
  matched_at      timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists bank_statement_lines_statement on public.bank_statement_lines (statement_id);

create or replace function public.trg_bank_statement() returns trigger
language plpgsql security definer set search_path = public as $$
declare b public.bank_accounts;
begin
  if tg_op = 'DELETE' then
    if old.status = 'Reconciled' then raise exception 'A reconciled statement cannot be deleted'; end if;
    return old;
  end if;
  select * into b from public.bank_accounts where id = new.bank_account_id;
  if not found then raise exception 'Bank account not found'; end if;
  new.company_id := b.company_id;
  if tg_op = 'UPDATE' and old.status = 'Reconciled' and current_setting('erp.bank_rec', true) is distinct from 'on' then
    raise exception 'A reconciled statement cannot be changed';
  end if;
  if tg_op = 'UPDATE' and new.status is distinct from old.status and current_setting('erp.bank_rec', true) is distinct from 'on' then
    raise exception 'Use complete_bank_reconciliation() to change the status';
  end if;
  if tg_op = 'INSERT' and new.status <> 'Open' then raise exception 'A new statement starts Open'; end if;
  return new;
end $$;
drop trigger if exists a_bank_statement on public.bank_statements;
create trigger a_bank_statement before insert or update or delete on public.bank_statements
  for each row execute function public.trg_bank_statement();

create or replace function public.trg_bank_statement_line() returns trigger
language plpgsql security definer set search_path = public as $$
declare s public.bank_statements; v_amt numeric; v_bank uuid;
begin
  select * into s from public.bank_statements where id = coalesce(new.statement_id, old.statement_id);
  if s.status = 'Reconciled' and current_setting('erp.bank_rec', true) is distinct from 'on' then
    raise exception 'The statement is reconciled; its lines cannot change';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  new.company_id := s.company_id;
  if new.txn_date < s.period_start or new.txn_date > s.period_end then
    raise exception 'Line date % is outside the statement period', new.txn_date;
  end if;
  if new.journal_line_id is not null and (tg_op = 'INSERT' or new.journal_line_id is distinct from old.journal_line_id) then
    select jl.debit - jl.credit, jl.bank_account_id into v_amt, v_bank from public.journal_lines jl where jl.id = new.journal_line_id;
    if v_bank is distinct from s.bank_account_id then raise exception 'The ledger line is not on this bank account'; end if;
    if abs(v_amt - new.amount) > 0.0005 then raise exception 'Amounts differ: statement % and ledger %', new.amount, v_amt; end if;
    new.matched_by := auth.uid(); new.matched_at := now();
  elsif new.journal_line_id is null then
    new.matched_by := null; new.matched_at := null;
  end if;
  return new;
end $$;
drop trigger if exists a_bank_statement_line on public.bank_statement_lines;
create trigger a_bank_statement_line before insert or update or delete on public.bank_statement_lines
  for each row execute function public.trg_bank_statement_line();

-- Bank lines in the ledger for one bank account, with the statement line they are matched to
create or replace function public.bank_book_lines(p_bank uuid, p_from date, p_to date)
returns table (journal_line_id uuid, entry_date date, entry_number text, description text, amount numeric,
               statement_line_id uuid, statement_id uuid)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare b public.bank_accounts;
begin
  select * into b from public.bank_accounts where id = p_bank;
  if not found or not public.can_in(b.company_id, 'reconciliation', 'view') then raise exception 'Permission denied' using errcode = '42501'; end if;
  return query
    select jl.id, je.date, je.entry_number, coalesce(jl.description, je.description), (jl.debit - jl.credit)::numeric,
           sl.id, sl.statement_id
      from public.journal_lines jl join public.journal_entries je on je.id = jl.entry_id
      left join public.bank_statement_lines sl on sl.journal_line_id = jl.id
     where jl.bank_account_id = p_bank and je.date between p_from and p_to and je.status <> 'Draft'
     order by je.date, je.entry_number;
end $$;

create or replace function public.auto_match_statement(p_statement uuid) returns int
language plpgsql security definer set search_path = public as $$
declare s public.bank_statements; l record; v_line uuid; n int := 0;
begin
  select * into s from public.bank_statements where id = p_statement;
  if not found or not public.can_in(s.company_id, 'reconciliation', 'edit') then raise exception 'Permission denied' using errcode = '42501'; end if;
  if s.status = 'Reconciled' then raise exception 'The statement is already reconciled'; end if;
  for l in select * from public.bank_statement_lines where statement_id = p_statement and journal_line_id is null order by txn_date loop
    select jl.id into v_line
      from public.journal_lines jl join public.journal_entries je on je.id = jl.entry_id
     where jl.bank_account_id = s.bank_account_id and abs((jl.debit - jl.credit) - l.amount) < 0.0005
       and je.date between l.txn_date - 5 and l.txn_date + 5 and je.status <> 'Draft'
       and not exists (select 1 from public.bank_statement_lines x where x.journal_line_id = jl.id)
     order by abs(je.date - l.txn_date), je.entry_number limit 1;
    if v_line is not null then
      update public.bank_statement_lines set journal_line_id = v_line where id = l.id;
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;

create or replace function public.complete_bank_reconciliation(p_statement uuid) returns void
language plpgsql security definer set search_path = public as $$
declare s public.bank_statements; v_sum numeric; v_open int;
begin
  select * into s from public.bank_statements where id = p_statement for update;
  if not found or not public.can_in(s.company_id, 'reconciliation', 'approve') then raise exception 'Permission denied' using errcode = '42501'; end if;
  if s.status = 'Reconciled' then raise exception 'Already reconciled'; end if;
  select coalesce(sum(amount), 0), count(*) filter (where journal_line_id is null) into v_sum, v_open
    from public.bank_statement_lines where statement_id = p_statement;
  if v_open > 0 then raise exception '% statement line(s) are not matched to the ledger', v_open; end if;
  if abs(s.opening_balance + v_sum - s.closing_balance) > 0.0005 then
    raise exception 'Opening balance % plus lines % does not equal closing balance %', s.opening_balance, v_sum, s.closing_balance;
  end if;
  perform set_config('erp.bank_rec', 'on', true);
  update public.bank_statements set status = 'Reconciled', reconciled_by = auth.uid(), reconciled_at = now() where id = p_statement;
  perform set_config('erp.bank_rec', '', true);
end $$;
revoke execute on function public.bank_book_lines(uuid, date, date), public.auto_match_statement(uuid),
  public.complete_bank_reconciliation(uuid) from anon, public;
grant execute on function public.bank_book_lines(uuid, date, date), public.auto_match_statement(uuid),
  public.complete_bank_reconciliation(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 6. Cash flow statement (direct method)
-- ---------------------------------------------------------------------
-- Cash = the GL accounts used by the office's bank accounts. Each entry's cash movement is classed
-- by its other lines: fixed-asset accounts → Investing; equity or long-term liabilities → Financing;
-- otherwise Operating. Entries that only move money between cash accounts are left out.
create or replace function public.cash_flow_statement(p_company uuid, p_from date, p_to date)
returns table (section text, line text, amount numeric, sort int)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare v_open numeric; v_close numeric; v_cash text[];
begin
  if not public.can_in(p_company, 'accounting', 'view') then raise exception 'Permission denied' using errcode = '42501'; end if;
  if p_from is null or p_to is null or p_to < p_from then raise exception 'Choose a valid period'; end if;
  select coalesce(array_agg(distinct b.gl_account_code), '{}') into v_cash from public.bank_accounts b where b.company_id = p_company;

  select coalesce(sum(jl.debit - jl.credit), 0) into v_open
    from public.journal_lines jl join public.journal_entries je on je.id = jl.entry_id
   where jl.company_id = p_company and je.status <> 'Draft' and je.date < p_from and jl.account_code = any(v_cash);
  select v_open + coalesce(sum(jl.debit - jl.credit), 0) into v_close
    from public.journal_lines jl join public.journal_entries je on je.id = jl.entry_id
   where jl.company_id = p_company and je.status <> 'Draft' and je.date between p_from and p_to and jl.account_code = any(v_cash);

  return query
  with moves as (
    select je.id, je.source_module sm,
           sum(case when jl.account_code = any(v_cash) then jl.debit - jl.credit else 0 end) cash,
           coalesce(bool_or(not (jl.account_code = any(v_cash)) and a.subcategory = 'Fixed Assets'), false) inv,
           coalesce(bool_or(not (jl.account_code = any(v_cash)) and (a.category = 'Equity' or a.subcategory = 'Long Term Liabilities')), false) fin,
           bool_or(not (jl.account_code = any(v_cash))) other
      from public.journal_entries je
      join public.journal_lines jl on jl.entry_id = je.id
      join public.accounts a on a.company_id = jl.company_id and a.code = jl.account_code
     where je.company_id = p_company and je.status <> 'Draft' and je.date between p_from and p_to
     group by je.id, je.source_module
    having bool_or(jl.account_code = any(v_cash))
  ), classed as (
    select case when m.inv then 'Investing' when m.fin then 'Financing' else 'Operating' end sec,
           case
             when m.sm = 'Opening Balance' then 'Opening balances entered'
             when m.sm = 'Payment' and m.cash > 0 then 'Receipts from customers'
             when m.sm = 'Payment' then 'Payments to suppliers'
             when m.sm = 'Payroll' then 'Salaries paid'
             when m.sm = 'Expense' then 'Expenses paid'
             when m.sm = 'Asset Disposal' then 'Proceeds from asset disposals'
             when m.inv and m.cash < 0 then 'Purchase of fixed assets'
             when m.fin and m.cash > 0 then 'Capital and loans received'
             when m.fin then 'Capital and loans repaid'
             when m.cash > 0 then 'Other receipts'
             else 'Other payments' end ln,
           m.cash
      from moves m where m.other
  )
  select x.s, x.l, x.a, x.o from (
    select 'Opening'::text s, 'Cash at start of period'::text l, round(v_open, 3) a, 0 o
    union all
    select c.sec, c.ln, round(sum(c.cash), 3), case c.sec when 'Operating' then 10 when 'Investing' then 20 else 30 end
      from classed c group by c.sec, c.ln
    union all
    select 'Closing'::text, 'Cash at end of period'::text, round(v_close, 3), 99
  ) x order by x.o, x.l;
end $$;
revoke execute on function public.cash_flow_statement(uuid, date, date) from anon, public;
grant execute on function public.cash_flow_statement(uuid, date, date) to authenticated;

-- ---------------------------------------------------------------------
-- 7. Budgets
-- ---------------------------------------------------------------------
create table if not exists public.budgets (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies(id),
  year         int not null check (year between 2000 and 2100),
  name         text not null check (btrim(name) <> ''),
  status       text not null default 'Draft' check (status in ('Draft', 'Submitted', 'Approved', 'Rejected')),
  notes        text,
  created_by   uuid references public.profiles(id) default auth.uid(),
  created_at   timestamptz not null default now(),
  submitted_by uuid references public.profiles(id),
  submitted_at timestamptz,
  reviewed_by  uuid references public.profiles(id),
  reviewed_at  timestamptz,
  review_note  text,
  unique (company_id, year, name)
);
create unique index if not exists budgets_one_approved on public.budgets (company_id, year) where status = 'Approved';
create table if not exists public.budget_lines (
  id           uuid primary key default gen_random_uuid(),
  budget_id    uuid not null references public.budgets(id) on delete cascade,
  company_id   uuid not null references public.companies(id),
  account_code text not null,
  month        int not null check (month between 1 and 12),
  amount       numeric(14,3) not null check (amount >= 0),
  unique (budget_id, account_code, month),
  foreign key (company_id, account_code) references public.accounts(company_id, code)
);
create index if not exists budget_lines_budget on public.budget_lines (budget_id);

create or replace function public.trg_budget() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_setting('erp.budget', true) = 'on' then return coalesce(new, old); end if;
  if tg_op = 'INSERT' then
    if new.status <> 'Draft' then raise exception 'A new budget starts as Draft'; end if;
    return new;
  end if;
  if tg_op = 'DELETE' then
    if old.status not in ('Draft', 'Rejected') then raise exception 'Only draft or rejected budgets can be deleted'; end if;
    return old;
  end if;
  if old.status in ('Submitted', 'Approved') then raise exception 'A % budget cannot be changed', lower(old.status); end if;
  if new.status is distinct from old.status then raise exception 'Use submit_budget() or review_budget()'; end if;
  if new.company_id <> old.company_id or new.year <> old.year then raise exception 'Office and year cannot change'; end if;
  return new;
end $$;
drop trigger if exists a_budget on public.budgets;
create trigger a_budget before insert or update or delete on public.budgets for each row execute function public.trg_budget();

create or replace function public.trg_budget_line() returns trigger
language plpgsql security definer set search_path = public as $$
declare b public.budgets;
begin
  select * into b from public.budgets where id = coalesce(new.budget_id, old.budget_id);
  if b.status not in ('Draft', 'Rejected') and current_setting('erp.budget', true) is distinct from 'on' then
    raise exception 'Lines can only change while the budget is Draft or Rejected';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  new.company_id := b.company_id;
  if not exists (select 1 from public.accounts where company_id = b.company_id and code = new.account_code and category in ('Expense', 'Revenue')) then
    raise exception 'Budget lines must use an income or expense account of the office';
  end if;
  return new;
end $$;
drop trigger if exists a_budget_line on public.budget_lines;
create trigger a_budget_line before insert or update or delete on public.budget_lines for each row execute function public.trg_budget_line();

create or replace function public.budget_total(p_budget uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(sum(l.amount), 0) from public.budget_lines l
  join public.accounts a on a.company_id = l.company_id and a.code = l.account_code
  where l.budget_id = p_budget and a.category = 'Expense'
$$;
grant execute on function public.budget_total(uuid) to authenticated;

create or replace function public.submit_budget(p_budget uuid) returns void
language plpgsql security definer set search_path = public as $$
declare b public.budgets;
begin
  select * into b from public.budgets where id = p_budget for update;
  if not found or not public.can_in(b.company_id, 'budgets', 'edit') then raise exception 'Permission denied' using errcode = '42501'; end if;
  if b.status not in ('Draft', 'Rejected') then raise exception 'Only a draft or rejected budget can be submitted'; end if;
  if not exists (select 1 from public.budget_lines where budget_id = p_budget) then raise exception 'The budget has no lines'; end if;
  perform set_config('erp.budget', 'on', true);
  update public.budgets set status = 'Submitted', submitted_by = auth.uid(), submitted_at = now(), review_note = null where id = p_budget;
  perform set_config('erp.budget', '', true);
end $$;

create or replace function public.review_budget(p_budget uuid, p_decision text, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare b public.budgets;
begin
  select * into b from public.budgets where id = p_budget for update;
  if not found or not public.can_in(b.company_id, 'budgets', 'approve') then raise exception 'Permission denied' using errcode = '42501'; end if;
  if p_decision = 'Reopen' then
    if b.status <> 'Approved' then raise exception 'Only an approved budget can be reopened'; end if;
    if coalesce(btrim(p_note), '') = '' then raise exception 'A reason is required to reopen a budget'; end if;
  else
    if b.status <> 'Submitted' then raise exception 'Only a submitted budget can be reviewed'; end if;
    if p_decision not in ('Approved', 'Rejected') then raise exception 'Unknown decision %', p_decision; end if;
    if b.submitted_by = auth.uid() and not public.is_super_admin() then raise exception 'You cannot approve a budget you submitted'; end if;
    if p_decision = 'Approved' and not public.can_approve_in(b.company_id, 'budget', public.budget_total(p_budget)) then
      raise exception 'This budget is above your budget approval limit';
    end if;
    if p_decision = 'Rejected' and coalesce(btrim(p_note), '') = '' then raise exception 'A reason is required to reject'; end if;
  end if;
  perform set_config('erp.budget', 'on', true);
  update public.budgets set status = case p_decision when 'Reopen' then 'Draft' else p_decision end,
         reviewed_by = auth.uid(), reviewed_at = now(), review_note = nullif(btrim(coalesce(p_note, '')), '') where id = p_budget;
  perform set_config('erp.budget', '', true);
end $$;
revoke execute on function public.submit_budget(uuid), public.review_budget(uuid, text, text) from anon, public;
grant execute on function public.submit_budget(uuid), public.review_budget(uuid, text, text) to authenticated;

-- Budget vs actual for the approved budget of an office and year (actuals from posted journals).
create or replace function public.budget_vs_actual(p_company uuid, p_year int)
returns table (account_code text, account_name text, category text, month int, budget numeric, actual numeric)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not (public.can_in(p_company, 'budgets', 'view') or public.can_in(p_company, 'accounting', 'view')) then
    raise exception 'Permission denied' using errcode = '42501';
  end if;
  return query
  with bl as (
    select l.account_code, l.month, sum(l.amount) amt from public.budget_lines l
    join public.budgets b on b.id = l.budget_id
    where b.company_id = p_company and b.year = p_year and b.status = 'Approved' group by 1, 2
  ), act as (
    select jl.account_code, extract(month from je.date)::int m,
           sum(case when a.category = 'Revenue' then jl.credit - jl.debit else jl.debit - jl.credit end) amt
      from public.journal_lines jl join public.journal_entries je on je.id = jl.entry_id
      join public.accounts a on a.company_id = jl.company_id and a.code = jl.account_code
     where je.company_id = p_company and je.status <> 'Draft' and extract(year from je.date)::int = p_year
       and a.category in ('Expense', 'Revenue')
     group by 1, 2
  ), keys as (select bl.account_code, bl.month from bl union select act.account_code, act.m from act)
  select k.account_code, a.name, a.category::text, k.month, round(coalesce(bl.amt, 0), 3), round(coalesce(act.amt, 0), 3)
    from keys k
    join public.accounts a on a.company_id = p_company and a.code = k.account_code
    left join bl on bl.account_code = k.account_code and bl.month = k.month
    left join act on act.account_code = k.account_code and act.m = k.month
   order by a.category desc, k.account_code, k.month;
end $$;
revoke execute on function public.budget_vs_actual(uuid, int) from anon, public;
grant execute on function public.budget_vs_actual(uuid, int) to authenticated;

-- ---------------------------------------------------------------------
-- 8. Fixed asset disposal
-- ---------------------------------------------------------------------
alter table public.fixed_assets add column if not exists disposal_date date;
alter table public.fixed_assets add column if not exists disposal_proceeds numeric(14,3) check (disposal_proceeds is null or disposal_proceeds >= 0);
alter table public.fixed_assets add column if not exists disposal_journal_entry_id uuid references public.journal_entries(id);

create or replace function public.trg_fixed_asset_disposal_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_setting('erp.asset_disposal', true) = 'on' then return new; end if;
  if old.status = 'Disposed' then raise exception 'A disposed asset cannot be changed'; end if;
  if new.status = 'Disposed' or new.disposal_date is not null or new.disposal_journal_entry_id is not null
     or new.disposal_proceeds is not null then
    raise exception 'Use dispose_fixed_asset() to dispose of an asset';
  end if;
  return new;
end $$;
drop trigger if exists fixed_assets_disposal_guard on public.fixed_assets;
create trigger fixed_assets_disposal_guard before update on public.fixed_assets
  for each row execute function public.trg_fixed_asset_disposal_guard();

create or replace function public.trg_fixed_asset_insert_status() returns trigger
language plpgsql set search_path = public as $$
begin
  -- server-side imports (no signed-in user) may bring in assets disposed before go-live
  if auth.uid() is not null and (new.status = 'Disposed' or new.disposal_journal_entry_id is not null) then
    raise exception 'Use dispose_fixed_asset() to dispose of an asset';
  end if;
  return new;
end $$;
drop trigger if exists fixed_assets_insert_status on public.fixed_assets;
create trigger fixed_assets_insert_status before insert on public.fixed_assets
  for each row execute function public.trg_fixed_asset_insert_status();

-- Dr accumulated depreciation, Dr bank (proceeds), Cr asset cost; the difference is a gain (4030)
-- or a loss (5095). Run depreciation up to the disposal month first.
create or replace function public.dispose_fixed_asset(p_asset uuid, p_date date, p_proceeds numeric default 0,
  p_bank_account uuid default null, p_note text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare a public.fixed_assets; ba public.bank_accounts; v_book numeric; v_gain numeric; v_lines jsonb; v_je uuid;
        v_proceeds numeric := round(coalesce(p_proceeds, 0), 3);
begin
  select * into a from public.fixed_assets where id = p_asset for update;
  if not found then raise exception 'Asset not found'; end if;
  if not public.can_in(a.company_id, 'fixed-assets', 'approve') then raise exception 'Permission denied' using errcode = '42501'; end if;
  if a.status = 'Disposed' then raise exception 'The asset is already disposed'; end if;
  if p_date is null or p_date < a.purchase_date then raise exception 'The disposal date must be on or after the purchase date'; end if;
  if v_proceeds < 0 then raise exception 'Proceeds cannot be negative'; end if;
  if v_proceeds > 0 then
    select * into ba from public.bank_accounts where id = p_bank_account and company_id = a.company_id and active;
    if not found then raise exception 'Choose the bank account that received the proceeds'; end if;
  end if;
  v_book := a.purchase_cost - a.accumulated_depreciation;
  v_gain := v_proceeds - v_book;
  v_lines := jsonb_build_array(jsonb_build_object('account_code', a.gl_asset_account, 'credit', a.purchase_cost, 'description', 'Cost of ' || a.asset_code));
  if a.accumulated_depreciation > 0 then
    v_lines := v_lines || jsonb_build_object('account_code', a.gl_accum_dep_account, 'debit', a.accumulated_depreciation, 'description', 'Depreciation to date');
  end if;
  if v_proceeds > 0 then
    v_lines := v_lines || jsonb_build_object('account_code', ba.gl_account_code, 'debit', v_proceeds, 'bank_account_id', ba.id, 'description', 'Sale proceeds');
  end if;
  if v_gain > 0.0005 then
    perform public.ensure_system_account(a.company_id, '4030', 'Gain on Disposal of Assets', 'Revenue', 'Other Revenue');
    v_lines := v_lines || jsonb_build_object('account_code', '4030', 'credit', round(v_gain, 3), 'description', 'Gain on disposal');
  elsif v_gain < -0.0005 then
    perform public.ensure_system_account(a.company_id, '5095', 'Loss on Disposal of Assets', 'Expense', 'Operating Expense');
    v_lines := v_lines || jsonb_build_object('account_code', '5095', 'debit', round(-v_gain, 3), 'description', 'Loss on disposal');
  end if;
  if a.purchase_cost > 0 then
    v_je := public.post_journal_entry(a.company_id, p_date, 'Disposal of ' || a.asset_code || ' ' || a.name, v_lines,
              nullif(btrim(coalesce(p_note, '')), ''), 'Asset Disposal', a.id);
  end if;
  perform set_config('erp.asset_disposal', 'on', true);
  update public.fixed_assets set status = 'Disposed', disposal_date = p_date, disposal_proceeds = v_proceeds,
         disposal_journal_entry_id = v_je, notes = coalesce(notes || E'\n', '') || coalesce('Disposed: ' || nullif(btrim(coalesce(p_note, '')), ''), 'Disposed')
   where id = p_asset;
  perform set_config('erp.asset_disposal', '', true);
  return v_je;
end $$;
revoke execute on function public.dispose_fixed_asset(uuid, date, numeric, uuid, text) from anon, public;
grant execute on function public.dispose_fixed_asset(uuid, date, numeric, uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- 9. Gratuity account (5085) instead of depreciation (5080)
-- ---------------------------------------------------------------------
do $$
declare f text; def text; nd text;
begin
  foreach f in array array['public._payroll_fill(uuid)', 'public.payroll_approve(uuid,text)'] loop
    select pg_get_functiondef(f::regprocedure) into def;
    nd := replace(def, '''5080''', '''5085''');
    if nd = def then raise exception '% has no 5080 reference', f; end if;
    execute nd;
  end loop;
end $$;
update public.payroll_item_lines set gl_account_code = '5085' where kind = 'Gratuity' and gl_account_code = '5080';
insert into public.account_templates (code, name, category, subcategory, description, sort_order) values
  ('5085', 'End of Service Benefits', 'Expense', 'Operating Expense', 'Gratuity: payroll_approve', 345),
  ('5095', 'Loss on Disposal of Assets', 'Expense', 'Operating Expense', 'dispose_fixed_asset', 355)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------
-- 10. RLS
-- ---------------------------------------------------------------------
do $$
declare r record;
begin
  for r in select * from (values ('accounting_periods', 'accounting'), ('journal_requests', 'accounting'),
                                 ('bank_statements', 'reconciliation'), ('bank_statement_lines', 'reconciliation'),
                                 ('budgets', 'budgets'), ('budget_lines', 'budgets')) as v(tbl, module) loop
    execute format('alter table public.%I enable row level security', r.tbl);
    execute format('alter table public.%I force row level security', r.tbl);
    execute format('drop policy if exists %I on public.%I', r.tbl || '_select', r.tbl);
    execute format('create policy %I on public.%I for select to authenticated using (company_id = any((select public.perm_company_ids(%L, ''view''))::uuid[]))', r.tbl || '_select', r.tbl, r.module);
    execute format('drop trigger if exists %I on public.%I', r.tbl || '_audit', r.tbl);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.trg_audit()', r.tbl || '_audit', r.tbl);
  end loop;
  -- written by RPCs only
  grant select on public.accounting_periods, public.journal_requests to authenticated;
  -- written directly, office-scoped
  for r in select * from (values ('bank_statements', 'reconciliation'), ('bank_statement_lines', 'reconciliation'),
                                 ('budgets', 'budgets'), ('budget_lines', 'budgets')) as v(tbl, module) loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', r.tbl);
    execute format('drop policy if exists %I on public.%I', r.tbl || '_insert', r.tbl);
    execute format('create policy %I on public.%I for insert to authenticated with check (company_id = any((select public.perm_company_ids(%L, ''create''))::uuid[]))', r.tbl || '_insert', r.tbl, r.module);
    execute format('drop policy if exists %I on public.%I', r.tbl || '_update', r.tbl);
    execute format('create policy %I on public.%I for update to authenticated using (company_id = any((select public.perm_company_ids(%L, ''edit''))::uuid[])) with check (company_id = any((select public.perm_company_ids(%L, ''edit''))::uuid[]))', r.tbl || '_update', r.tbl, r.module, r.module);
    execute format('drop policy if exists %I on public.%I', r.tbl || '_delete', r.tbl);
    execute format('create policy %I on public.%I for delete to authenticated using (company_id = any((select public.perm_company_ids(%L, ''delete''))::uuid[]))', r.tbl || '_delete', r.tbl, r.module);
  end loop;
end $$;
-- the requester also sees their own journal requests
drop policy if exists journal_requests_own on public.journal_requests;
create policy journal_requests_own on public.journal_requests for select to authenticated using (requested_by = (select auth.uid()));

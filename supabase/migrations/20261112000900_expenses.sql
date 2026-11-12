-- =====================================================================
-- Phase 8: Expenses
--   1. Expense workflow columns: employee, status (Draft → Pending Approval → Approved / Rejected),
--      payment (bank now or later), journal links, recurring source.
--   2. Guards: clients create drafts only; submitted and approved expenses are locked; workflow
--      columns are written by RPCs. Employee and bank must be in the expense's office.
--   3. GL posting on approval: Dr category account (net), Dr 1300 input VAT; Cr bank when paid,
--      otherwise Cr 2010 payables. pay_expense() later posts Dr 2010 / Cr bank.
--   4. submit_expense / review_expense / pay_expense with the role's expense approval limit.
--   5. Recurring monthly expenses: generate_recurring_expenses() creates one draft per template and
--      month (idempotent), with due / overdue notifications.
--   6. Budget alerts at 80% and 100% of the approved annual budget per expense account.
--   7. Daily job (pg_cron when available).
-- Maintenance cost reaches the ledger through the supplier bill linked to the maintenance record
-- (invoices.maintenance_record_id), so maintenance records are not posted a second time here.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------
alter table public.expenses add column if not exists employee_id uuid references public.employees(id) on delete restrict;
alter table public.expenses add column if not exists status text not null default 'Draft';
alter table public.expenses add column if not exists payment_status text not null default 'Unpaid';
alter table public.expenses add column if not exists bank_account_id uuid references public.bank_accounts(id) on delete restrict;
alter table public.expenses add column if not exists paid_date date;
alter table public.expenses add column if not exists journal_entry_id uuid references public.journal_entries(id) on delete set null;
alter table public.expenses add column if not exists payment_journal_entry_id uuid references public.journal_entries(id) on delete set null;
alter table public.expenses add column if not exists submitted_by uuid references public.profiles(id) on delete set null;
alter table public.expenses add column if not exists submitted_at timestamptz;
alter table public.expenses add column if not exists approved_by uuid references public.profiles(id) on delete set null;
alter table public.expenses add column if not exists approved_at timestamptz;
alter table public.expenses add column if not exists review_note text;
alter table public.expenses add column if not exists recurring_expense_id uuid references public.recurring_expenses(id) on delete set null;
alter table public.expenses add column if not exists recurring_period date;
alter table public.expenses add column if not exists created_by uuid references public.profiles(id) on delete set null default auth.uid();

-- Expenses recorded before this phase were final when saved: they stay as approved and paid.
-- They were never posted to the ledger (journal_entry_id stays empty).
update public.expenses set status = 'Approved', payment_status = 'Paid', paid_date = coalesce(paid_date, date)
 where journal_entry_id is null and submitted_at is null and status = 'Draft' and recurring_expense_id is null;

alter table public.expenses drop constraint if exists expenses_status_check;
alter table public.expenses add constraint expenses_status_check check (status in ('Draft', 'Pending Approval', 'Approved', 'Rejected'));
alter table public.expenses drop constraint if exists expenses_payment_status_check;
alter table public.expenses add constraint expenses_payment_status_check check (payment_status in ('Unpaid', 'Paid'));
create unique index if not exists expenses_recurring_period on public.expenses (recurring_expense_id, recurring_period)
  where recurring_expense_id is not null;
create index if not exists expenses_status on public.expenses (company_id, status);
create index if not exists expenses_employee on public.expenses (employee_id) where employee_id is not null;

-- ---------------------------------------------------------------------
-- 2. Guards
-- ---------------------------------------------------------------------
create or replace function public.trg_expense_links() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.employee_id is not null and not exists (select 1 from public.employees where id = new.employee_id and company_id = new.company_id) then
    raise exception 'The employee belongs to another office';
  end if;
  if new.bank_account_id is not null and not exists (select 1 from public.bank_accounts where id = new.bank_account_id and company_id = new.company_id) then
    raise exception 'The bank account belongs to another office';
  end if;
  if new.vehicle_id is not null and not exists (select 1 from public.vehicles where id = new.vehicle_id and company_id = new.company_id) then
    raise exception 'The vehicle belongs to another office';
  end if;
  return new;
end $$;
revoke execute on function public.trg_expense_links() from anon, authenticated, public;
drop trigger if exists expenses_links on public.expenses;
create trigger expenses_links before insert or update of employee_id, bank_account_id, vehicle_id, company_id on public.expenses
  for each row execute function public.trg_expense_links();

create or replace function public.trg_expense_workflow() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_setting('erp.expense', true) = 'on' or current_user <> 'authenticated' then return coalesce(new, old); end if;
  if tg_op = 'INSERT' then
    new.status := 'Draft'; new.payment_status := 'Unpaid'; new.paid_date := null;
    new.journal_entry_id := null; new.payment_journal_entry_id := null;
    new.submitted_by := null; new.submitted_at := null; new.approved_by := null; new.approved_at := null; new.review_note := null;
    new.recurring_expense_id := null; new.recurring_period := null; new.created_by := auth.uid();
    return new;
  end if;
  if tg_op = 'DELETE' then
    if old.status not in ('Draft', 'Rejected') then raise exception 'Only draft or rejected expenses can be deleted'; end if;
    return old;
  end if;
  if old.status in ('Pending Approval', 'Approved') then
    raise exception 'A % expense cannot be changed', lower(old.status);
  end if;
  if (new.status, new.payment_status, new.paid_date, new.journal_entry_id, new.payment_journal_entry_id, new.submitted_by,
      new.submitted_at, new.approved_by, new.approved_at, new.recurring_expense_id, new.recurring_period, new.created_by)
     is distinct from
     (old.status, old.payment_status, old.paid_date, old.journal_entry_id, old.payment_journal_entry_id, old.submitted_by,
      old.submitted_at, old.approved_by, old.approved_at, old.recurring_expense_id, old.recurring_period, old.created_by) then
    raise exception 'Use submit_expense(), review_expense() or pay_expense() to change the expense status';
  end if;
  if new.company_id <> old.company_id then raise exception 'The office of an expense cannot change'; end if;
  return new;
end $$;
drop trigger if exists a_expense_workflow on public.expenses;
create trigger a_expense_workflow before insert or update or delete on public.expenses
  for each row execute function public.trg_expense_workflow();

-- Vehicle timeline: written when the expense is approved (drafts and rejected expenses are not costs),
-- in the office currency.
create or replace function public.trg_expense_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.vehicle_id is not null and new.status = 'Approved'
     and (tg_op = 'INSERT' or old.status is distinct from 'Approved') then
    insert into public.vehicle_timeline (company_id, vehicle_id, date, title, description, amount, currency, category,
                                         reference_id, reference_type)
    values (new.company_id, new.vehicle_id, new.date, new.category || ' Expense: ' || new.description,
            'Payment via ' || new.payment_method || coalesce('. Cost Centre: ' || nullif(btrim(new.cost_centre), ''), ''),
            new.total, coalesce((select currency from public.companies where id = new.company_id), 'OMR'), 'Expense', new.id, 'Expense');
  end if;
  return null;
end $$;
drop trigger if exists expenses_after_ins on public.expenses;
create trigger expenses_after_ins after insert or update of status on public.expenses
  for each row execute function public.trg_expense_after_insert();

-- Recurring templates: links in the template's office; a vehicle when the category needs one
create or replace function public.trg_recurring_expense_check() returns trigger
language plpgsql security definer set search_path = public as $$
declare c public.expense_categories;
begin
  select * into c from public.expense_categories where id = new.category_id;
  if not found or not c.active then raise exception 'Choose an active expense category'; end if;
  if c.requires_vehicle and new.vehicle_id is null then raise exception 'Expense category % requires a vehicle', c.name; end if;
  if new.vehicle_id is not null and not exists (select 1 from public.vehicles where id = new.vehicle_id and company_id = new.company_id) then
    raise exception 'The vehicle belongs to another office';
  end if;
  return new;
end $$;
revoke execute on function public.trg_recurring_expense_check() from anon, authenticated, public;
drop trigger if exists recurring_expenses_check on public.recurring_expenses;
create trigger recurring_expenses_check before insert or update on public.recurring_expenses
  for each row execute function public.trg_recurring_expense_check();

-- ---------------------------------------------------------------------
-- 3. Budget alerts (80% / 100% of the approved annual budget, per expense account)
-- ---------------------------------------------------------------------
create or replace function public._budget_alerts(p_company uuid, p_year int, p_codes text[] default null)
returns integer language plpgsql security definer set search_path = public as $$
declare v_n integer := 0; v_c integer;
begin
  insert into public.notifications (company_id, user_id, type, title, message, severity, link, reference_id, dedupe_key)
  select p_company, null, 'budget_threshold',
         case when x.pct >= 100 then 'Budget exceeded: ' else 'Budget 80% used: ' end || x.code || ' ' || x.name,
         x.code || ' ' || x.name || ' has used ' || round(x.pct) || '% of its ' || p_year || ' budget (' || x.actual || ' of ' || x.budget || ').',
         case when x.pct >= 100 then 'critical' else 'warning' end, 'budgets', x.budget_id,
         'budget:' || p_year || ':' || x.code || ':' || case when x.pct >= 100 then '100' else '80' end
  from (
    select bl.account_code code, a.name, b.id budget_id, sum(bl.amount) budget,
           coalesce((select sum(jl.debit - jl.credit) from public.journal_lines jl join public.journal_entries je on je.id = jl.entry_id
                      where je.company_id = p_company and jl.account_code = bl.account_code and je.status <> 'Draft'
                        and extract(year from je.date)::int = p_year), 0) actual,
           0::numeric pct
      from public.budgets b join public.budget_lines bl on bl.budget_id = b.id
      join public.accounts a on a.company_id = b.company_id and a.code = bl.account_code and a.category = 'Expense'
     where b.company_id = p_company and b.year = p_year and b.status = 'Approved'
       and (p_codes is null or bl.account_code = any(p_codes))
     group by bl.account_code, a.name, b.id
  ) y cross join lateral (select y.code, y.name, y.budget_id, y.budget, round(y.actual, 3) actual,
                                 case when y.budget > 0 then y.actual / y.budget * 100 else 0 end pct) x
  where x.budget > 0 and x.pct >= 80
  on conflict (company_id, dedupe_key) where dedupe_key is not null do nothing;
  get diagnostics v_c = row_count; v_n := v_n + v_c;
  return v_n;
end $$;
revoke all on function public._budget_alerts(uuid, int, text[]) from public, anon, authenticated;

create or replace function public.refresh_budget_alerts() returns integer
language plpgsql security definer set search_path = public as $$
declare r record; v_n integer := 0;
begin
  for r in select company_id, year from public.budgets where status = 'Approved' and year = extract(year from current_date)::int loop
    v_n := v_n + public._budget_alerts(r.company_id, r.year, null);
  end loop;
  return v_n;
end $$;
revoke all on function public.refresh_budget_alerts() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. Posting and workflow
-- ---------------------------------------------------------------------
create or replace function public._expense_approve(p_id uuid, p_approver uuid, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare e public.expenses; ba public.bank_accounts; v_gl text; v_net numeric; v_lines jsonb; v_je uuid;
begin
  select * into e from public.expenses where id = p_id for update;
  v_gl := coalesce(nullif(btrim(e.gl_account_code), ''), '5000');
  perform public.ensure_system_account(e.company_id, v_gl, coalesce(nullif(btrim(e.category), ''), 'General Expenses'), 'Expense', 'Operating Expense');
  v_net := round(e.total - e.tax, 3);
  v_lines := '[]'::jsonb;
  if v_net > 0 then
    v_lines := v_lines || jsonb_build_object('account_code', v_gl, 'debit', v_net, 'description', e.description,
                                             'vehicle_id', e.vehicle_id, 'cost_centre', nullif(btrim(e.cost_centre), ''));
  end if;
  if e.tax > 0 then
    perform public.ensure_system_account(e.company_id, '1300', 'Input VAT Recoverable', 'Asset', 'Current Assets');
    v_lines := v_lines || jsonb_build_object('account_code', '1300', 'debit', e.tax, 'description', 'VAT on ' || e.expense_number);
  end if;
  if e.bank_account_id is not null then
    select * into ba from public.bank_accounts where id = e.bank_account_id;
    v_lines := v_lines || jsonb_build_object('account_code', ba.gl_account_code, 'credit', e.total, 'bank_account_id', ba.id,
                                             'description', 'Paid ' || e.expense_number);
  else
    perform public.ensure_system_account(e.company_id, '2010', 'Accounts Payable', 'Liability', 'Current Liabilities');
    v_lines := v_lines || jsonb_build_object('account_code', '2010', 'credit', e.total, 'description', 'Payable ' || e.expense_number);
  end if;
  v_je := public.post_journal_entry(e.company_id, e.date, 'Expense ' || e.expense_number || ': ' || e.description, v_lines,
                                    e.expense_number, 'Expense', e.id);
  perform set_config('erp.expense', 'on', true);
  update public.expenses set status = 'Approved', approved_by = p_approver, approved_at = now(), journal_entry_id = v_je,
         review_note = coalesce(nullif(btrim(coalesce(p_note, '')), ''), review_note),
         payment_status = case when bank_account_id is not null then 'Paid' else 'Unpaid' end,
         paid_date = case when bank_account_id is not null then date else null end
   where id = p_id;
  perform set_config('erp.expense', '', true);
  perform public._budget_alerts(e.company_id, extract(year from e.date)::int, array[v_gl]);
  return v_je;
end $$;
revoke all on function public._expense_approve(uuid, uuid, text) from public, anon, authenticated;

-- Submit a draft or rejected expense. Within the submitter's expense limit it is approved and posted
-- at once; above it, it waits for an approver.
create or replace function public.submit_expense(p_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare e public.expenses;
begin
  select * into e from public.expenses where id = p_id for update;
  if not found then raise exception 'Expense not found'; end if;
  if not public.can_in(e.company_id, 'expenses', 'create') then raise exception 'Permission denied' using errcode = '42501'; end if;
  if e.status not in ('Draft', 'Rejected') then raise exception 'Only draft or rejected expenses can be submitted'; end if;
  if e.total <= 0 then raise exception 'The expense total must be greater than zero'; end if;
  if public.period_is_closed(e.company_id, e.date) then
    raise exception 'The accounting period for % is closed for this office', to_char(e.date, 'Mon YYYY');
  end if;
  perform set_config('erp.expense', 'on', true);
  update public.expenses set submitted_by = auth.uid(), submitted_at = now(), review_note = null where id = p_id;
  if public.can_approve_in(e.company_id, 'expense', e.total) then
    perform set_config('erp.expense', '', true);
    perform public._expense_approve(p_id, auth.uid(), null);
    return 'Approved';
  end if;
  update public.expenses set status = 'Pending Approval' where id = p_id;
  perform set_config('erp.expense', '', true);
  insert into public.notifications (company_id, user_id, type, title, message, severity, link, reference_id)
  values (e.company_id, null, 'approval_required', 'Expense waiting for approval: ' || e.expense_number,
          e.category || ' · ' || e.description || ' (' || e.total || ')', 'warning', 'approvals', e.id);
  return 'Pending Approval';
end $$;

create or replace function public.review_expense(p_id uuid, p_decision text, p_note text default null) returns text
language plpgsql security definer set search_path = public as $$
declare e public.expenses;
begin
  select * into e from public.expenses where id = p_id for update;
  if not found then raise exception 'Expense not found'; end if;
  if e.status <> 'Pending Approval' then raise exception 'This expense is not waiting for approval'; end if;
  if p_decision = 'Withdrawn' then
    if e.submitted_by is distinct from auth.uid() and not public.is_super_admin() then
      raise exception 'Only the person who submitted it can withdraw it' using errcode = '42501';
    end if;
    perform set_config('erp.expense', 'on', true);
    update public.expenses set status = 'Draft', submitted_by = null, submitted_at = null where id = p_id;
    perform set_config('erp.expense', '', true);
    return 'Draft';
  end if;
  if p_decision not in ('Approved', 'Rejected') then raise exception 'Invalid decision'; end if;
  if not public.can_in(e.company_id, 'expenses', 'approve') then raise exception 'Permission denied' using errcode = '42501'; end if;
  if e.submitted_by = auth.uid() and not public.is_super_admin() then
    raise exception 'You cannot approve or reject your own expense' using errcode = '42501';
  end if;
  if p_decision = 'Approved' and not public.can_approve_in(e.company_id, 'expense', e.total) then
    raise exception 'This expense is above your expense approval limit' using errcode = '42501';
  end if;
  if p_decision = 'Rejected' and coalesce(btrim(p_note), '') = '' then raise exception 'A reason is required to reject an expense'; end if;
  if p_decision = 'Approved' then
    perform public._expense_approve(p_id, auth.uid(), p_note);
  else
    perform set_config('erp.expense', 'on', true);
    update public.expenses set status = 'Rejected', review_note = btrim(p_note), approved_by = null, approved_at = null where id = p_id;
    perform set_config('erp.expense', '', true);
  end if;
  if e.submitted_by is not null then
    insert into public.notifications (company_id, user_id, type, title, message, severity, link, reference_id)
    values (e.company_id, e.submitted_by, 'expense_' || lower(p_decision), 'Expense ' || lower(p_decision) || ': ' || e.expense_number,
            coalesce(nullif(btrim(coalesce(p_note, '')), ''), e.description), case p_decision when 'Approved' then 'success' else 'warning' end,
            'expenses', e.id);
  end if;
  return p_decision;
end $$;

-- Pay an approved expense that was posted to payables
create or replace function public.pay_expense(p_id uuid, p_bank uuid, p_date date default current_date) returns uuid
language plpgsql security definer set search_path = public as $$
declare e public.expenses; ba public.bank_accounts; v_je uuid;
begin
  select * into e from public.expenses where id = p_id for update;
  if not found then raise exception 'Expense not found'; end if;
  if not public.can_in(e.company_id, 'payments', 'create') then raise exception 'Permission denied' using errcode = '42501'; end if;
  if e.status <> 'Approved' or e.journal_entry_id is null then raise exception 'Only approved, posted expenses can be paid'; end if;
  if e.payment_status = 'Paid' then raise exception 'This expense is already paid'; end if;
  if not public.can_approve_in(e.company_id, 'payment', e.total) then
    raise exception 'This payment is above your payment approval limit; ask a Finance Manager to record it';
  end if;
  if p_date is null or p_date < e.date then raise exception 'The payment date cannot be before the expense date'; end if;
  select * into ba from public.bank_accounts where id = p_bank and company_id = e.company_id and active;
  if not found then raise exception 'Choose an active bank account of this office'; end if;
  v_je := public.post_journal_entry(e.company_id, p_date, 'Payment of expense ' || e.expense_number,
            jsonb_build_array(jsonb_build_object('account_code', '2010', 'debit', e.total, 'description', 'Payable ' || e.expense_number),
                              jsonb_build_object('account_code', ba.gl_account_code, 'credit', e.total, 'bank_account_id', ba.id,
                                                 'description', 'Paid ' || e.expense_number)),
            e.expense_number, 'Payment', e.id);
  perform set_config('erp.expense', 'on', true);
  update public.expenses set payment_status = 'Paid', paid_date = p_date, bank_account_id = ba.id, payment_journal_entry_id = v_je where id = p_id;
  perform set_config('erp.expense', '', true);
  return v_je;
end $$;

revoke execute on function public.submit_expense(uuid), public.review_expense(uuid, text, text), public.pay_expense(uuid, uuid, date) from anon, public;
grant execute on function public.submit_expense(uuid), public.review_expense(uuid, text, text), public.pay_expense(uuid, uuid, date) to authenticated;

-- ---------------------------------------------------------------------
-- 5. Recurring monthly expenses
-- ---------------------------------------------------------------------
-- One draft per template and month, dated on the template's day of the month, once that day has come.
-- Safe to run repeatedly. Server-side callers (cron) cover every office; signed-in users only offices
-- where they may create expenses.
create or replace function public.generate_recurring_expenses(p_as_of date default current_date) returns integer
language plpgsql security definer set search_path = public as $$
declare t record; v_period date; v_due date; v_id uuid; v_no text; v_n integer := 0; v_server boolean := auth.uid() is null;
        v_cat public.expense_categories;
begin
  for t in select * from public.recurring_expenses r
            where r.active and r.start_date <= p_as_of
              and (v_server or public.can_in(r.company_id, 'expenses', 'create'))
            order by r.company_id, r.day_of_month loop
    select * into v_cat from public.expense_categories where id = t.category_id;
    v_period := date_trunc('month', greatest(t.start_date,
                  coalesce((t.last_generated_period + interval '1 month')::date, t.start_date)))::date;
    while v_period <= date_trunc('month', p_as_of)::date loop
      v_due := v_period + (t.day_of_month - 1);
      exit when v_due > p_as_of or (t.end_date is not null and v_due > t.end_date);
      if v_due >= t.start_date then
        begin
          perform set_config('erp.expense', 'on', true);
          insert into public.expenses (company_id, expense_number, vehicle_id, date, category, category_id, supplier_id, description,
                                       quantity, unit_price, tax, total, payment_method, notes, status, payment_status,
                                       recurring_expense_id, recurring_period, created_by)
          values (t.company_id, null, t.vehicle_id, v_due, v_cat.name, t.category_id, t.supplier_id,
                  t.description || ' (' || to_char(v_period, 'Mon YYYY') || ')', 1, t.amount, t.tax, t.amount + t.tax,
                  t.payment_method, t.notes, 'Draft', 'Unpaid', t.id, v_period, t.created_by)
          on conflict (recurring_expense_id, recurring_period) where recurring_expense_id is not null do nothing
          returning id, expense_number into v_id, v_no;
          perform set_config('erp.expense', '', true);
          if v_id is not null then
            v_n := v_n + 1;
            insert into public.notifications (company_id, user_id, type, title, message, severity, link, reference_id, dedupe_key)
            values (t.company_id, null, 'recurring_expense_due', 'Monthly expense ready to submit: ' || v_no,
                    t.description || ' for ' || to_char(v_period, 'Mon YYYY') || ', due ' || to_char(v_due, 'YYYY-MM-DD') || ' (' || (t.amount + t.tax) || ').',
                    'info', 'expenses', v_id, 'recurring:' || t.id || ':' || v_period)
            on conflict (company_id, dedupe_key) where dedupe_key is not null do nothing;
          end if;
        exception when others then
          perform set_config('erp.expense', '', true);
          insert into public.notifications (company_id, user_id, type, title, message, severity, link, reference_id, dedupe_key)
          values (t.company_id, null, 'recurring_expense_failed', 'Monthly expense not created: ' || t.description,
                  'The draft for ' || to_char(v_period, 'Mon YYYY') || ' could not be created: ' || sqlerrm, 'critical', 'expenses', t.id,
                  'recurring-failed:' || t.id || ':' || v_period)
          on conflict (company_id, dedupe_key) where dedupe_key is not null do nothing;
          exit;   -- retry this template on the next run
        end;
      end if;
      update public.recurring_expenses set last_generated_period = v_period where id = t.id;
      v_period := (v_period + interval '1 month')::date;
    end loop;
  end loop;

  -- Drafts from templates still not submitted a week after their date
  insert into public.notifications (company_id, user_id, type, title, message, severity, link, reference_id, dedupe_key)
  select e.company_id, null, 'recurring_expense_overdue', 'Monthly expense overdue: ' || e.expense_number,
         e.description || ' was due on ' || to_char(e.date, 'YYYY-MM-DD') || ' and has not been submitted.', 'warning', 'expenses', e.id,
         'recurring-overdue:' || e.id
    from public.expenses e
   where e.recurring_expense_id is not null and e.status = 'Draft' and e.date < p_as_of - 7
     and (v_server or public.can_in(e.company_id, 'expenses', 'view'))
  on conflict (company_id, dedupe_key) where dedupe_key is not null do nothing;
  return v_n;
end $$;
revoke execute on function public.generate_recurring_expenses(date) from anon, public;
grant execute on function public.generate_recurring_expenses(date) to authenticated;

-- ---------------------------------------------------------------------
-- 6. Daily job
-- ---------------------------------------------------------------------
create or replace function public.run_daily_finance_jobs() returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_rec integer; v_bud integer;
begin
  v_rec := public.generate_recurring_expenses(current_date);
  v_bud := public.refresh_budget_alerts();
  return jsonb_build_object('recurring_drafts', v_rec, 'budget_alerts', v_bud);
end $$;
revoke all on function public.run_daily_finance_jobs() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('daily-finance-jobs', '15 2 * * *', 'select public.run_daily_finance_jobs()');
  end if;
end $$;

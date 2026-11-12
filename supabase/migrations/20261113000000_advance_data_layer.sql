-- =====================================================================================
-- Advance brief, Phase 1: data layer for server-side lists and database aggregation.
--   1. Indexes for every filter and sort the lists use.
--   2. ledger_movements(): posted debit/credit per office and account over a date range. The
--      trial balance, P&L and balance sheet are computed from these totals with the same
--      TypeScript functions as before, so the numbers cannot drift (parity test in
--      src/services/__tests__/ledgerParity.test.ts).
--   3. general_ledger_page(): one account's lines in a date range, paged, with the running
--      balance computed in the database.
--   4. v_invoice_list / v_payment_list / v_expense_list / v_journal_list: list views with the
--      display columns the tables show and a search column, so lists can filter, sort, search
--      and count on the server. security_invoker: the base tables' RLS applies unchanged.
-- No business rule changes.
-- =====================================================================================

-- ---------------------------------------------------------------------
-- 1. Indexes
-- ---------------------------------------------------------------------
create index if not exists invoices_list_idx on public.invoices (company_id, invoice_type, invoice_date desc, invoice_number desc);
create index if not exists invoices_date_idx on public.invoices (invoice_date desc, invoice_number desc);
create index if not exists invoices_vehicle_idx on public.invoices (vehicle_id) where vehicle_id is not null;
create index if not exists invoices_approval_idx on public.invoices (company_id, approval_status);
create index if not exists invoices_parent_idx on public.invoices (parent_invoice_id) where parent_invoice_id is not null;
create index if not exists journal_entries_list_idx on public.journal_entries (company_id, date desc, entry_number desc);
create index if not exists journal_entries_date_idx on public.journal_entries (date desc, entry_number desc);
create index if not exists journal_entries_source_idx on public.journal_entries (source_module, source_id) where source_id is not null;
create index if not exists journal_lines_account_entry_idx on public.journal_lines (account_code, company_id, entry_id);
create index if not exists payments_list_idx on public.payments (company_id, payment_date desc, payment_number desc);
create index if not exists payments_date_idx on public.payments (payment_date desc, payment_number desc);
create index if not exists expenses_date_idx on public.expenses (date desc, expense_number desc);
create index if not exists expenses_supplier_idx on public.expenses (supplier_id) where supplier_id is not null;
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);
create index if not exists notifications_created_idx on public.notifications (created_at desc);
create index if not exists notification_reads_user_idx on public.notification_reads (user_id, notification_id);
create index if not exists audit_logs_user_idx on public.audit_logs (user_id, occurred_at desc);
create index if not exists audit_logs_entity_time_idx on public.audit_logs (entity_type, occurred_at desc);

-- ---------------------------------------------------------------------
-- 2. Ledger movements
-- ---------------------------------------------------------------------
-- Offices whose ledger totals the caller may read: ledger readers (accounting:view) and
-- statement-only users (financial-statements:view). Same set the app used before: journal
-- lines through RLS for the former, statement_daily_totals() for the latter.
create or replace function public.ledger_company_ids() returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct x), '{}')
    from unnest(public.perm_company_ids('accounting', 'view') || public.perm_company_ids('financial-statements', 'view')) x
$$;
revoke all on function public.ledger_company_ids() from public, anon;
grant execute on function public.ledger_company_ids() to authenticated;

-- Posted movements per office and account. p_company null = every office the caller may read.
-- p_from / p_to are inclusive and optional.
create or replace function public.ledger_movements(p_company uuid default null, p_from date default null, p_to date default null)
returns table (company_id uuid, account_code text, debit numeric, credit numeric)
language sql stable security definer set search_path = public as $$
  select l.company_id, l.account_code, sum(l.debit), sum(l.credit)
    from public.journal_entries e
    join public.journal_lines l on l.entry_id = e.id
   where e.status = 'Posted'
     and e.company_id = any(public.ledger_company_ids())
     and (p_company is null or e.company_id = p_company)
     and (p_from is null or e.date >= p_from)
     and (p_to is null or e.date <= p_to)
   group by l.company_id, l.account_code
$$;
revoke all on function public.ledger_movements(uuid, date, date) from public, anon;
grant execute on function public.ledger_movements(uuid, date, date) to authenticated;

-- ---------------------------------------------------------------------
-- 3. General ledger page (ledger readers only: it shows entry detail)
-- ---------------------------------------------------------------------
-- One account (by code; summed across the caller's offices when p_company is null), lines dated
-- p_from..p_to ordered by date, entry number and line, with the running balance in the
-- account's normal direction starting from the balance brought forward. total_count is the
-- number of lines in range, so the browser can page without loading them all.
create or replace function public.general_ledger_page(p_company uuid, p_account text, p_from date, p_to date,
                                                      p_limit integer default 100, p_offset integer default 0)
returns table (line_id uuid, entry_id uuid, entry_number text, date date, reference text, description text,
               source_module text, vehicle_plate text, cost_centre text, company_id uuid,
               debit numeric, credit numeric, running_balance numeric, total_count bigint)
language plpgsql stable security definer set search_path = public as $$
declare
  v_companies uuid[] := public.perm_company_ids('accounting', 'view');
  v_debit_normal boolean;
  v_open numeric;
begin
  if p_limit is null or p_limit < 1 or p_limit > 1000 then raise exception 'Page size must be between 1 and 1000'; end if;
  if p_company is not null then
    if not p_company = any(v_companies) then raise exception 'Permission denied' using errcode = '42501'; end if;
    v_companies := array[p_company];
  end if;
  select bool_or(a.category in ('Asset', 'Expense')), coalesce(sum(a.opening_balance), 0)
    into v_debit_normal, v_open
    from public.accounts a where a.code = p_account and a.company_id = any(v_companies);
  if v_debit_normal is null then return; end if;
  -- balance brought forward: opening balance + posted movements before p_from
  if p_from is not null then
    select v_open + coalesce(sum(case when v_debit_normal then l.debit - l.credit else l.credit - l.debit end), 0)
      into v_open
      from public.journal_entries e join public.journal_lines l on l.entry_id = e.id
     where e.status = 'Posted' and l.account_code = p_account and l.company_id = any(v_companies) and e.date < p_from;
  end if;
  return query
  with ln as (
    select l.id, e.id eid, e.entry_number, e.date, e.reference, coalesce(nullif(l.description, ''), e.description) descr,
           coalesce(e.source_module, 'Manual') src, v.plate_number, l.cost_centre, l.company_id, l.debit, l.credit
      from public.journal_entries e
      join public.journal_lines l on l.entry_id = e.id
      left join public.vehicles v on v.id = l.vehicle_id
     where e.status = 'Posted' and l.account_code = p_account and l.company_id = any(v_companies)
       and (p_from is null or e.date >= p_from) and (p_to is null or e.date <= p_to)
  ), numbered as (
    select ln.*, round(v_open + sum(case when v_debit_normal then ln.debit - ln.credit else ln.credit - ln.debit end)
                   over (order by ln.date, ln.entry_number, ln.id rows between unbounded preceding and current row), 3) rb,
           count(*) over () cnt
      from ln
  )
  select n.id, n.eid, n.entry_number, n.date, n.reference, n.descr, n.src, n.plate_number, n.cost_centre, n.company_id,
         n.debit, n.credit, n.rb, n.cnt
    from numbered n
   order by n.date, n.entry_number, n.id
   limit p_limit offset greatest(p_offset, 0);
end $$;
revoke all on function public.general_ledger_page(uuid, text, date, date, integer, integer) from public, anon;
grant execute on function public.general_ledger_page(uuid, text, date, date, integer, integer) to authenticated;

-- ---------------------------------------------------------------------
-- 4. List views (security_invoker: RLS of the base tables applies)
-- ---------------------------------------------------------------------
-- Invoice status as the app shows it: approved, unpaid invoices past their due date are
-- "Overdue" (same rule as effectivePaymentStatus in src/services/finance.ts). The browser
-- passes its local date as the "today" filter value, so no time-zone drift.
create or replace view public.v_invoice_list with (security_invoker = true) as
select i.*,
       c.name as company_name,
       coalesce(i.party_snapshot->>'name', s.name, cu.name, '') as party_name,
       v.plate_number as vehicle_plate,
       w.work_order_number,
       lower(concat_ws(' ', i.invoice_number, i.reference_number, i.purchase_order_number,
                       coalesce(i.party_snapshot->>'name', s.name, cu.name), v.plate_number, c.name, i.notes)) as search_text
  from public.invoices i
  join public.companies c on c.id = i.company_id
  left join public.suppliers s on s.id = i.supplier_id
  left join public.customers cu on cu.id = i.customer_id
  left join public.vehicles v on v.id = i.vehicle_id
  left join public.work_orders w on w.id = i.work_order_id;
grant select on public.v_invoice_list to authenticated;
revoke all on public.v_invoice_list from anon;

create or replace view public.v_payment_list with (security_invoker = true) as
select p.*,
       c.name as company_name,
       i.invoice_number, i.invoice_type, i.party_type, i.supplier_id, i.customer_id,
       coalesce(i.party_snapshot->>'name', s.name, cu.name, '') as party_name,
       b.account_name as bank_account_name, b.bank_name,
       lower(concat_ws(' ', p.payment_number, i.invoice_number, coalesce(i.party_snapshot->>'name', s.name, cu.name),
                       p.transaction_reference, p.cheque_number, p.payment_method, b.account_name, b.bank_name)) as search_text
  from public.payments p
  join public.companies c on c.id = p.company_id
  left join public.invoices i on i.id = p.invoice_id
  left join public.suppliers s on s.id = i.supplier_id
  left join public.customers cu on cu.id = i.customer_id
  left join public.bank_accounts b on b.id = p.bank_account_id;
grant select on public.v_payment_list to authenticated;
revoke all on public.v_payment_list from anon;

create or replace view public.v_journal_list with (security_invoker = true) as
select e.*,
       pr.name as posted_by_name,
       coalesce((select sum(l.debit) from public.journal_lines l where l.entry_id = e.id), 0) as total_debit,
       coalesce((select sum(l.credit) from public.journal_lines l where l.entry_id = e.id), 0) as total_credit,
       lower(concat_ws(' ', e.entry_number, e.reference, e.description, e.source_module)) as search_text
  from public.journal_entries e
  left join public.profiles pr on pr.id = e.posted_by;
grant select on public.v_journal_list to authenticated;
revoke all on public.v_journal_list from anon;

-- ---------------------------------------------------------------------
-- 5. Invoices: status as shown, server-side list and summary
-- ---------------------------------------------------------------------
-- Same rule as effectivePaymentStatus() in src/services/finance.ts. p_today is the browser's
-- local date, so "overdue" never shifts with the server's time zone.
create or replace function public.invoice_status_at(p_stored text, p_approval text, p_credit_note boolean,
  p_outstanding numeric, p_paid numeric, p_due date, p_today date) returns text
language sql immutable set search_path = public as $$
  select case
    when p_credit_note or p_approval <> 'Approved' or p_stored in ('Paid', 'Cancelled') or coalesce(p_outstanding, 0) <= 0.0005 then p_stored
    when p_due is not null and p_due < p_today then 'Overdue'
    when coalesce(p_paid, 0) > 0 then 'Partially Paid'
    else 'Unpaid' end
$$;
grant execute on function public.invoice_status_at(text, text, boolean, numeric, numeric, date, date) to authenticated;
revoke all on function public.invoice_status_at(text, text, boolean, numeric, numeric, date, date) from anon;

-- One page of the invoice register. Filters mirror the Invoices page; p_party / p_vehicle /
-- p_from / p_to serve the party, vehicle and report pages. RLS of invoices applies (invoker).
create or replace function public.invoice_page(
  p_company uuid default null, p_view text default 'all', p_type text default null, p_status text default null,
  p_approval text default null, p_attachment text default null, p_search text default null,
  p_sort text default 'invoice_date', p_ascending boolean default false, p_limit integer default 25, p_offset integer default 0,
  p_today date default current_date, p_party uuid default null, p_vehicle uuid default null,
  p_from date default null, p_to date default null, p_parent uuid default null, p_open_only boolean default false)
returns table (data jsonb, total_count bigint)
language plpgsql stable security invoker set search_path = public as $$
declare
  v_sort text := case when p_sort in ('invoice_number', 'party_name', 'invoice_date', 'due_date', 'grand_total',
                                      'outstanding_amount', 'effective_status', 'attachment_path', 'created_at', 'invoice_type')
                      then p_sort else 'invoice_date' end;
  v_words text[] := array(select w from unnest(regexp_split_to_array(lower(coalesce(p_search, '')), '\s+')) w where w <> '' limit 6);
begin
  if p_limit is null or p_limit < 1 or p_limit > 1000 then raise exception 'Page size must be between 1 and 1000'; end if;
  return query execute format($q$
    with f as (
      select v.*, public.invoice_status_at(v.payment_status, v.approval_status, v.is_credit_note, v.outstanding_amount, v.amount_paid, v.due_date, $1) as effective_status
        from public.v_invoice_list v
       where ($2::uuid is null or v.company_id = $2)
         and ($3::text is null or v.invoice_type::text = $3)
         and ($4::text is null or v.approval_status = $4)
         and ($5::text is null or ($5 = 'with-attachment' and v.attachment_path is not null) or ($5 = 'no-attachment' and v.attachment_path is null))
         and ($6::uuid is null or v.supplier_id = $6 or v.customer_id = $6)
         and ($7::uuid is null or v.vehicle_id = $7 or exists (select 1 from public.invoice_lines l where l.invoice_id = v.id and l.vehicle_id = $7))
         and ($8::date is null or v.invoice_date >= $8)
         and ($9::date is null or v.invoice_date <= $9)
         and ($10::uuid is null or v.parent_invoice_id = $10)
         and (cardinality($11::text[]) = 0 or (select bool_and(v.search_text like '%%' || w || '%%') from unnest($11::text[]) w))
    ), g as (
      select f.* from f
       where ($12::text is null or f.effective_status = $12)
         and (not $13 or (f.outstanding_amount > 0 and f.payment_status <> 'Cancelled'))
         and case $14
               when 'pending' then f.approval_status = 'Approved' and not f.is_credit_note and f.effective_status not in ('Cancelled', 'Paid') and f.outstanding_amount > 0.0005
               when 'overdue' then f.effective_status = 'Overdue'
               when 'approval' then f.approval_status = 'Pending Approval'
               when 'draft' then f.approval_status = 'Draft'
               when 'paid' then f.effective_status = 'Paid'
               else true end
    )
    select to_jsonb(g), count(*) over ()
      from g
     order by %I %s nulls last, g.created_at %s, g.id
     limit $15 offset $16
  $q$, v_sort, case when p_ascending then 'asc' else 'desc' end, case when p_ascending then 'asc' else 'desc' end)
  using p_today, p_company, p_type, p_approval, p_attachment, p_party, p_vehicle, p_from, p_to, p_parent, v_words,
        p_status, coalesce(p_open_only, false), coalesce(p_view, 'all'), p_limit, greatest(coalesce(p_offset, 0), 0);
end $$;
revoke all on function public.invoice_page(uuid, text, text, text, text, text, text, text, boolean, integer, integer, date, uuid, uuid, date, date, uuid, boolean) from public, anon;
grant execute on function public.invoice_page(uuid, text, text, text, text, text, text, text, boolean, integer, integer, date, uuid, uuid, date, date, uuid, boolean) to authenticated;

-- Every figure the invoice, finance and dashboard pages show about invoices, for one office or
-- all the caller can see. Credit notes count with negative totals and no outstanding balance
-- (same as rowToInvoice). Definitions are those of the pages they replace (see the keys).
create or replace function public.invoice_summary(p_company uuid default null, p_today date default current_date)
returns jsonb
language sql stable security invoker set search_path = public as $$
  with inv as (
    select v.id, v.company_id, v.invoice_type::text as itype, v.approval_status, v.is_credit_note as cn, v.attachment_path,
           v.supplier_id, v.customer_id, v.party_name, v.due_date,
           case when v.is_credit_note then -v.grand_total else v.grand_total end as signed_total,
           case when v.is_credit_note then 0 else v.outstanding_amount end as open_amt,
           v.payment_status as stored,
           public.invoice_status_at(v.payment_status, v.approval_status, v.is_credit_note, v.outstanding_amount, v.amount_paid, v.due_date, p_today) as eff
      from public.v_invoice_list v
     where p_company is null or v.company_id = p_company
  ), pend as (
    select *, case when p_today - due_date <= 0 then 0 when p_today - due_date <= 30 then 1 when p_today - due_date <= 60 then 2
                   when p_today - due_date <= 90 then 3 else 4 end as bucket
      from inv where approval_status = 'Approved' and not cn and eff not in ('Cancelled', 'Paid') and open_amt > 0.0005
  ), offices as (
    select company_id,
           coalesce(sum(open_amt) filter (where approval_status = 'Approved' and open_amt > 0 and itype = 'Sales'), 0) ar_open,
           coalesce(sum(open_amt) filter (where approval_status = 'Approved' and open_amt > 0 and itype = 'Purchase'), 0) ap_open,
           count(*) filter (where approval_status = 'Approved' and open_amt > 0 and not cn and itype = 'Purchase') ap_open_count,
           count(*) filter (where approval_status = 'Approved' and open_amt > 0 and not cn and itype = 'Sales' and due_date < p_today) ar_overdue_count,
           coalesce(sum(open_amt) filter (where approval_status = 'Approved' and open_amt > 0 and not cn and itype = 'Sales' and due_date < p_today), 0) ar_overdue_sum,
           count(*) filter (where approval_status = 'Pending Approval') pending_approval
      from inv group by company_id
  )
  select jsonb_build_object(
    'count_all', (select count(*) from inv),
    'count_pending', (select count(*) from pend),
    'count_overdue', (select count(*) from inv where eff = 'Overdue'),
    'count_approval', (select count(*) from inv where approval_status = 'Pending Approval'),
    'count_draft', (select count(*) from inv where approval_status = 'Draft'),
    'count_paid', (select count(*) from inv where eff = 'Paid'),
    'count_with_attachment', (select count(*) from inv where attachment_path is not null),
    'purchase_total', (select coalesce(sum(signed_total), 0) from inv where approval_status = 'Approved' and itype = 'Purchase'),
    'sales_total', (select coalesce(sum(signed_total), 0) from inv where approval_status = 'Approved' and itype = 'Sales'),
    'ap_outstanding', (select coalesce(sum(open_amt), 0) from inv where approval_status = 'Approved' and itype = 'Purchase'),
    'ar_outstanding', (select coalesce(sum(open_amt), 0) from inv where approval_status = 'Approved' and itype = 'Sales'),
    'aging_ap', (select jsonb_agg(coalesce((select sum(open_amt) from pend where itype = 'Purchase' and bucket = b), 0) order by b) from generate_series(0, 4) b),
    'aging_ar', (select jsonb_agg(coalesce((select sum(open_amt) from pend where itype = 'Sales' and bucket = b), 0) order by b) from generate_series(0, 4) b),
    'top_parties', coalesce((select jsonb_agg(t order by t.total desc) from (
        select min(party_name) as name, case when itype = 'Purchase' then 'Supplier' else 'Customer' end as type,
               count(*) as count, sum(open_amt) as total
          from pend group by itype, coalesce(supplier_id, customer_id) order by sum(open_amt) desc limit 8) t), '[]'::jsonb),
    -- finance overview: open balances of documents that are not cancelled
    'fo_receivables', (select coalesce(sum(open_amt), 0) from inv where itype = 'Sales' and eff <> 'Cancelled'),
    'fo_payables', (select coalesce(sum(open_amt), 0) from inv where itype = 'Purchase' and eff <> 'Cancelled'),
    'fo_overdue_sales', (select count(*) from inv where itype = 'Sales' and eff = 'Overdue'),
    -- fleet dashboard: open supplier bills
    'open_purchase_count', (select count(*) from inv where itype = 'Purchase' and approval_status = 'Approved' and not cn and eff not in ('Paid', 'Cancelled') and open_amt > 0),
    'open_purchase_outstanding', (select coalesce(sum(open_amt), 0) from inv where itype = 'Purchase' and approval_status = 'Approved' and not cn and eff not in ('Paid', 'Cancelled') and open_amt > 0),
    'by_office', coalesce((select jsonb_agg(o) from offices o), '[]'::jsonb)
  )
$$;
revoke all on function public.invoice_summary(uuid, date) from public, anon;
grant execute on function public.invoice_summary(uuid, date) to authenticated;

-- Sales (invoiced subtotal, credit notes deducted, cancelled excluded), approved expenses and
-- maintenance cost per day, for the dashboard charts and month-on-month sales.
create or replace function public.dashboard_series(p_company uuid, p_from date, p_to date)
returns table (day date, sales numeric, expenses numeric, maintenance numeric)
language sql stable security invoker set search_path = public as $$
  with s as (
    select i.invoice_date d, sum(case when i.is_credit_note then -abs(i.subtotal) else i.subtotal end) v
      from public.invoices i
     where i.invoice_type = 'Sales' and i.payment_status <> 'Cancelled' and i.invoice_date between p_from and p_to
       and (p_company is null or i.company_id = p_company)
     group by 1
  ), e as (
    select x.date d, sum(x.total) v from public.expenses x
     where coalesce(x.status, 'Approved') = 'Approved' and x.date between p_from and p_to and (p_company is null or x.company_id = p_company)
     group by 1
  ), m as (
    select r.maintenance_date d, sum(r.total_cost) v from public.maintenance_records r
     where r.maintenance_date between p_from and p_to and (p_company is null or r.company_id = p_company)
     group by 1
  )
  select g::date, coalesce(s.v, 0), coalesce(e.v, 0), coalesce(m.v, 0)
    -- at most 400 days per call (the dashboard asks for 6 months)
    from generate_series(p_from, least(p_to, p_from + 400), interval '1 day') g
    left join s on s.d = g::date left join e on e.d = g::date left join m on m.d = g::date
$$;
revoke all on function public.dashboard_series(uuid, date, date) from public, anon;
grant execute on function public.dashboard_series(uuid, date, date) to authenticated;

-- ---------------------------------------------------------------------
-- 6. Expenses: list view, shared filter, page and summary
-- ---------------------------------------------------------------------
create or replace view public.v_expense_list with (security_invoker = true) as
select x.*,
       v.plate_number as vehicle_plate,
       s.name as supplier_name,
       emp.name as employee_name,
       lower(concat_ws(' ', x.expense_number, v.plate_number, x.category, x.description, s.name, x.cost_centre,
                       x.invoice_number, x.receipt_number, emp.name, x.custom_fields::text)) as search_text
  from public.expenses x
  left join public.vehicles v on v.id = x.vehicle_id
  left join public.suppliers s on s.id = x.supplier_id
  left join public.employees emp on emp.id = x.employee_id;
grant select on public.v_expense_list to authenticated;
revoke all on public.v_expense_list from anon;

-- Filter keys (all optional): company, category, status ('unpaid' = approved and not paid),
-- vehicle, employee, supplier, from, to, receipt ('with-receipt' / 'no-receipt'), recurring (true =
-- created from a monthly template), search (words, all must match), cf {key, type, value, to}
-- (custom field: boolean / dropdown equality, number and date ranges, text contains).
create or replace function public.expense_matches(x public.v_expense_list, f jsonb) returns boolean
language sql stable set search_path = public as $$
  select (f->>'company' is null or x.company_id = (f->>'company')::uuid)
     and (f->>'category' is null or x.category = f->>'category')
     and (f->>'status' is null
          or (f->>'status' = 'unpaid' and x.status = 'Approved' and x.payment_status = 'Unpaid')
          or (f->>'status' = 'draft-or-rejected' and x.status in ('Draft', 'Rejected'))
          or (f->>'status' not in ('unpaid', 'draft-or-rejected') and coalesce(x.status, 'Approved') = f->>'status'))
     and (f->>'vehicle' is null or x.vehicle_id = (f->>'vehicle')::uuid)
     and (f->>'employee' is null or x.employee_id = (f->>'employee')::uuid)
     and (f->>'supplier' is null or x.supplier_id = (f->>'supplier')::uuid)
     and (f->>'from' is null or x.date >= (f->>'from')::date)
     and (f->>'to' is null or x.date <= (f->>'to')::date)
     and (f->>'receipt' is null or (f->>'receipt' = 'with-receipt' and x.attachment_path is not null) or (f->>'receipt' = 'no-receipt' and x.attachment_path is null))
     and (coalesce((f->>'recurring')::boolean, false) = false or x.recurring_expense_id is not null)
     and (coalesce(f->>'search', '') = '' or not exists (
            select 1 from unnest(regexp_split_to_array(lower(f->>'search'), '\s+')) w where w <> '' and position(w in x.search_text) = 0))
     and (f->'cf' is null or f->'cf'->>'key' is null or case f->'cf'->>'type'
            when 'boolean' then ((f->'cf'->>'value') = 'yes') = coalesce((x.custom_fields->>(f->'cf'->>'key'))::boolean, false)
            when 'dropdown' then coalesce(x.custom_fields->>(f->'cf'->>'key'), '') = f->'cf'->>'value'
            when 'number' then x.custom_fields->>(f->'cf'->>'key') ~ '^-?[0-9.]+$'
                 and (coalesce(f->'cf'->>'value', '') = '' or (x.custom_fields->>(f->'cf'->>'key'))::numeric >= (f->'cf'->>'value')::numeric)
                 and (coalesce(f->'cf'->>'to', '') = '' or (x.custom_fields->>(f->'cf'->>'key'))::numeric <= (f->'cf'->>'to')::numeric)
            when 'date' then coalesce(x.custom_fields->>(f->'cf'->>'key'), '') <> ''
                 and (coalesce(f->'cf'->>'value', '') = '' or x.custom_fields->>(f->'cf'->>'key') >= f->'cf'->>'value')
                 and (coalesce(f->'cf'->>'to', '') = '' or x.custom_fields->>(f->'cf'->>'key') <= f->'cf'->>'to')
            else position(lower(coalesce(f->'cf'->>'value', '')) in lower(coalesce(x.custom_fields->>(f->'cf'->>'key'), ''))) > 0 end)
$$;
grant execute on function public.expense_matches(public.v_expense_list, jsonb) to authenticated;
revoke all on function public.expense_matches(public.v_expense_list, jsonb) from anon;

create or replace function public.expense_page(p_filter jsonb default '{}', p_sort text default 'date', p_ascending boolean default false,
                                               p_limit integer default 25, p_offset integer default 0)
returns table (data jsonb, total_count bigint)
language plpgsql stable security invoker set search_path = public as $$
declare
  v_sort text := case when p_sort in ('expense_number', 'date', 'category', 'total', 'status', 'vehicle_plate', 'supplier_name', 'description', 'created_at')
                      then p_sort else 'date' end;
begin
  if p_limit is null or p_limit < 1 or p_limit > 1000 then raise exception 'Page size must be between 1 and 1000'; end if;
  return query execute format($q$
    select to_jsonb(x), count(*) over ()
      from public.v_expense_list x
     where public.expense_matches(x, $1)
     order by %I %s nulls last, x.created_at %s, x.id
     limit $2 offset $3
  $q$, v_sort, case when p_ascending then 'asc' else 'desc' end, case when p_ascending then 'asc' else 'desc' end)
  using coalesce(p_filter, '{}'::jsonb), p_limit, greatest(coalesce(p_offset, 0), 0);
end $$;
revoke all on function public.expense_page(jsonb, text, boolean, integer, integer) from public, anon;
grant execute on function public.expense_page(jsonb, text, boolean, integer, integer) to authenticated;

-- Expense page figures. "Counted" = approved or pending approval (drafts and rejected are not costs).
-- office_* figures use only the office filter; filtered_* use every filter of the list.
create or replace function public.expense_summary(p_filter jsonb default '{}')
returns jsonb
language sql stable security invoker set search_path = public as $$
  with office as (
    select * from public.v_expense_list x where (p_filter->>'company' is null or x.company_id = (p_filter->>'company')::uuid)
  ), filtered as (
    select * from public.v_expense_list x where public.expense_matches(x, coalesce(p_filter, '{}'::jsonb))
  )
  select jsonb_build_object(
    'fuel_total', (select coalesce(sum(total), 0) from office where status in ('Approved', 'Pending Approval') and category = 'Fuel'),
    'approved_total', (select coalesce(sum(total), 0) from office where status = 'Approved'),
    'pending_count', (select count(*) from office where status = 'Pending Approval'),
    'unpaid_count', (select count(*) from office where status = 'Approved' and payment_status = 'Unpaid'),
    'draft_count', (select count(*) from office where status in ('Draft', 'Rejected')),
    'receipts_count', (select count(*) from office where status in ('Approved', 'Pending Approval') and attachment_path is not null),
    'categories', coalesce((select jsonb_agg(distinct category) from office), '[]'::jsonb),
    'filtered_total', (select coalesce(sum(total), 0) from filtered where status in ('Approved', 'Pending Approval')),
    'by_category', coalesce((select jsonb_agg(jsonb_build_array(category, t) order by t desc) from (
        select category, sum(total) t from filtered where status in ('Approved', 'Pending Approval') group by category) c), '[]'::jsonb)
  )
$$;
revoke all on function public.expense_summary(jsonb) from public, anon;
grant execute on function public.expense_summary(jsonb) to authenticated;

-- Approved expense totals grouped for reports: by vehicle (cost per km), by office and category
-- (expense by category). Same filters as above (company, from, to, …).
create or replace function public.expense_totals(p_filter jsonb default '{}', p_group text default 'category')
returns table (company_id uuid, vehicle_id uuid, category text, count bigint, net numeric, tax numeric, total numeric)
language sql stable security invoker set search_path = public as $$
  select case when p_group in ('office_category', 'office') then x.company_id end,
         case when p_group = 'vehicle' then x.vehicle_id end,
         case when p_group in ('category', 'office_category') then x.category end,
         count(*), coalesce(sum(x.total - coalesce(x.tax, 0)), 0), coalesce(sum(coalesce(x.tax, 0)), 0), coalesce(sum(x.total), 0)
    from public.v_expense_list x
   where coalesce(x.status, 'Approved') = 'Approved' and public.expense_matches(x, coalesce(p_filter, '{}'::jsonb))
   group by 1, 2, 3
$$;
revoke all on function public.expense_totals(jsonb, text) from public, anon;
grant execute on function public.expense_totals(jsonb, text) to authenticated;

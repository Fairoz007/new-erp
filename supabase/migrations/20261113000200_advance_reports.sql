-- =====================================================================================
-- Advance brief, Phase 1 (reports group): database aggregates for the reports, vehicle
-- profitability, vehicle dossier and party pages, so they no longer need whole invoice,
-- payment or expense tables in the browser.
--   1. party_statement(): a client / supplier statement with opening balance, running balance
--      and totals, paged (≤ 1000 lines per call). Two styles reproduce the two existing
--      statements exactly:
--        'ledger'    = finance.getPartyLedger() (General Ledger page, party tab)
--        'statement' = the Client / Supplier Statement reports (extraReports.tsx)
--   2. vehicle_financial_totals(): per vehicle, the approved expense buckets and the sales revenue
--      that getVehicleFinancialSummary() needs (maintenance, oil, tyres and accidents still come
--      from their own collections).
--   3. invoice_tax_by_month(): output / input VAT per invoice month (VAT & Tax report).
--   4. Index for the per-record audit history (party pages).
-- security invoker everywhere: the RLS of invoices, payments, expenses, vehicles and parties
-- decides what is counted, exactly as it decided what the browser loaded before.
-- No business rule changes.
-- =====================================================================================

create index if not exists audit_logs_entity_id_time_idx on public.audit_logs (entity_id, occurred_at desc);

-- ---------------------------------------------------------------------
-- 1. Party statement
-- ---------------------------------------------------------------------
-- p_kind: 'Supplier' or 'Customer'. p_company null = every office the caller can see.
-- Movements: invoice / debit note = charge (+), credit note = credit (−), payment = credit (−).
--   style 'ledger':    approved documents that are not cancelled, party_type = p_kind; payments
--                      of the party's invoices; opening = the party's opening_balance (plus, when
--                      p_from is given, the movements before p_from); order date, created_at.
--   style 'statement': approved documents of the matching invoice type (Sales for clients,
--                      Purchase for suppliers); payments of that invoice type; opening = the
--                      movements before p_from; order date, reference.
-- Result: { opening_balance, closing_balance, total_charge, total_credit, total_count, lines: [...] }
-- with lines p_offset .. p_offset + p_limit of the range p_from..p_to; totals cover the whole range.
create or replace function public.party_statement(p_party uuid, p_kind text, p_company uuid default null,
  p_from date default null, p_to date default null, p_style text default 'ledger',
  p_limit integer default 100, p_offset integer default 0)
returns jsonb
language plpgsql stable security invoker set search_path = public as $$
declare
  v_ledger boolean := coalesce(p_style, 'ledger') <> 'statement';
  v_type text := case when p_kind = 'Customer' then 'Sales' else 'Purchase' end;
  v_party_open numeric := 0;
  v_out jsonb;
begin
  if p_kind is null or p_kind not in ('Supplier', 'Customer') then raise exception 'Party type must be Supplier or Customer'; end if;
  if p_limit is null or p_limit < 1 or p_limit > 1000 then raise exception 'Page size must be between 1 and 1000'; end if;
  if v_ledger then
    if p_kind = 'Supplier' then select coalesce(s.opening_balance, 0) into v_party_open from public.suppliers s where s.id = p_party;
    else select coalesce(c.opening_balance, 0) into v_party_open from public.customers c where c.id = p_party; end if;
    v_party_open := coalesce(v_party_open, 0);
  end if;

  with docs as (
    select 'inv-' || i.id as line_id, i.id as source_id,
           case when i.is_credit_note then 'Credit Note' when i.is_debit_note then 'Debit Note' else 'Invoice' end as kind,
           i.invoice_date as date, i.created_at, i.invoice_number as reference, null::text as invoice_number,
           i.invoice_type::text as invoice_type, nullif(i.notes, '') as notes,
           (select count(*) from public.invoice_lines l where l.invoice_id = i.id)::int as line_count, null::text as payment_method,
           case when i.is_credit_note then 0 else abs(i.grand_total) end as charge,
           case when i.is_credit_note then abs(i.grand_total) else 0 end as credit
      from public.invoices i
     where (i.supplier_id = p_party or i.customer_id = p_party)
       and i.approval_status = 'Approved'
       and (p_company is null or i.company_id = p_company)
       and case when v_ledger then i.party_type::text = p_kind and i.payment_status <> 'Cancelled' else i.invoice_type::text = v_type end
  ), pays as (
    select 'pay-' || p.id, p.id, 'Payment', p.payment_date, p.created_at, p.payment_number, i.invoice_number,
           i.invoice_type::text, nullif(p.notes, ''), 0, p.payment_method, 0::numeric, p.amount
      from public.payments p
      join public.invoices i on i.id = p.invoice_id
     where (i.supplier_id = p_party or i.customer_id = p_party)
       and (p_company is null or p.company_id = p_company)
       and case when v_ledger then i.party_type::text = p_kind else i.invoice_type::text = v_type end
  ), moves as (
    select * from docs union all select * from pays
  ), opening as (
    select v_party_open + coalesce(sum(m.charge - m.credit) filter (where p_from is not null and m.date < p_from), 0) as v from moves m
  ), ranged as (
    select m.*,
           row_number() over w as rn,
           (select v from opening) + sum(m.charge - m.credit) over (w rows between unbounded preceding and current row) as running
      from moves m
     where (p_from is null or m.date >= p_from) and (p_to is null or m.date <= p_to)
    window w as (order by m.date,
                 case when v_ledger then m.created_at end,
                 case when v_ledger then null else m.reference end,
                 m.created_at, m.line_id)
  )
  select jsonb_build_object(
    'opening_balance', round((select v from opening), 3),
    'closing_balance', round(coalesce((select r.running from ranged r order by r.rn desc limit 1), (select v from opening)), 3),
    'total_charge', round(coalesce((select sum(charge) from ranged), 0), 3),
    'total_credit', round(coalesce((select sum(credit) from ranged), 0), 3),
    'total_count', (select count(*) from ranged),
    'lines', coalesce((select jsonb_agg(jsonb_build_object(
        'line_id', r.line_id, 'source_id', r.source_id, 'kind', r.kind, 'date', r.date, 'reference', r.reference,
        'invoice_number', r.invoice_number, 'invoice_type', r.invoice_type, 'notes', r.notes, 'line_count', r.line_count,
        'payment_method', r.payment_method, 'charge', r.charge, 'credit', r.credit, 'running_balance', round(r.running, 3)) order by r.rn)
      from ranged r where r.rn > greatest(coalesce(p_offset, 0), 0) and r.rn <= greatest(coalesce(p_offset, 0), 0) + p_limit), '[]'::jsonb))
    into v_out;
  return v_out;
end $$;
revoke all on function public.party_statement(uuid, text, uuid, date, date, text, integer, integer) from public, anon;
grant execute on function public.party_statement(uuid, text, uuid, date, date, text, integer, integer) to authenticated;

-- ---------------------------------------------------------------------
-- 2. Vehicle financial totals (getVehicleFinancialSummary inputs)
-- ---------------------------------------------------------------------
-- One row per vehicle the caller can see (p_company = the vehicle's office, p_vehicle = one
-- vehicle), ordered by vehicle id, paged (≤ 1000). Expenses and invoices are matched by vehicle
-- only, whatever office they were booked in (as before). Approved expenses (status null counts as
-- approved, as isApprovedExpense does):
--   insurance = category Insurance, registration = category Registration,
--   other = every category except Insurance, Registration, Maintenance, Oil, Tyres, Accident,
--   expense_total = every category (Cost per KM report).
-- revenue = approved sales invoices with this vehicle on the header, credit notes deducted.
create or replace function public.vehicle_financial_totals(p_company uuid default null, p_vehicle uuid default null,
  p_limit integer default 1000, p_offset integer default 0)
returns table (vehicle_id uuid, insurance numeric, registration numeric, other numeric, expense_total numeric, revenue numeric, total_count bigint)
language plpgsql stable security invoker set search_path = public as $$
#variable_conflict use_column
begin
  if p_limit is null or p_limit < 1 or p_limit > 1000 then raise exception 'Page size must be between 1 and 1000'; end if;
  return query
  with v as (
    select x.id from public.vehicles x
     where (p_company is null or x.company_id = p_company) and (p_vehicle is null or x.id = p_vehicle)
  ), e as (
    select x.vehicle_id,
           coalesce(sum(x.total) filter (where x.category = 'Insurance'), 0) ins,
           coalesce(sum(x.total) filter (where x.category = 'Registration'), 0) reg,
           coalesce(sum(x.total) filter (where x.category not in ('Insurance', 'Registration', 'Maintenance', 'Oil', 'Tyres', 'Accident')), 0) oth,
           coalesce(sum(x.total), 0) tot
      from public.expenses x
     where x.vehicle_id in (select id from v) and coalesce(x.status, 'Approved') = 'Approved'
     group by x.vehicle_id
  ), r as (
    select i.vehicle_id, sum(case when i.is_credit_note then -abs(i.grand_total) else i.grand_total end) rev
      from public.invoices i
     where i.vehicle_id in (select id from v) and i.invoice_type = 'Sales' and i.approval_status = 'Approved'
     group by i.vehicle_id
  )
  select v.id, coalesce(e.ins, 0), coalesce(e.reg, 0), coalesce(e.oth, 0), coalesce(e.tot, 0), coalesce(r.rev, 0), count(*) over ()
    from v left join e on e.vehicle_id = v.id left join r on r.vehicle_id = v.id
   order by v.id
   limit p_limit offset greatest(coalesce(p_offset, 0), 0);
end $$;
revoke all on function public.vehicle_financial_totals(uuid, uuid, integer, integer) from public, anon;
grant execute on function public.vehicle_financial_totals(uuid, uuid, integer, integer) to authenticated;

-- ---------------------------------------------------------------------
-- 3. VAT by month
-- ---------------------------------------------------------------------
-- Invoices dated p_from..p_to (inclusive, optional) that are not cancelled and not draft,
-- rejected or cancelled in approval. Credit notes reduce the tax of their side.
-- output_tax = sales, input_tax = purchases. One row per month (YYYY-MM).
create or replace function public.invoice_tax_by_month(p_company uuid default null, p_from date default null, p_to date default null)
returns table (month text, output_tax numeric, input_tax numeric)
language sql stable security invoker set search_path = public as $$
  select to_char(i.invoice_date, 'YYYY-MM'),
         coalesce(sum(case when i.is_credit_note then -abs(i.tax_total) else i.tax_total end) filter (where i.invoice_type = 'Sales'), 0),
         coalesce(sum(case when i.is_credit_note then -abs(i.tax_total) else i.tax_total end) filter (where i.invoice_type <> 'Sales'), 0)
    from public.invoices i
   where i.invoice_date is not null
     and (p_company is null or i.company_id = p_company)
     and (p_from is null or i.invoice_date >= p_from)
     and (p_to is null or i.invoice_date <= p_to)
     and i.payment_status <> 'Cancelled'
     and i.approval_status not in ('Draft', 'Rejected', 'Cancelled')
   group by 1
$$;
revoke all on function public.invoice_tax_by_month(uuid, date, date) from public, anon;
grant execute on function public.invoice_tax_by_month(uuid, date, date) to authenticated;

-- =====================================================================================
-- Advance brief, Phase 1 (expenses & payments group): aggregates and pickers that the
-- Expenses, Payments and Reconciliation pages need so they no longer load whole tables.
--   1. expense_page_figures(): the Expenses page figures that expense_summary() does not
--      cover (amounts awaiting approval / approved-not-paid, voucher count of the filtered
--      list, every category in use).
--   2. payment_totals(): Payments page totals per currency (supplier disbursals, customer
--      receipts) for the page filters, and the payment methods in use.
--   3. reconcilable_invoice_page(): purchase invoices that can still be reconciled, paged and
--      searchable, for the reconciliation picker.
-- All are security invoker: the RLS of expenses, payments, invoices and reconciliations
-- applies unchanged, so every figure covers only the offices the caller may read.
-- No business rule changes: each definition is the one the page computed in the browser.
-- =====================================================================================

create index if not exists reconciliations_invoice_idx on public.reconciliations (invoice_id);

-- ---------------------------------------------------------------------
-- 1. Expense page figures
-- ---------------------------------------------------------------------
-- p_filter uses the keys of expense_matches(). office_* figures use only the office filter
-- (company), like the KPI cards; filtered_count uses every filter (the "Spend by category"
-- voucher count); categories lists every category of every expense the caller can see.
create or replace function public.expense_page_figures(p_filter jsonb default '{}')
returns jsonb
language sql stable security invoker set search_path = public as $$
  with office as (
    select x.status, x.payment_status, x.total from public.expenses x
     where (p_filter->>'company' is null or x.company_id = (p_filter->>'company')::uuid)
  )
  select jsonb_build_object(
    'pending_total', (select coalesce(sum(total), 0) from office where status = 'Pending Approval'),
    'unpaid_total', (select coalesce(sum(total), 0) from office where status = 'Approved' and payment_status = 'Unpaid'),
    'filtered_count', (select count(*) from public.v_expense_list x where public.expense_matches(x, coalesce(p_filter, '{}'::jsonb))),
    'categories', coalesce((select jsonb_agg(c order by c) from (select distinct category c from public.expenses) d), '[]'::jsonb)
  )
$$;
revoke all on function public.expense_page_figures(jsonb) from public, anon;
grant execute on function public.expense_page_figures(jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 2. Payment totals
-- ---------------------------------------------------------------------
-- Filter keys (all optional): company, method, bank, party_type ('Supplier' / 'Customer'),
-- from, to (payment date, inclusive). Amounts are never added across currencies: each total
-- is a list of {currency, total}. methods: every payment method in use (no filter).
create or replace function public.payment_totals(p_filter jsonb default '{}')
returns jsonb
language sql stable security invoker set search_path = public as $$
  with f as (
    select p.currency, p.amount, p.party_type::text as party_type
      from public.v_payment_list p
     where (p_filter->>'company' is null or p.company_id = (p_filter->>'company')::uuid)
       and (p_filter->>'method' is null or p.payment_method = p_filter->>'method')
       and (p_filter->>'bank' is null or p.bank_account_id = (p_filter->>'bank')::uuid)
       and (p_filter->>'party_type' is null or p.party_type::text = p_filter->>'party_type')
       and (p_filter->>'from' is null or p.payment_date >= (p_filter->>'from')::date)
       and (p_filter->>'to' is null or p.payment_date <= (p_filter->>'to')::date)
  )
  select jsonb_build_object(
    'disbursed', coalesce((select jsonb_agg(jsonb_build_object('currency', currency, 'total', t) order by currency nulls first)
                             from (select currency, sum(amount) t from f where party_type = 'Supplier' group by currency) s), '[]'::jsonb),
    'received', coalesce((select jsonb_agg(jsonb_build_object('currency', currency, 'total', t) order by currency nulls first)
                            from (select currency, sum(amount) t from f where party_type = 'Customer' group by currency) s), '[]'::jsonb),
    'methods', coalesce((select jsonb_agg(m order by m) from (select distinct payment_method m from public.payments) d), '[]'::jsonb)
  )
$$;
revoke all on function public.payment_totals(jsonb) from public, anon;
grant execute on function public.payment_totals(jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 3. Reconcilable purchase invoices (picker)
-- ---------------------------------------------------------------------
-- Same rule as the Reconciliation page: purchase invoices that are not credit notes, not
-- cancelled (payment or approval) and have no reconciliation yet. Searchable by the words
-- of v_invoice_list.search_text; newest first.
create or replace function public.reconcilable_invoice_page(p_company uuid default null, p_search text default null,
                                                            p_limit integer default 50, p_offset integer default 0)
returns table (data jsonb, total_count bigint)
language plpgsql stable security invoker set search_path = public as $$
declare
  v_words text[] := array(select w from unnest(regexp_split_to_array(lower(coalesce(p_search, '')), '\s+')) w where w <> '' limit 6);
begin
  if p_limit is null or p_limit < 1 or p_limit > 1000 then raise exception 'Page size must be between 1 and 1000'; end if;
  return query
    select to_jsonb(v), count(*) over ()
      from public.v_invoice_list v
     where v.invoice_type = 'Purchase' and not v.is_credit_note
       and v.payment_status <> 'Cancelled' and v.approval_status <> 'Cancelled'
       and (p_company is null or v.company_id = p_company)
       and not exists (select 1 from public.reconciliations r where r.invoice_id = v.id)
       and (cardinality(v_words) = 0 or (select bool_and(v.search_text like '%' || w || '%') from unnest(v_words) w))
     order by v.invoice_date desc, v.invoice_number desc, v.id
     limit p_limit offset greatest(coalesce(p_offset, 0), 0);
end $$;
revoke all on function public.reconcilable_invoice_page(uuid, text, integer, integer) from public, anon;
grant execute on function public.reconcilable_invoice_page(uuid, text, integer, integer) to authenticated;

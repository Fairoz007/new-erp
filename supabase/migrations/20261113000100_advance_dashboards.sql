-- =====================================================================================
-- Advance brief, Phase 1: dashboards and badges aggregate in the database.
-- Only what invoice_summary / dashboard_series / ledger_movements / expense_totals do not
-- already cover:
--   1. dashboard_open_invoices(): the few invoice rows the dashboards list (Finance dashboard:
--      oldest overdue receivables; Finance overview: outstanding invoices, overdue first).
--   2. unread_notification_count(): the unread badge in the header and sidebar.
-- Both are security invoker: invoices / notifications RLS decides what the caller sees.
-- No business rule changes.
-- =====================================================================================

-- Modes (definitions are those of the pages they replace):
--   'overdue_receivables': approved sales invoices (not credit notes) with an open balance whose
--       due date is before p_today, oldest due date first (Finance dashboard).
--   'outstanding': invoices with an open balance (credit notes have none) that are not
--       cancelled, overdue first, then by due date (Finance overview).
-- p_companies null = every office the caller can see. Rows are v_invoice_list rows plus
-- effective_status (invoice_status_at at p_today).
create or replace function public.dashboard_open_invoices(p_mode text, p_companies uuid[] default null,
  p_today date default current_date, p_limit integer default 8)
returns setof jsonb
language plpgsql stable security invoker set search_path = public as $$
begin
  if p_limit is null or p_limit < 1 or p_limit > 1000 then raise exception 'Page size must be between 1 and 1000'; end if;
  if p_mode = 'overdue_receivables' then
    return query
      select to_jsonb(v) || jsonb_build_object('effective_status',
               public.invoice_status_at(v.payment_status, v.approval_status, v.is_credit_note, v.outstanding_amount, v.amount_paid, v.due_date, p_today))
        from public.v_invoice_list v
       where (p_companies is null or v.company_id = any(p_companies))
         and v.invoice_type::text = 'Sales' and v.approval_status = 'Approved' and not v.is_credit_note
         and v.outstanding_amount > 0 and v.due_date < p_today
       order by v.due_date, v.invoice_date desc, v.invoice_number desc, v.id
       limit p_limit;
  elsif p_mode = 'outstanding' then
    return query
      select to_jsonb(x.v) || jsonb_build_object('effective_status', x.eff)
        from (select v, public.invoice_status_at(v.payment_status, v.approval_status, v.is_credit_note, v.outstanding_amount, v.amount_paid, v.due_date, p_today) as eff
                from public.v_invoice_list v
               where (p_companies is null or v.company_id = any(p_companies))
                 and not v.is_credit_note and v.outstanding_amount > 0) x
       where x.eff <> 'Cancelled'
       order by (x.eff = 'Overdue') desc, (x.v).due_date, (x.v).invoice_date desc, (x.v).invoice_number desc, (x.v).id
       limit p_limit;
  else
    raise exception 'Unknown mode %', p_mode;
  end if;
end $$;
revoke all on function public.dashboard_open_invoices(text, uuid[], date, integer) from public, anon;
grant execute on function public.dashboard_open_invoices(text, uuid[], date, integer) to authenticated;

-- Alerts the caller can see (notifications RLS) that the caller has not read
-- (notification_reads RLS pins the rows to the caller). No row cap.
create or replace function public.unread_notification_count() returns bigint
language sql stable security invoker set search_path = public as $$
  select count(*) from public.notifications n
   where not exists (select 1 from public.notification_reads r where r.notification_id = n.id and r.user_id = auth.uid())
$$;
revoke all on function public.unread_notification_count() from public, anon;
grant execute on function public.unread_notification_count() to authenticated;

-- =====================================================================================
-- Advance brief, Phase 1 (ledger & system pages): server-side lists and aggregates for the
-- general ledger, journal list, notifications, audit log and office record counts.
--   1. v_journal_list gains is_reversed / reversed_by_id / reversed_by_number (the journal list
--      decided "Reversed" from every loaded entry; now the view answers it per row).
--   2. general_ledger_summary(): per account, posted debit/credit before the period, in the
--      period and the number of lines in the period. Same scope as general_ledger_page
--      (accounting:view). The browser turns it into opening / closing balances with the same
--      TypeScript functions as the trial balance (accountBalancesFrom).
--   3. v_notification_list + notification_counts(): the caller's notifications with read state,
--      paged in the database; counts for the filter tabs and the unread badge.
--   4. v_audit_log_list: audit rows with the action, entity and name the page shows (same rules as
--      rowToAuditLog in src/services/system.ts) and a search column.
--   5. office_record_counts(): vehicles, employees and invoices per office.
-- Lists and counts are security invoker: the base tables' RLS applies unchanged.
-- No business rule changes.
-- =====================================================================================

-- ---------------------------------------------------------------------
-- 1. Journal list: reversal info
-- ---------------------------------------------------------------------
create index if not exists journal_entries_reverses_idx on public.journal_entries (reverses_entry_id) where reverses_entry_id is not null;

create or replace view public.v_journal_list with (security_invoker = true) as
select e.*,
       pr.name as posted_by_name,
       coalesce((select sum(l.debit) from public.journal_lines l where l.entry_id = e.id), 0) as total_debit,
       coalesce((select sum(l.credit) from public.journal_lines l where l.entry_id = e.id), 0) as total_credit,
       lower(concat_ws(' ', e.entry_number, e.reference, e.description, e.source_module)) as search_text,
       rv.id is not null as is_reversed,
       rv.id as reversed_by_id,
       rv.entry_number as reversed_by_number
  from public.journal_entries e
  left join public.profiles pr on pr.id = e.posted_by
  left join lateral (select r.id, r.entry_number from public.journal_entries r
                      where r.reverses_entry_id = e.id order by r.created_at limit 1) rv on true;
grant select on public.v_journal_list to authenticated;
revoke all on public.v_journal_list from anon;

-- ---------------------------------------------------------------------
-- 2. General ledger: per-account summary for the period
-- ---------------------------------------------------------------------
-- p_company null = summed by account code across the caller's ledger offices (as
-- general_ledger_page). before_* = posted movements dated before p_from (none when p_from is
-- null); debit / credit / line_count = posted lines dated p_from..p_to.
create or replace function public.general_ledger_summary(p_company uuid, p_from date, p_to date)
returns table (account_code text, before_debit numeric, before_credit numeric, debit numeric, credit numeric, line_count bigint)
language plpgsql stable security definer set search_path = public as $$
declare
  v_companies uuid[] := public.perm_company_ids('accounting', 'view');
begin
  if p_company is not null then
    if not p_company = any(v_companies) then raise exception 'Permission denied' using errcode = '42501'; end if;
    v_companies := array[p_company];
  end if;
  return query
  select l.account_code,
         coalesce(sum(l.debit)  filter (where p_from is not null and e.date < p_from), 0),
         coalesce(sum(l.credit) filter (where p_from is not null and e.date < p_from), 0),
         coalesce(sum(l.debit)  filter (where (p_from is null or e.date >= p_from) and (p_to is null or e.date <= p_to)), 0),
         coalesce(sum(l.credit) filter (where (p_from is null or e.date >= p_from) and (p_to is null or e.date <= p_to)), 0),
         count(*) filter (where (p_from is null or e.date >= p_from) and (p_to is null or e.date <= p_to))
    from public.journal_entries e
    join public.journal_lines l on l.entry_id = e.id
   where e.status = 'Posted' and l.company_id = any(v_companies)
     and ((p_from is not null and e.date < p_from) or p_to is null or e.date <= p_to)
   group by l.account_code;
end $$;
revoke all on function public.general_ledger_summary(uuid, date, date) from public, anon;
grant execute on function public.general_ledger_summary(uuid, date, date) to authenticated;

-- ---------------------------------------------------------------------
-- 3. Notifications: the caller's list with read state, and counts
-- ---------------------------------------------------------------------
-- notifications RLS: alerts of the caller's offices addressed to everyone or to the caller.
-- notification_reads RLS pins the read rows to the caller; auth.uid() is repeated for clarity.
create or replace view public.v_notification_list with (security_invoker = true) as
select n.*,
       exists (select 1 from public.notification_reads r
                where r.notification_id = n.id and r.user_id = (select auth.uid())) as is_read
  from public.notifications n;
grant select on public.v_notification_list to authenticated;
revoke all on public.v_notification_list from anon;

create or replace function public.notification_counts()
returns jsonb language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'total', count(*),
    'unread', count(*) filter (where not v.is_read),
    'critical', count(*) filter (where v.severity = 'critical'))
    from public.v_notification_list v
$$;
revoke all on function public.notification_counts() from public, anon;
grant execute on function public.notification_counts() to authenticated;

-- ---------------------------------------------------------------------
-- 4. Audit log list
-- ---------------------------------------------------------------------
-- display_action / entity_label / entity_name follow rowToAuditLog (src/services/system.ts):
--   * approval_requests UPDATE whose status changed to Approved / Rejected -> APPROVE / REJECT
--   * payments CREATE -> PAYMENT, reconciliations CREATE -> RECONCILE
--   * entity label from the table name (approval requests by reference type)
--   * entity name = first non-empty of the record's number / name keys, else the entity id
-- search_text holds the user, role, action, entity, name and the event details (for updates the
-- changed fields with their old and new values; the page shows the first four, shortened).
create or replace view public.v_audit_log_list with (security_invoker = true) as
with base as (
  select a.*,
         coalesce(a.new_value, a.old_value, '{}'::jsonb) as src,
         case
           when a.entity_type = 'approval_requests' and a.action = 'UPDATE' and a.old_value is not null and a.new_value is not null
                and (a.old_value->>'status') is distinct from (a.new_value->>'status')
             then case a.new_value->>'status' when 'Approved' then 'APPROVE' when 'Rejected' then 'REJECT' else a.action end
           when a.entity_type = 'payments' and a.action = 'CREATE' then 'PAYMENT'
           when a.entity_type = 'reconciliations' and a.action = 'CREATE' then 'RECONCILE'
           else a.action
         end as display_action
    from public.audit_logs a
), named as (
  select b.*,
         case
           when b.entity_type = 'approval_requests' then
             case b.src->>'reference_type' when 'Invoice' then 'Invoice' when 'Expense' then 'Expense' else 'WorkOrder' end
           else coalesce((case b.entity_type
             when 'vehicles' then 'Vehicle' when 'maintenance_records' then 'Maintenance' when 'work_orders' then 'WorkOrder'
             when 'invoices' then 'Invoice' when 'payments' then 'Payment' when 'expenses' then 'Expense'
             when 'accidents' then 'Accident' when 'tyres' then 'Tyre' when 'oil_changes' then 'OilChange'
             when 'journal_entries' then 'Accounting' when 'bank_accounts' then 'Accounting' when 'fixed_assets' then 'Accounting'
             when 'depreciation_runs' then 'Accounting' when 'payroll_runs' then 'Accounting' when 'employees' then 'Accounting'
             when 'documents' then 'Document' when 'companies' then 'Company' when 'profiles' then 'User'
             when 'suppliers' then 'Supplier' when 'customers' then 'Customer' when 'reconciliations' then 'Reconciliation'
             end), b.entity_type)
         end as entity_label,
         coalesce(nullif(b.src->>'plate_number', ''), nullif(b.src->>'invoice_number', ''), nullif(b.src->>'work_order_number', ''),
                  nullif(b.src->>'record_number', ''), nullif(b.src->>'expense_number', ''), nullif(b.src->>'accident_number', ''),
                  nullif(b.src->>'payment_number', ''), nullif(b.src->>'reconciliation_number', ''), nullif(b.src->>'entry_number', ''),
                  nullif(b.src->>'batch_number', ''), nullif(b.src->>'payroll_number', ''), nullif(b.src->>'asset_code', ''),
                  nullif(b.src->>'employee_code', ''), nullif(b.src->>'supplier_code', ''), nullif(b.src->>'customer_code', ''),
                  nullif(b.src->>'reference_number', ''), nullif(b.src->>'document_name', ''), nullif(b.src->>'name', ''),
                  nullif(b.src->>'vehicle_code', ''), nullif(b.src->>'code', ''), b.entity_id, '') as entity_name
    from base b
)
select n.id, n.occurred_at, n.user_id, n.user_role, n.user_role_name, n.user_name, n.company_id, n.action, n.entity_type,
       n.entity_id, n.old_value, n.new_value, n.display_action, n.entity_label, n.entity_name,
       lower(concat_ws(' ',
         coalesce(n.user_name, case when n.user_id is null then 'System' else 'Unknown user' end),
         n.user_role::text, n.display_action, n.entity_label, n.entity_name,
         case
           when n.display_action in ('CREATE', 'PAYMENT', 'RECONCILE') then 'recorded'
           when n.display_action = 'DELETE' then 'deleted'
           when n.display_action = 'APPROVE' then 'approved level ' || coalesce(n.new_value->>'current_level', '') || '/' || coalesce(n.new_value->>'total_levels', '')
           when n.display_action = 'REJECT' then 'rejected level ' || coalesce(n.new_value->>'current_level', '') || '/' || coalesce(n.new_value->>'total_levels', '')
           when n.old_value is not null and n.new_value is not null then
             coalesce((select string_agg(k.key || ': ' || coalesce(n.old_value->>k.key, '(empty)') || ' -> ' || coalesce(k.value #>> '{}', '(empty)'), '; ')
                         from jsonb_each(n.new_value) k
                        where k.key not in ('updated_at', 'created_at') and (n.old_value->k.key) is distinct from k.value),
                      'saved without field changes')
           else 'saved without field changes'
         end)) as search_text
  from named n;
grant select on public.v_audit_log_list to authenticated;
revoke all on public.v_audit_log_list from anon;

create index if not exists audit_logs_company_time_idx on public.audit_logs (company_id, occurred_at desc, id desc);

-- ---------------------------------------------------------------------
-- 5. Records per office (Offices page)
-- ---------------------------------------------------------------------
create or replace function public.office_record_counts()
returns table (company_id uuid, vehicles bigint, employees bigint, invoices bigint)
language sql stable security invoker set search_path = public as $$
  select c.id,
         (select count(*) from public.vehicles v where v.company_id = c.id),
         (select count(*) from public.employees e where e.company_id = c.id),
         (select count(*) from public.invoices i where i.company_id = c.id)
    from public.companies c
$$;
revoke all on function public.office_record_counts() from public, anon;
grant execute on function public.office_record_counts() to authenticated;

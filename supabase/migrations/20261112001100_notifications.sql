-- =====================================================================
-- Phase 10: notifications for new leave requests
--   Expiries, overdue invoices (refresh_expiry_notifications, daily), approvals (work orders,
--   invoices, expenses, journals), due/overdue recurring expenses and budget alerts already raise
--   notifications. A new leave request did not: it now notifies, by name, every active user who
--   may approve leave in the employee's office (not the requester).
-- =====================================================================

-- Active users holding module:action in an office (office role, else organization role for
-- members or all-office users; super admins always)
create or replace function public._users_with_perm_in(p_company uuid, p_module text, p_action public.permission_action)
returns setof uuid language sql stable security definer set search_path = public as $$
  select p.id
    from public.profiles p
    join public.roles pr on pr.id = p.role_id
    left join public.company_members m on m.user_id = p.id and m.company_id = p_company
   where p.status = 'active'
     and (pr.is_super
          or ((m.user_id is not null or p.all_offices)
              and exists (select 1 from public.role_grants g
                           where g.role_id = coalesce(m.role_id, p.role_id) and g.module = p_module and g.action = p_action)))
$$;
revoke all on function public._users_with_perm_in(uuid, text, public.permission_action) from public, anon, authenticated;

create or replace function public.trg_leave_request_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_name text; v_type text;
begin
  if new.status <> 'Pending' then return new; end if;
  select name into v_name from public.employees where id = new.employee_id;
  select name into v_type from public.leave_types where id = new.leave_type_id;
  insert into public.notifications (company_id, user_id, type, title, message, severity, link, reference_id, dedupe_key)
  select new.company_id, u, 'leave_request', 'Leave request: ' || coalesce(v_name, 'employee'),
         coalesce(v_name, 'An employee') || ' asked for ' || coalesce(v_type, 'leave') || ' from ' || to_char(new.start_date, 'YYYY-MM-DD')
           || ' to ' || to_char(new.end_date, 'YYYY-MM-DD') || ' (' || new.days || ' day(s)).',
         'info', 'leave', new.id, 'leave-req:' || new.id || ':' || u
    from public._users_with_perm_in(new.company_id, 'leave', 'approve') u
   where u is distinct from new.requested_by
  on conflict (company_id, dedupe_key) where dedupe_key is not null do nothing;
  return new;
end $$;
revoke all on function public.trg_leave_request_notify() from public, anon, authenticated;
drop trigger if exists leave_request_notify on public.leave_requests;
create trigger leave_request_notify after insert on public.leave_requests
  for each row execute function public.trg_leave_request_notify();

-- Overdue-invoice alerts: only approved documents are owed (drafts, pending and rejected
-- invoices were alerted too)
do $$
declare def text; nd text;
begin
  def := pg_get_functiondef('public.refresh_expiry_notifications(integer)'::regprocedure);
  nd := replace(def, 'where not i.is_credit_note and i.outstanding_amount > 0 and i.payment_status <> ''Cancelled''',
                     'where not i.is_credit_note and i.outstanding_amount > 0 and i.payment_status <> ''Cancelled'' and i.approval_status = ''Approved''');
  if nd = def then raise exception 'refresh_expiry_notifications: overdue invoice filter not found'; end if;
  execute nd;
end $$;

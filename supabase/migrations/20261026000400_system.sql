-- =====================================================================
-- Agent D (System): server-side notifications, actor-name denormalisation,
-- bulk mark-as-read.  Additive only.
--
--   * Clients cannot insert notifications (RLS: SELECT only).  Everything
--     below is SECURITY DEFINER with a pinned search_path.
--   * notifications.dedupe_key  : idempotency key for generated alerts
--   * actor-name columns        : audit_logs.user_name, approval_requests.requested_by_name,
--                                 approval_actions.approver_name  (profiles are not readable
--                                 by every role, so the name is copied at write time)
--   * triggers  : approval request created / level advanced -> eligible approvers;
--                 approval decided -> requester
--   * refresh_expiry_notifications() : registration / insurance / document expiry + overdue
--                 invoices.  Idempotent.  Scheduled with pg_cron (see bottom) or run by an
--                 admin through run_expiry_notifications().
--   * mark_all_notifications_read() : idempotent per-user read state for every visible alert
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------
alter table public.notifications        add column if not exists dedupe_key text;
create unique index if not exists notifications_dedupe_uq
  on public.notifications (company_id, dedupe_key) where dedupe_key is not null;
create index if not exists notifications_type_idx on public.notifications (company_id, type);

alter table public.audit_logs           add column if not exists user_name text;
alter table public.approval_requests    add column if not exists requested_by_name text;
alter table public.approval_actions     add column if not exists approver_name text;

-- ---------------------------------------------------------------------
-- 2. Actor-name triggers (BEFORE INSERT, copy profiles.name once)
-- ---------------------------------------------------------------------
create or replace function public.trg_set_actor_name() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'audit_logs' then
    if new.user_name is null and new.user_id is not null then
      select name into new.user_name from public.profiles where id = new.user_id;
    end if;
  elsif tg_table_name = 'approval_requests' then
    if new.requested_by_name is null and new.requested_by is not null then
      select name into new.requested_by_name from public.profiles where id = new.requested_by;
    end if;
  elsif tg_table_name = 'approval_actions' then
    if new.approver_name is null and new.approver_id is not null then
      select name into new.approver_name from public.profiles where id = new.approver_id;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists audit_logs_actor_name on public.audit_logs;
create trigger audit_logs_actor_name before insert on public.audit_logs
  for each row execute function public.trg_set_actor_name();
drop trigger if exists approval_requests_actor_name on public.approval_requests;
create trigger approval_requests_actor_name before insert on public.approval_requests
  for each row execute function public.trg_set_actor_name();
drop trigger if exists approval_actions_actor_name on public.approval_actions;
create trigger approval_actions_actor_name before insert on public.approval_actions
  for each row execute function public.trg_set_actor_name();

-- ---------------------------------------------------------------------
-- 3. Approval notifications
-- ---------------------------------------------------------------------
-- Active users who may decide this request (mirrors decide_approval()):
--   company access + approval_limits for the module (null max = unlimited)
--   + role is in required_roles when the request names roles; Super Admin always qualifies.
create or replace function public.approvers_for_request(r public.approval_requests)
returns setof uuid language sql stable security definer set search_path = public as $$
  select p.id
  from public.profiles p
  where p.status = 'active'
    and (p.role = 'Super Admin'
         or (exists (select 1 from public.company_members m where m.user_id = p.id and m.company_id = r.company_id)
             and exists (select 1 from public.approval_limits l
                         where l.role = p.role
                           and l.module = case r.reference_type when 'WorkOrder' then 'maintenance'
                                                                 when 'Invoice' then 'invoice' else 'expense' end
                           and (l.max_amount is null or r.amount <= l.max_amount))
             and (cardinality(r.required_roles) = 0 or p.role = any (r.required_roles))))
$$;
revoke all on function public.approvers_for_request(public.approval_requests) from public, anon, authenticated;

create or replace function public.trg_notify_approval() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_vehicle uuid;
  v_uid     uuid;
  v_label   text;
begin
  v_label := case new.reference_type when 'WorkOrder' then 'Work order' when 'Invoice' then 'Invoice' else 'Expense' end;

  if new.reference_type = 'WorkOrder' then
    select vehicle_id into v_vehicle from public.work_orders where id = new.reference_id;
  end if;

  -- (a) a request needs a decision: new request, or it moved to the next level
  if new.status = 'Pending'
     and (tg_op = 'INSERT' or (tg_op = 'UPDATE' and new.current_level <> old.current_level)) then
    for v_uid in select * from public.approvers_for_request(new) loop
      continue when v_uid is not distinct from new.requested_by and tg_op = 'INSERT';  -- do not ping the requester about their own request
      insert into public.notifications
        (company_id, user_id, type, title, message, severity, link, vehicle_id, reference_id, dedupe_key)
      values
        (new.company_id, v_uid, 'approval_required',
         v_label || ' approval required: ' || new.reference_number,
         v_label || ' ' || new.reference_number || ' (' || to_char(new.amount, 'FM999G999G990D000') || ' ' || new.currency
           || ') is waiting for approval level ' || new.current_level || ' of ' || new.total_levels || '.',
         'warning', 'approvals', v_vehicle, new.reference_id,
         'approval:' || new.id || ':L' || new.current_level || ':' || v_uid)
      on conflict (company_id, dedupe_key) where dedupe_key is not null do nothing;
    end loop;
  end if;

  -- (b) final decision -> tell the requester
  if tg_op = 'UPDATE' and old.status = 'Pending' and new.status in ('Approved', 'Rejected')
     and new.requested_by is not null then
    insert into public.notifications
      (company_id, user_id, type, title, message, severity, link, vehicle_id, reference_id, dedupe_key)
    values
      (new.company_id, new.requested_by, 'approval_required',
       v_label || ' ' || lower(new.status) || ': ' || new.reference_number,
       'Your approval request for ' || new.reference_number || ' was ' || lower(new.status) || '.',
       case new.status when 'Approved' then 'success' else 'warning' end,
       'approvals', v_vehicle, new.reference_id,
       'approval-decided:' || new.id || ':' || new.status)
    on conflict (company_id, dedupe_key) where dedupe_key is not null do nothing;
  end if;

  return null;
end $$;

drop trigger if exists approval_requests_notify on public.approval_requests;
create trigger approval_requests_notify after insert or update of status, current_level on public.approval_requests
  for each row execute function public.trg_notify_approval();

-- ---------------------------------------------------------------------
-- 4. Expiry / overdue alerts (idempotent; run by pg_cron or by an admin)
-- ---------------------------------------------------------------------
-- Window: expired or expiring within p_days.  One row per (company, dedupe_key); the key embeds
-- the expiry date and the bucket (soon/expired) so a renewal or an escalation produces a new alert
-- but a repeated run never duplicates one.  Returns the number of notifications created.
create or replace function public.refresh_expiry_notifications(p_days integer default 30)
returns integer language plpgsql security definer set search_path = public as $$
declare v_n integer := 0; v_c integer;
begin
  -- vehicle registration
  insert into public.notifications (company_id, user_id, type, title, message, severity, link, vehicle_id, reference_id, dedupe_key)
  select v.company_id, null, 'registration_expiring',
         case when v.registration_expiry_date < current_date then 'Registration expired: ' else 'Registration expiring: ' end || v.plate_number,
         'Registration of ' || v.plate_number || ' '
           || case when v.registration_expiry_date < current_date
                   then 'expired on ' || to_char(v.registration_expiry_date, 'YYYY-MM-DD')
                   else 'expires on ' || to_char(v.registration_expiry_date, 'YYYY-MM-DD') end || '.',
         case when v.registration_expiry_date < current_date then 'critical' else 'warning' end,
         'vehicles', v.id, v.id,
         'reg:' || v.id || ':' || v.registration_expiry_date || ':'
           || case when v.registration_expiry_date < current_date then 'expired' else 'soon' end
  from public.vehicles v
  where v.registration_expiry_date is not null and v.status not in ('Sold', 'Scrapped')
    and v.registration_expiry_date <= current_date + p_days
  on conflict (company_id, dedupe_key) where dedupe_key is not null do nothing;
  get diagnostics v_c = row_count; v_n := v_n + v_c;

  -- vehicle insurance
  insert into public.notifications (company_id, user_id, type, title, message, severity, link, vehicle_id, reference_id, dedupe_key)
  select v.company_id, null, 'insurance_expiring',
         case when v.insurance_expiry_date < current_date then 'Insurance expired: ' else 'Insurance expiring: ' end || v.plate_number,
         'Insurance of ' || v.plate_number || ' '
           || case when v.insurance_expiry_date < current_date
                   then 'expired on ' || to_char(v.insurance_expiry_date, 'YYYY-MM-DD')
                   else 'expires on ' || to_char(v.insurance_expiry_date, 'YYYY-MM-DD') end || '.',
         case when v.insurance_expiry_date < current_date then 'critical' else 'warning' end,
         'vehicles', v.id, v.id,
         'ins:' || v.id || ':' || v.insurance_expiry_date || ':'
           || case when v.insurance_expiry_date < current_date then 'expired' else 'soon' end
  from public.vehicles v
  where v.insurance_expiry_date is not null and v.status not in ('Sold', 'Scrapped')
    and v.insurance_expiry_date <= current_date + p_days
  on conflict (company_id, dedupe_key) where dedupe_key is not null do nothing;
  get diagnostics v_c = row_count; v_n := v_n + v_c;

  -- documents
  insert into public.notifications (company_id, user_id, type, title, message, severity, link, vehicle_id, reference_id, dedupe_key)
  select d.company_id, null, 'document_expiry',
         case when d.expiry_date < current_date then 'Document expired: ' else 'Document expiring: ' end || d.document_name,
         d.category || ' document "' || d.document_name || '" '
           || case when d.expiry_date < current_date
                   then 'expired on ' || to_char(d.expiry_date, 'YYYY-MM-DD')
                   else 'expires on ' || to_char(d.expiry_date, 'YYYY-MM-DD') end || '.',
         case when d.expiry_date < current_date then 'critical' else 'warning' end,
         'documents', d.vehicle_id, d.id,
         'doc:' || d.id || ':' || d.expiry_date || ':'
           || case when d.expiry_date < current_date then 'expired' else 'soon' end
  from public.documents d
  where d.expiry_date is not null and d.expiry_date <= current_date + p_days
  on conflict (company_id, dedupe_key) where dedupe_key is not null do nothing;
  get diagnostics v_c = row_count; v_n := v_n + v_c;

  -- overdue invoices (one alert per invoice)
  insert into public.notifications (company_id, user_id, type, title, message, severity, link, vehicle_id, reference_id, dedupe_key)
  select i.company_id, null, 'invoice_overdue',
         'Invoice overdue: ' || i.invoice_number,
         i.invoice_type || ' invoice ' || i.invoice_number || ' is overdue since ' || to_char(i.due_date, 'YYYY-MM-DD')
           || ' (outstanding ' || to_char(i.outstanding_amount, 'FM999G999G990D000') || ').',
         'critical', 'invoices', null, i.id,
         'inv-overdue:' || i.id
  from public.invoices i
  where not i.is_credit_note and i.outstanding_amount > 0 and i.payment_status <> 'Cancelled'
    and i.due_date < current_date
  on conflict (company_id, dedupe_key) where dedupe_key is not null do nothing;
  get diagnostics v_c = row_count; v_n := v_n + v_c;

  return v_n;
end $$;
revoke all on function public.refresh_expiry_notifications(integer) from public, anon, authenticated;

-- Admin fallback when pg_cron is not enabled: Super Admin / settings editors can trigger a run.
create or replace function public.run_expiry_notifications()
returns integer language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_super_admin() or public.has_perm('settings', 'edit')) then
    raise exception 'Permission denied';
  end if;
  return public.refresh_expiry_notifications(30);
end $$;
revoke all on function public.run_expiry_notifications() from public, anon;
grant execute on function public.run_expiry_notifications() to authenticated;

-- ---------------------------------------------------------------------
-- 5. Per-user read state
-- ---------------------------------------------------------------------
-- SECURITY INVOKER on purpose: notifications RLS decides which alerts the caller can see,
-- notification_reads RLS (user_id = auth.uid()) pins the rows to the caller.
create or replace function public.mark_all_notifications_read() returns integer
language plpgsql security invoker set search_path = public as $$
declare v_n integer;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  insert into public.notification_reads (notification_id, user_id)
  select n.id, auth.uid() from public.notifications n
  on conflict (notification_id, user_id) do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke all on function public.mark_all_notifications_read() from public, anon;
grant execute on function public.mark_all_notifications_read() to authenticated;

-- ---------------------------------------------------------------------
-- 6. Scheduling (pg_cron)
-- ---------------------------------------------------------------------
-- NOT enabled by this migration.  Enable the extension once in the Supabase dashboard
-- (Database > Extensions > pg_cron) - or `create extension pg_cron` as the project owner - and the block
-- below (re-run it, or run its body by hand) registers a daily job at 03:00 UTC.
-- If the extension is absent the block is a no-op and admins can use run_expiry_notifications().
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('refresh-expiry-notifications', '0 3 * * *',
                          'select public.refresh_expiry_notifications(30)');
  end if;
end $$;

-- =====================================================================
-- Row Level Security, privileged RPC hardening, permission seed, storage
-- Model: a row is visible when the user belongs to its company AND their
-- role has the module permission. Ledger, payments and approvals can only
-- be written through the SECURITY DEFINER RPCs, which re-check both.
-- =====================================================================

-- RPCs that write the ledger run as definer (direct table writes are not granted below);
-- each one performs explicit company + permission checks first.
alter function public.post_journal_entry(uuid, date, text, jsonb, text, text, uuid) security definer;
alter function public.record_payment(uuid, numeric, date, text, uuid, text, text, text) security definer;
alter function public.post_invoice(uuid) security definer;
alter function public.decide_approval(uuid, text, text) security definer;
alter function public.complete_work_order(uuid, numeric) security definer;

-- complete_work_order must also check the company (definer bypasses RLS)
create or replace function public.complete_work_order(p_work_order uuid, p_final_cost numeric)
returns uuid language plpgsql security definer set search_path = public as $$
declare wo public.work_orders; v_mileage int; v_id uuid;
begin
  select * into wo from public.work_orders where id = p_work_order for update;
  if not found then raise exception 'Work order not found'; end if;
  if not public.has_company_access(wo.company_id) or not public.has_perm('work-orders', 'edit') then
    raise exception 'Permission denied';
  end if;
  if wo.status = 'Completed' then raise exception 'Work order already completed'; end if;
  if p_final_cost is null or p_final_cost < 0 then raise exception 'Invalid final cost'; end if;
  select current_mileage into v_mileage from public.vehicles where id = wo.vehicle_id;

  update public.work_orders set status = 'Completed', final_cost = p_final_cost,
         actual_completion = current_date, updated_at = now() where id = p_work_order;

  insert into public.maintenance_records (company_id, record_number, vehicle_id, work_order_id, maintenance_date,
      maintenance_type, category, description, odometer_reading, service_centre, supplier_id, technician,
      parts_cost, labour_cost, tax, total_cost, next_service_mileage)
  values (wo.company_id, public.next_doc_number(wo.company_id, 'MNT-' || extract(year from current_date)::int, 3),
      wo.vehicle_id, wo.id, current_date, 'Corrective Maintenance', 'General Service',
      'Completed Work Order ' || wo.work_order_number || ': ' || wo.problem_description,
      v_mileage, wo.workshop, wo.supplier_id, wo.assigned_technician,
      wo.parts_charges, wo.labour_charges, wo.tax, p_final_cost, coalesce(v_mileage, 0) + 10000)
  returning id into v_id;
  return v_id;
end $$;

-- Lock down: nothing is reachable by anon; helpers are not directly callable for writes.
revoke all on all tables in schema public from anon;
revoke execute on all functions in schema public from anon, public;
grant execute on function
  public.app_role(), public.is_super_admin(), public.has_company_access(uuid),
  public.has_perm(text, public.permission_action), public.can_approve(text, numeric),
  public.post_journal_entry(uuid, date, text, jsonb, text, text, uuid),
  public.record_payment(uuid, numeric, date, text, uuid, text, text, text),
  public.post_invoice(uuid), public.decide_approval(uuid, text, text),
  public.complete_work_order(uuid, numeric), public.next_doc_number(uuid, text, int)
to authenticated;

-- ---------------------------------------------------------------------
-- 1. Enable RLS on every table
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 2. Generic company-scoped CRUD policies: (table, module)
-- ---------------------------------------------------------------------
do $$
declare r record;
begin
  for r in select * from (values
      ('vehicles','vehicles'), ('tyres','tyres'), ('tyre_events','tyres'), ('oil_changes','oil'),
      ('work_orders','work-orders'), ('maintenance_records','maintenance'), ('accidents','accidents'),
      ('expenses','expenses'), ('documents','documents'), ('vehicle_timeline','vehicles'),
      ('invoices','invoices'), ('reconciliations','reconciliation'), ('bank_accounts','payments'),
      ('accounts','accounting'), ('fixed_assets','fixed-assets'), ('depreciation_runs','fixed-assets'),
      ('employees','payroll'), ('payroll_runs','payroll')
    ) as m(tbl, module)
  loop
    execute format($f$create policy %1$I on public.%2$I for select to authenticated
      using (public.has_company_access(company_id) and public.has_perm(%3$L, 'view'))$f$, r.tbl || '_select', r.tbl, r.module);
    execute format($f$create policy %1$I on public.%2$I for insert to authenticated
      with check (public.has_company_access(company_id) and public.has_perm(%3$L, 'create'))$f$, r.tbl || '_insert', r.tbl, r.module);
    execute format($f$create policy %1$I on public.%2$I for update to authenticated
      using (public.has_company_access(company_id) and public.has_perm(%3$L, 'edit'))
      with check (public.has_company_access(company_id) and public.has_perm(%3$L, 'edit'))$f$, r.tbl || '_update', r.tbl, r.module);
    execute format($f$create policy %1$I on public.%2$I for delete to authenticated
      using (public.has_company_access(company_id) and public.has_perm(%3$L, 'delete'))$f$, r.tbl || '_delete', r.tbl, r.module);
    execute format('grant select, insert, update, delete on public.%I to authenticated', r.tbl);
  end loop;
end $$;

-- Posted ledger, payments and approval history are read-only for clients (writes via RPC only).
do $$
declare r record;
begin
  for r in select * from (values
      ('journal_entries','accounting'), ('payments','payments'), ('approval_requests','approvals')
    ) as m(tbl, module)
  loop
    execute format($f$create policy %1$I on public.%2$I for select to authenticated
      using (public.has_company_access(company_id) and public.has_perm(%3$L, 'view'))$f$, r.tbl || '_select', r.tbl, r.module);
    execute format('grant select on public.%I to authenticated', r.tbl);
  end loop;
end $$;
-- Work orders raise approval requests directly
create policy approval_requests_insert on public.approval_requests for insert to authenticated
  with check (public.has_company_access(company_id) and requested_by = auth.uid());
grant insert on public.approval_requests to authenticated;

-- ---------------------------------------------------------------------
-- 3. Child tables inherit access from their parent
-- ---------------------------------------------------------------------
create policy invoice_lines_all on public.invoice_lines for all to authenticated
  using (exists (select 1 from public.invoices i where i.id = invoice_id
                 and public.has_company_access(i.company_id) and public.has_perm('invoices','view')))
  with check (exists (select 1 from public.invoices i where i.id = invoice_id and i.journal_entry_id is null
                 and public.has_company_access(i.company_id) and public.has_perm('invoices','edit')));
grant select, insert, update, delete on public.invoice_lines to authenticated;

create policy journal_lines_select on public.journal_lines for select to authenticated
  using (public.has_company_access(company_id) and public.has_perm('accounting','view'));
grant select on public.journal_lines to authenticated;

create policy depreciation_items_select on public.depreciation_run_items for select to authenticated
  using (exists (select 1 from public.depreciation_runs r where r.id = run_id
                 and public.has_company_access(r.company_id) and public.has_perm('fixed-assets','view')));
grant select on public.depreciation_run_items to authenticated;

create policy payroll_items_all on public.payroll_items for all to authenticated
  using (exists (select 1 from public.payroll_runs r where r.id = run_id
                 and public.has_company_access(r.company_id) and public.has_perm('payroll','view')))
  with check (exists (select 1 from public.payroll_runs r where r.id = run_id and r.status in ('Draft','Under Review')
                 and public.has_company_access(r.company_id) and public.has_perm('payroll','edit')));
grant select, insert, update, delete on public.payroll_items to authenticated;

create policy approval_actions_select on public.approval_actions for select to authenticated
  using (exists (select 1 from public.approval_requests r where r.id = request_id
                 and public.has_company_access(r.company_id)));
grant select on public.approval_actions to authenticated;

-- ---------------------------------------------------------------------
-- 4. Group-level master data, identity, configuration
-- ---------------------------------------------------------------------
do $$
declare r record;
begin
  for r in select * from (values ('suppliers','suppliers'), ('customers','customers')) as m(tbl, module) loop
    execute format($f$create policy %1$I on public.%2$I for select to authenticated using (public.has_perm(%3$L,'view') or public.has_perm('invoices','view'))$f$, r.tbl||'_select', r.tbl, r.module);
    execute format($f$create policy %1$I on public.%2$I for insert to authenticated with check (public.has_perm(%3$L,'create'))$f$, r.tbl||'_insert', r.tbl, r.module);
    execute format($f$create policy %1$I on public.%2$I for update to authenticated using (public.has_perm(%3$L,'edit')) with check (public.has_perm(%3$L,'edit'))$f$, r.tbl||'_update', r.tbl, r.module);
    execute format($f$create policy %1$I on public.%2$I for delete to authenticated using (public.has_perm(%3$L,'delete'))$f$, r.tbl||'_delete', r.tbl, r.module);
    execute format('grant select, insert, update, delete on public.%I to authenticated', r.tbl);
  end loop;
end $$;

create policy companies_select on public.companies for select to authenticated using (public.has_company_access(id));
create policy companies_write  on public.companies for all to authenticated
  using (public.has_perm('companies','edit')) with check (public.has_perm('companies','edit'));
grant select, insert, update, delete on public.companies to authenticated;

create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.has_perm('users-roles','view')
         or exists (select 1 from public.company_members a join public.company_members b using (company_id)
                    where a.user_id = auth.uid() and b.user_id = profiles.id));
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid() or public.has_perm('users-roles','edit'))
  with check (id = auth.uid() or public.has_perm('users-roles','edit'));   -- role/status guarded by trigger
grant select, update on public.profiles to authenticated;

create policy members_select on public.company_members for select to authenticated
  using (user_id = auth.uid() or public.has_perm('users-roles','view'));
create policy members_write on public.company_members for all to authenticated
  using (public.has_perm('users-roles','edit')) with check (public.has_perm('users-roles','edit'));
grant select, insert, update, delete on public.company_members to authenticated;

do $$
declare t text;
begin
  foreach t in array array['role_permissions','approval_limits','approval_rules'] loop
    execute format('create policy %I on public.%I for select to authenticated using (true)', t||'_select', t);
    execute format($f$create policy %I on public.%I for all to authenticated
      using (public.has_perm('settings','edit')) with check (public.has_perm('settings','edit'))$f$, t||'_write', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

create policy notifications_select on public.notifications for select to authenticated
  using (public.has_company_access(company_id) and (user_id is null or user_id = auth.uid()));
grant select on public.notifications to authenticated;
create policy notification_reads_own on public.notification_reads for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, delete on public.notification_reads to authenticated;

create policy audit_logs_select on public.audit_logs for select to authenticated
  using (public.has_perm('audit-logs','view') and (company_id is null and public.is_super_admin()
         or company_id is not null and public.has_company_access(company_id)));
grant select on public.audit_logs to authenticated;
-- doc_sequences: no policies, reached only through next_doc_number()

grant select on public.v_account_balances, public.v_bank_balances, public.v_party_balances, public.v_invoice_aging
  to authenticated;

-- ---------------------------------------------------------------------
-- 5. Permission matrix seed — a faithful port of AuthContext.canAccessPage + hasPermission
--    (a role gets an action on a module only if it can open the page AND hasPermission allows it)
-- ---------------------------------------------------------------------
insert into public.role_permissions (role, module, action)
select r.role, m.module, a.action
from unnest(enum_range(null::public.user_role)) as r(role)
cross join (values
    ('vehicles','vehicles','vehicles'), ('maintenance','maintenance','maintenance'),
    ('work-orders','work-orders','work-orders'), ('oil','oil-management','oil'),
    ('tyres','tyre-management','tyres'), ('accidents','accidents','accidents'),
    ('expenses','expenses','expenses'), ('documents','documents','documents'),
    ('suppliers','suppliers','suppliers'), ('customers','customers','customers'),
    ('invoices','invoices','invoices'), ('payments','payments','payments'),
    ('reconciliation','reconciliation','reconciliation'), ('accounting','accounting','accounting'),
    ('fixed-assets','fixed-assets','accounting'), ('payroll','payroll','payroll'),
    ('approvals','approvals','approvals'), ('audit-logs','audit-logs','audit-logs'),
    ('notifications','notifications','notifications'), ('companies','companies','companies'),
    ('users-roles','users-roles','users-roles'), ('settings','settings','settings'),
    ('reports','reports','reports')
  ) as m(module, page, auth_module)
cross join unnest(enum_range(null::public.permission_action)) as a(action)
where
  -- canAccessPage
  (r.role in ('Super Admin','Company Admin') or case
     when m.page in ('users-roles','settings') then false
     when m.page in ('accounting','fixed-assets','payroll') then r.role in ('Finance Manager','Accountant','Management')
     when m.page = 'approvals' then r.role in ('Finance Manager','Fleet Manager','Accountant')
     when m.page in ('invoices','reconciliation','payments') then r.role in ('Finance Manager','Accountant','Procurement','Management')
     when m.page in ('suppliers','customers') then r.role in ('Finance Manager','Accountant','Procurement','Fleet Manager','Management')
     else true end)
  and
  -- hasPermission
  (case r.role
     when 'Super Admin' then true
     when 'Company Admin' then true
     when 'Finance Manager' then true
     when 'Viewer' then a.action in ('view','export','print')
     when 'Management' then a.action in ('view','export','print')
     when 'Fleet Manager' then m.auth_module not in ('finance','accounting','balance-sheet') or a.action = 'view'
     when 'Maintenance Manager' then m.auth_module in ('maintenance','oil','tyres','work-orders') or a.action = 'view'
     when 'Accountant' then m.auth_module in ('invoices','payments','reconciliation','accounting','pnl','balance-sheet') or a.action = 'view'
     when 'Procurement' then m.auth_module in ('suppliers','invoices','reconciliation') or a.action = 'view'
     else a.action = 'view' end);

insert into public.approval_limits (role, module, max_amount) values
  ('Company Admin','maintenance',null), ('Company Admin','invoice',null), ('Company Admin','expense',null),
  ('Finance Manager','maintenance',null), ('Finance Manager','invoice',null), ('Finance Manager','expense',null),
  ('Fleet Manager','maintenance',500), ('Accountant','invoice',500);

-- ---------------------------------------------------------------------
-- 6. Storage: private bucket, objects stored under <company_id>/<...>
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 10485760, array['application/pdf','image/png','image/jpeg'])
on conflict (id) do nothing;

create or replace function public.storage_company(p_name text) returns uuid
language sql immutable as $$
  select case when split_part(p_name, '/', 1) ~ '^[0-9a-f-]{36}$' then split_part(p_name, '/', 1)::uuid end
$$;
grant execute on function public.storage_company(text) to authenticated;

create policy documents_read on storage.objects for select to authenticated
  using (bucket_id = 'documents' and public.has_company_access(public.storage_company(name))
         and public.has_perm('documents','view'));
create policy documents_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and public.has_company_access(public.storage_company(name))
              and public.has_perm('documents','create'));
create policy documents_delete on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and public.has_company_access(public.storage_company(name))
         and public.has_perm('documents','delete'));

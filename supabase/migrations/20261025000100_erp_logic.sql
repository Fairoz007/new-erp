-- =====================================================================
-- ERP integrity logic: derived totals, GL enforcement, atomic RPCs,
-- reporting views, audit triggers
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Invoice totals from lines (client-supplied totals are ignored)
-- ---------------------------------------------------------------------
create or replace function public.recalc_invoice_totals(p_invoice uuid) returns void
language sql security definer set search_path = public as $$
  update public.invoices i set
    subtotal       = coalesce(t.sub, 0),
    discount_total = coalesce(t.disc, 0),
    tax_total      = coalesce(t.tax, 0),
    grand_total    = coalesce(t.total, 0) + i.other_charges,
    updated_at     = now()
  from (select round(sum(quantity * unit_price), 3) sub, sum(discount_amount) disc,
               sum(tax_amount) tax, sum(line_total) total
        from public.invoice_lines where invoice_id = p_invoice) t
  where i.id = p_invoice
$$;

create or replace function public.trg_invoice_lines_totals() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.recalc_invoice_totals(coalesce(new.invoice_id, old.invoice_id));
  return null;
end $$;
create trigger invoice_lines_totals after insert or update or delete on public.invoice_lines
  for each row execute function public.trg_invoice_lines_totals();

-- Paid/credited amounts and payment status are derived from payments and credit notes.
create or replace function public.recalc_invoice_settlement(p_invoice uuid) returns void
language sql security definer set search_path = public as $$
  update public.invoices i set
    amount_paid     = coalesce((select sum(amount) from public.payments where invoice_id = i.id), 0),
    credited_amount = coalesce((select sum(grand_total) from public.invoices cn
                                where cn.parent_invoice_id = i.id and cn.is_credit_note
                                  and cn.approval_status <> 'Cancelled'), 0),
    updated_at      = now()
  where i.id = p_invoice;
  update public.invoices i set payment_status = case
      when i.payment_status = 'Cancelled' then 'Cancelled'
      when i.outstanding_amount <= 0.0005 then 'Paid'
      when i.amount_paid > 0 or i.credited_amount > 0 then 'Partially Paid'
      when i.due_date < current_date then 'Overdue'
      else 'Unpaid' end
  where i.id = p_invoice
$$;

create or replace function public.trg_payments_settlement() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.recalc_invoice_settlement(coalesce(new.invoice_id, old.invoice_id));
  return null;
end $$;
create trigger payments_settlement after insert or update or delete on public.payments
  for each row execute function public.trg_payments_settlement();

create or replace function public.trg_credit_note_settlement() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(new.is_credit_note, old.is_credit_note) then
    perform public.recalc_invoice_settlement(coalesce(new.parent_invoice_id, old.parent_invoice_id));
  end if;
  return null;
end $$;
create trigger invoices_credit_note_settlement after insert or update of grand_total, approval_status or delete on public.invoices
  for each row execute function public.trg_credit_note_settlement();

-- ---------------------------------------------------------------------
-- 2. Double-entry enforcement: every posted entry must balance (checked at commit)
-- ---------------------------------------------------------------------
create or replace function public.trg_journal_balanced() returns trigger
language plpgsql set search_path = public as $$
declare v_entry uuid := coalesce(new.entry_id, old.entry_id); v_dr numeric; v_cr numeric; v_status text;
begin
  select status into v_status from public.journal_entries where id = v_entry;
  if v_status is null or v_status = 'Draft' then return null; end if;
  select coalesce(sum(debit),0), coalesce(sum(credit),0) into v_dr, v_cr
  from public.journal_lines where entry_id = v_entry;
  if v_dr <> v_cr or v_dr = 0 then
    raise exception 'Journal entry % is unbalanced (Dr % / Cr %)', v_entry, v_dr, v_cr;
  end if;
  return null;
end $$;
create constraint trigger journal_lines_balanced after insert or update or delete on public.journal_lines
  deferrable initially deferred for each row execute function public.trg_journal_balanced();

-- Posted entries are immutable; corrections are made by reversal.
create or replace function public.trg_journal_immutable() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' and old.status = 'Posted' then
    raise exception 'Posted journal entries cannot be deleted; post a reversal instead';
  end if;
  if tg_op = 'UPDATE' and old.status = 'Posted' and
     (new.status not in ('Posted','Void') or new.date <> old.date or new.company_id <> old.company_id) then
    raise exception 'Posted journal entries are immutable';
  end if;
  return coalesce(new, old);
end $$;
create trigger journal_entries_immutable before update or delete on public.journal_entries
  for each row execute function public.trg_journal_immutable();

create or replace function public.trg_journal_lines_company() returns trigger
language plpgsql set search_path = public as $$
begin
  select company_id into new.company_id from public.journal_entries where id = new.entry_id;
  if exists (select 1 from public.journal_entries where id = new.entry_id and status = 'Posted')
     and tg_op = 'UPDATE' then
    raise exception 'Lines of a posted journal entry are immutable';
  end if;
  return new;
end $$;
create trigger journal_lines_company before insert or update on public.journal_lines
  for each row execute function public.trg_journal_lines_company();

-- ---------------------------------------------------------------------
-- 3. Atomic RPCs (called from the client with supabase.rpc)
-- ---------------------------------------------------------------------

-- Post a manual or system journal entry. p_lines: [{account_code, debit, credit, description, vehicle_id, cost_centre}]
create or replace function public.post_journal_entry(
  p_company uuid, p_date date, p_description text, p_lines jsonb,
  p_reference text default null, p_source text default 'Manual', p_source_id uuid default null)
returns uuid language plpgsql security invoker set search_path = public as $$
declare v_id uuid;
begin
  if not public.has_company_access(p_company) or not public.has_perm('accounting', 'create') then
    raise exception 'Permission denied';
  end if;
  insert into public.journal_entries (company_id, entry_number, date, reference, description, source_module, source_id)
  values (p_company, public.next_doc_number(p_company, 'JE-' || extract(year from p_date)::int), p_date,
          p_reference, p_description, p_source, p_source_id)
  returning id into v_id;
  insert into public.journal_lines (entry_id, company_id, account_code, debit, credit, description, vehicle_id, cost_centre)
  select v_id, p_company, l->>'account_code', coalesce((l->>'debit')::numeric, 0), coalesce((l->>'credit')::numeric, 0),
         l->>'description', nullif(l->>'vehicle_id','')::uuid, l->>'cost_centre'
  from jsonb_array_elements(p_lines) l
  where coalesce((l->>'debit')::numeric, 0) > 0 or coalesce((l->>'credit')::numeric, 0) > 0;
  return v_id;   -- balance is verified by the deferred constraint trigger at commit
end $$;

-- Record a payment AND its GL entry in one transaction (closes audit gap: payments never reached the GL).
create or replace function public.record_payment(
  p_invoice uuid, p_amount numeric, p_date date, p_method text, p_bank_account uuid,
  p_reference text default null, p_cheque text default null, p_notes text default null)
returns uuid language plpgsql security invoker set search_path = public as $$
declare inv public.invoices; ba public.bank_accounts; v_pay uuid; v_je uuid; v_ctrl text;
begin
  select * into inv from public.invoices where id = p_invoice for update;   -- serialize concurrent payments
  if not found then raise exception 'Invoice not found'; end if;
  if not public.has_company_access(inv.company_id) or not public.has_perm('payments', 'create') then
    raise exception 'Permission denied';
  end if;
  if inv.is_credit_note or inv.payment_status = 'Cancelled' then raise exception 'Invoice cannot be paid'; end if;
  if p_amount <= 0 or p_amount > inv.outstanding_amount + 0.0005 then
    raise exception 'Payment amount must be between 0 and outstanding %', inv.outstanding_amount;
  end if;
  select * into ba from public.bank_accounts where id = p_bank_account and company_id = inv.company_id and active;
  if not found then raise exception 'Bank account not found for this company'; end if;

  v_ctrl := case inv.invoice_type when 'Purchase' then '2010' else '1100' end;   -- AP / AR control accounts
  v_je := public.post_journal_entry(inv.company_id, p_date, 'Payment for ' || inv.invoice_number,
    case inv.invoice_type
      when 'Purchase' then jsonb_build_array(
        jsonb_build_object('account_code', v_ctrl, 'debit', p_amount),
        jsonb_build_object('account_code', ba.gl_account_code, 'credit', p_amount))
      else jsonb_build_array(
        jsonb_build_object('account_code', ba.gl_account_code, 'debit', p_amount),
        jsonb_build_object('account_code', v_ctrl, 'credit', p_amount)) end,
    p_reference, 'Payment', p_invoice);

  insert into public.payments (company_id, payment_number, invoice_id, payment_date, amount, payment_method,
                               bank_account_id, transaction_reference, cheque_number, notes, journal_entry_id)
  values (inv.company_id, public.next_doc_number(inv.company_id, 'PAY-' || extract(year from p_date)::int),
          p_invoice, p_date, p_amount, p_method, p_bank_account, p_reference, p_cheque, p_notes, v_je)
  returning id into v_pay;
  return v_pay;
end $$;

-- Approve an invoice and post it to the GL (AR/AP vs revenue/expense + VAT).
create or replace function public.post_invoice(p_invoice uuid) returns uuid
language plpgsql security invoker set search_path = public as $$
declare inv public.invoices; v_lines jsonb; v_je uuid; v_ctrl text; v_vat text;
begin
  select * into inv from public.invoices where id = p_invoice for update;
  if not found then raise exception 'Invoice not found'; end if;
  if inv.journal_entry_id is not null then raise exception 'Invoice already posted'; end if;
  if not public.has_company_access(inv.company_id) or not public.can_approve('invoice', inv.grand_total) then
    raise exception 'Permission denied';
  end if;
  if inv.grand_total <= 0 then raise exception 'Invoice has no lines'; end if;

  v_ctrl := case inv.invoice_type when 'Purchase' then '2010' else '1100' end;
  v_vat  := case inv.invoice_type when 'Purchase' then '1300' else '2100' end;   -- input / output VAT
  -- Net amounts per GL account; sign flips for credit notes
  select jsonb_agg(x) into v_lines from (
    select jsonb_build_object('account_code', g.code,
             case when (inv.invoice_type = 'Purchase') <> inv.is_credit_note then 'debit' else 'credit' end, g.net) x
    from (select coalesce(gl_account_code, case inv.invoice_type when 'Purchase' then '5000' else '4000' end) code,
                 round(sum(line_total - tax_amount), 3) net
          from public.invoice_lines where invoice_id = p_invoice group by 1) g
    union all
    select jsonb_build_object('account_code', v_vat,
             case when (inv.invoice_type = 'Purchase') <> inv.is_credit_note then 'debit' else 'credit' end, inv.tax_total)
    where inv.tax_total > 0
    union all
    select jsonb_build_object('account_code', v_ctrl,
             case when (inv.invoice_type = 'Purchase') <> inv.is_credit_note then 'credit' else 'debit' end,
             inv.grand_total - inv.other_charges)
  ) s;

  v_je := public.post_journal_entry(inv.company_id, inv.invoice_date,
            (case when inv.is_credit_note then 'Credit note ' else 'Invoice ' end) || inv.invoice_number,
            v_lines, inv.reference_number, 'Invoice', p_invoice);
  update public.invoices set journal_entry_id = v_je, approval_status = 'Approved',
         approved_by = auth.uid(), approval_date = now() where id = p_invoice;
  return v_je;
end $$;

-- Approve/reject a request with server-side role and threshold checks (audit gap: was UI-only).
create or replace function public.decide_approval(p_request uuid, p_action text, p_comment text)
returns void language plpgsql security invoker set search_path = public as $$
declare r public.approval_requests; v_role public.user_role := public.app_role(); v_module text;
begin
  select * into r from public.approval_requests where id = p_request for update;
  if not found then raise exception 'Request not found'; end if;
  if r.status <> 'Pending' then raise exception 'Request already %', r.status; end if;
  v_module := case r.reference_type when 'WorkOrder' then 'maintenance' when 'Invoice' then 'invoice' else 'expense' end;
  if not public.has_company_access(r.company_id) or not public.can_approve(v_module, r.amount)
     or (cardinality(r.required_roles) > 0 and not public.is_super_admin() and not v_role = any(r.required_roles)) then
    raise exception 'You are not authorised to decide this request';
  end if;
  if p_action not in ('Approved','Rejected') then raise exception 'Invalid action'; end if;

  insert into public.approval_actions (request_id, level, approver_id, approver_role, action, comment)
  values (p_request, r.current_level, auth.uid(), v_role, p_action, p_comment);

  update public.approval_requests set
    status = case when p_action = 'Rejected' then 'Rejected'
                  when r.current_level >= r.total_levels then 'Approved' else 'Pending' end,
    current_level = case when p_action = 'Approved' and r.current_level < r.total_levels
                         then r.current_level + 1 else r.current_level end
  where id = p_request;

  if r.reference_type = 'WorkOrder' and (p_action = 'Rejected' or r.current_level >= r.total_levels) then
    update public.work_orders set approval_status = p_action,
           status = case when p_action = 'Approved' and status = 'Requested' then 'Approved' else status end
    where id = r.reference_id;
  end if;
end $$;

-- Complete a work order and create exactly one maintenance record (audit fix: duplicates under StrictMode).
create or replace function public.complete_work_order(p_work_order uuid, p_final_cost numeric)
returns uuid language plpgsql security invoker set search_path = public as $$
declare wo public.work_orders; v_mileage int; v_id uuid;
begin
  select * into wo from public.work_orders where id = p_work_order for update;
  if not found then raise exception 'Work order not found'; end if;
  if not public.has_perm('work-orders', 'edit') then raise exception 'Permission denied'; end if;
  if wo.status = 'Completed' then raise exception 'Work order already completed'; end if;
  select current_mileage into v_mileage from public.vehicles where id = wo.vehicle_id;

  update public.work_orders set status = 'Completed', final_cost = p_final_cost,
         actual_completion = current_date, updated_at = now() where id = p_work_order;   -- approval CHECK applies

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

-- ---------------------------------------------------------------------
-- 4. Reporting views (security_invoker so RLS of the caller applies)
-- ---------------------------------------------------------------------
create view public.v_account_balances with (security_invoker = true) as
select a.company_id, a.code, a.name, a.category, a.subcategory,
       a.opening_balance
       + case when a.category in ('Asset','Expense')
              then coalesce(sum(l.debit - l.credit), 0)
              else coalesce(sum(l.credit - l.debit), 0) end as balance,
       coalesce(sum(l.debit), 0)  as total_debit,
       coalesce(sum(l.credit), 0) as total_credit
from public.accounts a
left join (select l.* from public.journal_lines l
           join public.journal_entries e on e.id = l.entry_id and e.status = 'Posted') l
       on l.company_id = a.company_id and l.account_code = a.code
group by a.company_id, a.code;

create view public.v_bank_balances with (security_invoker = true) as
select b.id, b.company_id, b.bank_name, b.account_name, b.account_number,
       b.opening_balance
       + coalesce(sum(case when i.invoice_type = 'Sales' then p.amount else -p.amount end), 0) as current_balance
from public.bank_accounts b
left join public.payments p on p.bank_account_id = b.id
left join public.invoices i on i.id = p.invoice_id
group by b.id;

create view public.v_party_balances with (security_invoker = true) as
select i.company_id, i.party_type, coalesce(i.supplier_id, i.customer_id) as party_id,
       sum(i.grand_total) filter (where not i.is_credit_note) as total_invoiced,
       sum(i.amount_paid) as total_paid,
       sum(i.grand_total) filter (where i.is_credit_note) as total_credited,
       sum(i.outstanding_amount) filter (where not i.is_credit_note) as outstanding,
       count(*) filter (where not i.is_credit_note) as invoice_count
from public.invoices i
where i.payment_status <> 'Cancelled'
group by i.company_id, i.party_type, coalesce(i.supplier_id, i.customer_id);

-- Real AP/AR aging (replaces the fabricated 40/30/20/10 split in ReportsPage)
create view public.v_invoice_aging with (security_invoker = true) as
select company_id, invoice_type, coalesce(supplier_id, customer_id) as party_id,
       sum(outstanding_amount) filter (where due_date >= current_date)                       as current_due,
       sum(outstanding_amount) filter (where current_date - due_date between 1 and 30)       as days_1_30,
       sum(outstanding_amount) filter (where current_date - due_date between 31 and 60)      as days_31_60,
       sum(outstanding_amount) filter (where current_date - due_date between 61 and 90)      as days_61_90,
       sum(outstanding_amount) filter (where current_date - due_date > 90)                   as days_90_plus
from public.invoices
where not is_credit_note and outstanding_amount > 0 and payment_status <> 'Cancelled'
group by 1, 2, 3;

-- ---------------------------------------------------------------------
-- 5. Audit trail (replaces client-side logAudit)
-- ---------------------------------------------------------------------
create or replace function public.trg_audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_row jsonb := to_jsonb(coalesce(new, old));
begin
  insert into public.audit_logs (company_id, action, entity_type, entity_id, old_value, new_value)
  values ((v_row->>'company_id')::uuid,
          case tg_op when 'INSERT' then 'CREATE' else tg_op end,
          tg_table_name, coalesce(v_row->>'id', v_row->>'code'),
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['companies','vehicles','work_orders','maintenance_records','oil_changes','tyres',
    'accidents','expenses','suppliers','customers','invoices','payments','reconciliations','journal_entries',
    'bank_accounts','fixed_assets','depreciation_runs','employees','payroll_runs','documents','approval_requests']
  loop
    execute format('create trigger %I after insert or update or delete on public.%I
                    for each row execute function public.trg_audit()', t || '_audit', t);
  end loop;
end $$;

-- updated_at maintenance
create or replace function public.trg_touch() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
do $$
declare t text;
begin
  foreach t in array array['companies','suppliers','customers','vehicles','work_orders','fixed_assets']
  loop
    execute format('create trigger %I before update on public.%I for each row execute function public.trg_touch()',
                   t || '_touch', t);
  end loop;
end $$;

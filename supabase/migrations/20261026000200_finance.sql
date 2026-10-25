-- =====================================================================
-- Agent B (AR/AP): invoices, credit notes, payments guard, reconciliation,
-- party balances. Additive only. See docs/audit/agent-B.md.
--
-- Posting model (maps the existing UI approval flow onto the GL):
--   * create_invoice(header, lines, submit) inserts header + lines atomically as Draft.
--     Totals come from the invoice_lines triggers; client totals are ignored.
--   * submit (default true): if the caller can_approve('invoice', grand_total) the invoice is
--     posted immediately with post_invoice (status Approved + journal entry). Otherwise it becomes
--     'Pending Approval' and an approval_requests row (reference_type 'Invoice') is raised.
--   * decide_approval -> approval_requests.status 'Approved' fires fin_invoice_approval_bridge,
--     which posts the invoice as the approver (post_invoice re-checks can_approve). 'Rejected'
--     sets the invoice to Rejected; the owner can edit the lines and submit again.
--   * Payments are only accepted against posted (Approved) invoices, so AP/AR is credited before
--     it is debited (record_payment otherwise drove the control accounts negative).
--   * Credit notes post immediately and therefore need invoice approval authority for their amount.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Additive columns
-- ---------------------------------------------------------------------
alter table public.reconciliations
  add column if not exists work_order_number text,
  add column if not exists work_order_amount numeric(14,3) check (work_order_amount >= 0);

-- Same supplier bill (supplier reference) must not be booked twice in one office.
create unique index if not exists invoices_supplier_bill_unique
  on public.invoices (company_id, supplier_id, lower(reference_number))
  where invoice_type = 'Purchase' and not is_credit_note and approval_status <> 'Cancelled'
        and reference_number is not null and reference_number <> '';

-- ---------------------------------------------------------------------
-- 1. Guards: clients (role "authenticated") cannot write derived or workflow columns.
--    SECURITY DEFINER RPCs/triggers run as the owner and are not affected.
-- ---------------------------------------------------------------------
create or replace function public.fin_invoices_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user <> 'authenticated' then
    return coalesce(new, old);
  end if;

  if tg_op = 'INSERT' then
    if new.is_credit_note or new.parent_invoice_id is not null then
      raise exception 'Credit notes must be created with create_credit_note()';
    end if;
    new.subtotal := 0; new.discount_total := 0; new.tax_total := 0; new.grand_total := new.other_charges;
    new.amount_paid := 0; new.credited_amount := 0;
    new.journal_entry_id := null; new.approved_by := null; new.approval_date := null;
    new.approval_status := 'Draft'; new.payment_status := 'Unpaid';
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.journal_entry_id is not null or old.approval_status not in ('Draft','Rejected','Cancelled')
       or exists (select 1 from public.invoices c where c.parent_invoice_id = old.id) then
      raise exception 'Only unposted draft, rejected or cancelled invoices can be deleted';
    end if;
    return old;
  end if;

  -- UPDATE
  if (new.subtotal, new.discount_total, new.tax_total, new.grand_total, new.amount_paid, new.credited_amount)
       is distinct from (old.subtotal, old.discount_total, old.tax_total, old.grand_total, old.amount_paid, old.credited_amount)
     or new.journal_entry_id is distinct from old.journal_entry_id
     or new.approved_by is distinct from old.approved_by
     or new.approval_date is distinct from old.approval_date
     or new.is_credit_note is distinct from old.is_credit_note
     or new.parent_invoice_id is distinct from old.parent_invoice_id
     or new.company_id is distinct from old.company_id
     or new.invoice_number is distinct from old.invoice_number
     or new.invoice_type is distinct from old.invoice_type
     or new.party_type is distinct from old.party_type
     or new.other_charges is distinct from old.other_charges then
    raise exception 'Invoice totals, numbering and posting fields are maintained by the system';
  end if;

  if new.approval_status is distinct from old.approval_status then
    if not ((new.approval_status = 'Cancelled' and old.approval_status in ('Draft','Rejected'))
         or (new.approval_status = 'Draft' and old.approval_status = 'Rejected')) then
      raise exception 'Invalid approval status change % -> % (use submit_invoice / approvals)', old.approval_status, new.approval_status;
    end if;
  end if;
  if new.payment_status is distinct from old.payment_status then
    if not (new.payment_status = 'Cancelled' and new.approval_status = 'Cancelled' and old.amount_paid = 0) then
      raise exception 'Payment status is maintained by the system';
    end if;
  end if;
  if new.approval_status = 'Cancelled' and new.payment_status <> 'Cancelled' then
    new.payment_status := 'Cancelled';
  end if;

  -- Submitted or posted documents: commercial terms are frozen
  if old.approval_status not in ('Draft','Rejected') then
    if new.supplier_id is distinct from old.supplier_id or new.customer_id is distinct from old.customer_id
       or new.invoice_date is distinct from old.invoice_date or new.currency is distinct from old.currency
       or new.exchange_rate is distinct from old.exchange_rate or new.party_snapshot is distinct from old.party_snapshot then
      raise exception 'Submitted or posted invoices cannot change party, date or currency';
    end if;
  end if;
  return new;
end $$;

create trigger fin_invoices_guard before insert or update or delete on public.invoices
  for each row execute function public.fin_invoices_guard();

create or replace function public.fin_invoice_lines_guard() returns trigger
language plpgsql set search_path = public as $$
declare v_status text; v_cn boolean;
begin
  if current_user <> 'authenticated' then return coalesce(new, old); end if;
  select approval_status, is_credit_note into v_status, v_cn
  from public.invoices where id = coalesce(new.invoice_id, old.invoice_id);
  if not found then return coalesce(new, old); end if;          -- parent being deleted (cascade)
  if v_cn or v_status not in ('Draft','Rejected') then
    raise exception 'Lines can only be changed on draft or rejected invoices';
  end if;
  return coalesce(new, old);
end $$;

create trigger fin_invoice_lines_guard before insert or update or delete on public.invoice_lines
  for each row execute function public.fin_invoice_lines_guard();

-- A GL-posted payment (record_payment) needs a GL-posted invoice.
create or replace function public.fin_payments_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.journal_entry_id is not null and not exists (
       select 1 from public.invoices i
       where i.id = new.invoice_id and i.approval_status = 'Approved' and i.journal_entry_id is not null) then
    raise exception 'Invoice must be approved and posted before it can be paid';
  end if;
  return new;
end $$;

create trigger fin_payments_guard before insert on public.payments
  for each row execute function public.fin_payments_guard();

-- ---------------------------------------------------------------------
-- 2. Internal helpers (not granted to clients)
-- ---------------------------------------------------------------------
-- Insert lines from a jsonb array. Keys: item_code, description, quantity, unit, unit_price,
-- discount_percentage, tax_rate_percentage, vehicle_id, expense_category, gl_account_code, cost_centre
create or replace function public.fin_insert_lines(p_invoice uuid, p_company uuid, p_lines jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare l jsonb; n int := 0; v_gl text;
begin
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'An invoice needs at least one line';
  end if;
  for l in select * from jsonb_array_elements(p_lines) loop
    n := n + 1;
    if coalesce(trim(l->>'description'), '') = '' then raise exception 'Line %: description is required', n; end if;
    if coalesce((l->>'quantity')::numeric, 0) <= 0 then raise exception 'Line %: quantity must be greater than zero', n; end if;
    if coalesce((l->>'unit_price')::numeric, -1) < 0 then raise exception 'Line %: unit price cannot be negative', n; end if;
    v_gl := nullif(trim(l->>'gl_account_code'), '');
    if v_gl is not null and not exists (select 1 from public.accounts where company_id = p_company and code = v_gl) then
      raise exception 'Line %: GL account % does not exist for this office', n, v_gl;
    end if;
    insert into public.invoice_lines (invoice_id, line_no, item_code, description, quantity, unit, unit_price,
        discount_percentage, tax_rate_percentage, vehicle_id, expense_category, gl_account_code, cost_centre)
    values (p_invoice, n, nullif(l->>'item_code',''), trim(l->>'description'), (l->>'quantity')::numeric,
        nullif(l->>'unit',''), (l->>'unit_price')::numeric,
        coalesce((l->>'discount_percentage')::numeric, 0), coalesce((l->>'tax_rate_percentage')::numeric, 0),
        nullif(l->>'vehicle_id','')::uuid, nullif(l->>'expense_category',''), v_gl, nullif(l->>'cost_centre',''));
  end loop;
end $$;

-- Post (when the caller may approve the amount) or raise an approval request.
create or replace function public.fin_submit_invoice(p_invoice uuid) returns text
language plpgsql security definer set search_path = public as $$
declare inv public.invoices; v_roles public.user_role[];
begin
  select * into inv from public.invoices where id = p_invoice for update;
  if inv.grand_total <= 0 then raise exception 'Invoice total must be greater than zero'; end if;
  if public.can_approve('invoice', inv.grand_total) then
    perform public.post_invoice(p_invoice);
    return 'Approved';
  end if;
  update public.invoices set approval_status = 'Pending Approval' where id = p_invoice;
  if not exists (select 1 from public.approval_requests
                 where reference_type = 'Invoice' and reference_id = p_invoice and status = 'Pending') then
    select r.required_roles into v_roles from public.approval_rules r
    where r.module = 'invoice' and r.active and r.threshold_amount <= inv.grand_total
    order by r.threshold_amount desc limit 1;
    insert into public.approval_requests (company_id, reference_type, reference_id, reference_number, requested_by,
        amount, currency, required_roles, notes)
    values (inv.company_id, 'Invoice', inv.id, inv.invoice_number, auth.uid(), inv.grand_total, inv.currency,
        coalesce(v_roles, '{}'), 'Invoice approval and GL posting');
  end if;
  return 'Pending Approval';
end $$;

-- ---------------------------------------------------------------------
-- 3. Client RPCs
-- ---------------------------------------------------------------------
-- p_header keys (snake_case DB columns): company_id, invoice_type, supplier_id | customer_id, invoice_date,
-- due_date, reference_number, purchase_order_number, work_order_id, maintenance_record_id, vehicle_id,
-- cost_centre, currency, exchange_rate, payment_terms_days, terms_and_conditions, notes, attachment_path.
-- invoice_number is assigned by the numbering trigger. Returns the new invoice id.
create or replace function public.create_invoice(p_header jsonb, p_lines jsonb, p_submit boolean default true)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_company uuid := nullif(p_header->>'company_id','')::uuid;
  v_type public.invoice_type := (p_header->>'invoice_type')::public.invoice_type;
  v_party uuid; v_snapshot jsonb; v_terms int; v_date date; v_due date; v_id uuid; v_ref text;
begin
  if v_company is null or not public.has_company_access(v_company) or not public.has_perm('invoices', 'create') then
    raise exception 'Permission denied';
  end if;
  if v_type is null then raise exception 'Invoice type is required'; end if;
  if coalesce((p_header->>'other_charges')::numeric, 0) <> 0 then
    raise exception 'Other charges are not supported; add them as an invoice line';
  end if;

  if v_type = 'Purchase' then
    v_party := nullif(p_header->>'supplier_id','')::uuid;
    select jsonb_build_object('name', name, 'vat_number', vat_number, 'address', address, 'email', email, 'phone', phone),
           payment_terms_days
      into v_snapshot, v_terms
      from public.suppliers where id = v_party and status = 'Active';
    if not found then raise exception 'Supplier not found or not active'; end if;
  else
    v_party := nullif(p_header->>'customer_id','')::uuid;
    select jsonb_build_object('name', name, 'vat_number', vat_number, 'address', address, 'email', email, 'phone', phone),
           payment_terms_days
      into v_snapshot, v_terms
      from public.customers where id = v_party and status = 'Active';
    if not found then raise exception 'Customer not found or not active'; end if;
  end if;

  v_terms := coalesce(nullif(p_header->>'payment_terms_days','')::int, v_terms, 30);
  v_date  := coalesce(nullif(p_header->>'invoice_date','')::date, current_date);
  v_due   := coalesce(nullif(p_header->>'due_date','')::date, v_date + v_terms);
  v_ref   := nullif(trim(p_header->>'reference_number'), '');

  if v_type = 'Purchase' and v_ref is not null and exists (
       select 1 from public.invoices where company_id = v_company and supplier_id = v_party
         and lower(reference_number) = lower(v_ref) and not is_credit_note and approval_status <> 'Cancelled') then
    raise exception 'Supplier bill % is already recorded for this supplier', v_ref;
  end if;

  insert into public.invoices (company_id, invoice_number, invoice_type, party_type, supplier_id, customer_id,
      party_snapshot, invoice_date, due_date, reference_number, purchase_order_number, work_order_id,
      maintenance_record_id, vehicle_id, cost_centre, currency, exchange_rate, payment_terms_days,
      terms_and_conditions, notes, attachment_path)
  values (v_company, null, v_type,
      case v_type when 'Purchase' then 'Supplier'::public.party_type else 'Customer'::public.party_type end,
      case when v_type = 'Purchase' then v_party end, case when v_type = 'Sales' then v_party end,
      v_snapshot, v_date, v_due, v_ref, nullif(p_header->>'purchase_order_number',''),
      nullif(p_header->>'work_order_id','')::uuid, nullif(p_header->>'maintenance_record_id','')::uuid,
      nullif(p_header->>'vehicle_id','')::uuid, nullif(p_header->>'cost_centre',''),
      coalesce(nullif(p_header->>'currency',''), 'OMR'), coalesce(nullif(p_header->>'exchange_rate','')::numeric, 1),
      v_terms, nullif(p_header->>'terms_and_conditions',''), nullif(p_header->>'notes',''),
      nullif(p_header->>'attachment_path',''))
  returning id into v_id;

  perform public.fin_insert_lines(v_id, v_company, p_lines);

  if (select grand_total from public.invoices where id = v_id) <= 0 then
    raise exception 'Invoice total must be greater than zero';
  end if;
  if p_submit then perform public.fin_submit_invoice(v_id); end if;
  return v_id;
end $$;

-- Submit a Draft/Rejected invoice: posts it or raises an approval request. Returns the new approval status.
create or replace function public.submit_invoice(p_invoice uuid) returns text
language plpgsql security definer set search_path = public as $$
declare inv public.invoices;
begin
  select * into inv from public.invoices where id = p_invoice for update;
  if not found then raise exception 'Invoice not found'; end if;
  if not public.has_company_access(inv.company_id)
     or not (public.has_perm('invoices', 'create') or public.has_perm('invoices', 'edit')) then
    raise exception 'Permission denied';
  end if;
  if inv.is_credit_note then raise exception 'Credit notes are posted when they are created'; end if;
  -- 'Pending Approval' without an open request = raised by a system trigger (e.g. maintenance, Agent A)
  if inv.approval_status not in ('Draft','Rejected','Pending Approval') or inv.journal_entry_id is not null then
    raise exception 'Invoice is % and cannot be submitted', inv.approval_status;
  end if;
  if exists (select 1 from public.approval_requests
             where reference_type = 'Invoice' and reference_id = p_invoice and status = 'Pending') then
    raise exception 'Invoice is already awaiting approval; decide it in Approvals';
  end if;
  return public.fin_submit_invoice(p_invoice);
end $$;

-- Replace all lines of a Draft/Rejected invoice atomically.
create or replace function public.replace_invoice_lines(p_invoice uuid, p_lines jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare inv public.invoices;
begin
  select * into inv from public.invoices where id = p_invoice for update;
  if not found then raise exception 'Invoice not found'; end if;
  if not public.has_company_access(inv.company_id) or not public.has_perm('invoices', 'edit') then
    raise exception 'Permission denied';
  end if;
  if inv.is_credit_note or inv.journal_entry_id is not null or inv.approval_status not in ('Draft','Rejected') then
    raise exception 'Lines can only be changed on draft or rejected invoices';
  end if;
  delete from public.invoice_lines where invoice_id = p_invoice;
  perform public.fin_insert_lines(p_invoice, inv.company_id, p_lines);
  if (select grand_total from public.invoices where id = p_invoice) <= 0 then
    raise exception 'Invoice total must be greater than zero';
  end if;
end $$;

-- Copy an invoice (header + lines) as a new Draft dated today. Supplier bill reference is cleared.
create or replace function public.duplicate_invoice(p_invoice uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare inv public.invoices; v_id uuid;
begin
  select * into inv from public.invoices where id = p_invoice;
  if not found then raise exception 'Invoice not found'; end if;
  if not public.has_company_access(inv.company_id) or not public.has_perm('invoices', 'create') then
    raise exception 'Permission denied';
  end if;
  if inv.is_credit_note then raise exception 'Credit notes cannot be duplicated'; end if;

  insert into public.invoices (company_id, invoice_number, invoice_type, party_type, supplier_id, customer_id,
      party_snapshot, invoice_date, due_date, reference_number, purchase_order_number, work_order_id,
      maintenance_record_id, vehicle_id, cost_centre, currency, exchange_rate, payment_terms_days,
      terms_and_conditions, notes)
  values (inv.company_id, null, inv.invoice_type, inv.party_type, inv.supplier_id, inv.customer_id,
      inv.party_snapshot, current_date, current_date + inv.payment_terms_days,
      case when inv.invoice_type = 'Sales' then inv.reference_number end, inv.purchase_order_number,
      inv.work_order_id, inv.maintenance_record_id, inv.vehicle_id, inv.cost_centre, inv.currency, inv.exchange_rate,
      inv.payment_terms_days, inv.terms_and_conditions, 'Copy of ' || inv.invoice_number)
  returning id into v_id;

  insert into public.invoice_lines (invoice_id, line_no, item_code, description, quantity, unit, unit_price,
      discount_percentage, tax_rate_percentage, vehicle_id, expense_category, gl_account_code, cost_centre)
  select v_id, line_no, item_code, description, quantity, unit, unit_price, discount_percentage,
         tax_rate_percentage, vehicle_id, expense_category, gl_account_code, cost_centre
  from public.invoice_lines where invoice_id = p_invoice;
  return v_id;
end $$;

-- Issue a credit note against a posted invoice (full outstanding when p_amount is null) and post it.
-- The settlement trigger reduces the parent's outstanding; amounts above the outstanding are rejected.
create or replace function public.create_credit_note(p_invoice uuid, p_reason text, p_amount numeric default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare inv public.invoices; v_amount numeric; v_ratio numeric; v_id uuid; v_total numeric;
        v_ids uuid[]; v_up numeric[]; v_rate numeric[]; v_max int;
begin
  select * into inv from public.invoices where id = p_invoice for update;   -- serialize concurrent credit notes
  if not found then raise exception 'Invoice not found'; end if;
  if not public.has_company_access(inv.company_id) or not public.has_perm('invoices', 'create') then
    raise exception 'Permission denied';
  end if;
  if inv.is_credit_note then raise exception 'Cannot credit a credit note'; end if;
  if inv.approval_status <> 'Approved' or inv.journal_entry_id is null then
    raise exception 'Only approved (posted) invoices can be credited; cancel the draft instead';
  end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'A reason is required for a credit note'; end if;
  if inv.outstanding_amount <= 0.0005 then raise exception 'Invoice has no outstanding amount to credit'; end if;

  v_amount := round(coalesce(p_amount, inv.outstanding_amount), 3);
  if v_amount <= 0 then raise exception 'Credit amount must be greater than zero'; end if;
  if v_amount > inv.outstanding_amount + 0.0005 then
    raise exception 'Credit amount % exceeds outstanding %', v_amount, inv.outstanding_amount;
  end if;
  if not public.can_approve('invoice', v_amount) then
    raise exception 'Permission denied: credit notes of this amount need invoice approval authority';
  end if;

  insert into public.invoices (company_id, invoice_number, invoice_type, party_type, supplier_id, customer_id,
      party_snapshot, invoice_date, due_date, reference_number, purchase_order_number, vehicle_id, cost_centre,
      currency, exchange_rate, payment_terms_days, notes, is_credit_note, parent_invoice_id, payment_status)
  values (inv.company_id, null, inv.invoice_type, inv.party_type, inv.supplier_id, inv.customer_id,
      inv.party_snapshot, current_date, current_date, inv.invoice_number, inv.purchase_order_number, inv.vehicle_id,
      inv.cost_centre, inv.currency, inv.exchange_rate, 0,
      'Credit note against ' || inv.invoice_number || '. Reason: ' || trim(p_reason), true, inv.id, 'Paid')
  returning id into v_id;

  v_ratio := v_amount / inv.grand_total;
  if v_ratio >= 0.9999995 then
    -- full credit of an untouched invoice: exact copy of the lines
    insert into public.invoice_lines (invoice_id, line_no, item_code, description, quantity, unit, unit_price,
        discount_percentage, tax_rate_percentage, vehicle_id, expense_category, gl_account_code, cost_centre)
    select v_id, line_no, item_code, 'Credit: ' || description, quantity, unit, unit_price,
           discount_percentage, tax_rate_percentage, vehicle_id, expense_category, gl_account_code, cost_centre
    from public.invoice_lines where invoice_id = p_invoice;
  else
    -- partial credit: one line per parent line carrying its pro-rata share (same tax rate, so VAT is
    -- reversed pro rata). Net prices are floored, then trimmed so the total never exceeds the requested
    -- amount; any remaining baisa go on a zero-VAT rounding line so the credit equals the amount exactly.
    select array_agg(id order by line_no),
           array_agg(floor(line_total * v_ratio / (1 + tax_rate_percentage / 100) * 1000) / 1000 order by line_no),
           array_agg(tax_rate_percentage order by line_no)
      into v_ids, v_up, v_rate
      from public.invoice_lines where invoice_id = p_invoice;
    loop
      v_total := 0;
      for i in 1 .. coalesce(array_length(v_ids, 1), 0) loop
        v_total := v_total + round(v_up[i] * (1 + v_rate[i] / 100), 3);
      end loop;
      exit when v_total <= v_amount + 0.0005;
      v_max := 1;
      for i in 2 .. array_length(v_ids, 1) loop
        if v_up[i] > v_up[v_max] then v_max := i; end if;
      end loop;
      v_up[v_max] := v_up[v_max] - 0.001;
    end loop;
    for i in 1 .. coalesce(array_length(v_ids, 1), 0) loop
      if v_up[i] > 0 then
        insert into public.invoice_lines (invoice_id, line_no, item_code, description, quantity, unit, unit_price,
            discount_percentage, tax_rate_percentage, vehicle_id, expense_category, gl_account_code, cost_centre)
        select v_id, i, item_code, 'Credit (pro rata): ' || description, 1, unit, v_up[i], 0, v_rate[i],
               vehicle_id, expense_category, gl_account_code, cost_centre
        from public.invoice_lines where id = v_ids[i];
      end if;
    end loop;
    if v_amount - v_total >= 0.0005 then
      insert into public.invoice_lines (invoice_id, line_no, description, quantity, unit_price, tax_rate_percentage,
          gl_account_code, cost_centre)
      select v_id, coalesce(array_length(v_ids, 1), 0) + 1, 'Credit rounding adjustment', 1, round(v_amount - v_total, 3), 0,
             gl_account_code, cost_centre
      from public.invoice_lines where id = v_ids[1];
    end if;
  end if;

  select grand_total into v_total from public.invoices where id = v_id;
  if v_total <= 0 then raise exception 'Credit amount is too small'; end if;

  perform public.post_invoice(v_id);
  return v_id;
end $$;

-- Payments are insert-only through record_payment; this attaches the receipt/remittance file afterwards.
-- The path must live under the payment's own company (storage RLS: <company_id>/payments/...).
create or replace function public.set_payment_attachment(p_payment uuid, p_path text) returns void
language plpgsql security definer set search_path = public as $$
declare p public.payments;
begin
  select * into p from public.payments where id = p_payment for update;
  if not found then raise exception 'Payment not found'; end if;
  if not public.has_company_access(p.company_id) or not public.has_perm('payments', 'create') then
    raise exception 'Permission denied';
  end if;
  if p.attachment_path is not null then raise exception 'Payment already has an attachment'; end if;
  if p_path is null or p_path not like p.company_id::text || '/payments/%' then
    raise exception 'Attachment must be stored under this office''s payments folder';
  end if;
  update public.payments set attachment_path = p_path where id = p_payment;
end $$;

-- ---------------------------------------------------------------------
-- 4. Approval bridge: a decided Invoice approval request posts / rejects the invoice
-- ---------------------------------------------------------------------
create or replace function public.fin_invoice_approval_bridge() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.reference_type <> 'Invoice' or new.status = old.status then return null; end if;
  if new.status = 'Approved' then
    if exists (select 1 from public.invoices where id = new.reference_id and journal_entry_id is null
               and approval_status = 'Pending Approval') then
      perform public.post_invoice(new.reference_id);   -- re-checks can_approve for the approver
    end if;
  elsif new.status = 'Rejected' then
    update public.invoices set approval_status = 'Rejected'
    where id = new.reference_id and journal_entry_id is null and approval_status = 'Pending Approval';
  end if;
  return null;
end $$;

create trigger fin_invoice_approval_bridge after update of status on public.approval_requests
  for each row execute function public.fin_invoice_approval_bridge();

-- ---------------------------------------------------------------------
-- 5. Reconciliation: amounts, difference, variance and status are computed here (client values ignored)
-- ---------------------------------------------------------------------
create or replace function public.fin_reconciliation_compute() returns trigger
language plpgsql set search_path = public as $$
declare inv public.invoices; v_expected numeric; v_diff numeric;
begin
  select * into inv from public.invoices where id = new.invoice_id;
  if not found then raise exception 'Invoice not found'; end if;
  if inv.invoice_type <> 'Purchase' or inv.is_credit_note then
    raise exception 'Only supplier purchase invoices can be reconciled';
  end if;
  if inv.payment_status = 'Cancelled' then raise exception 'Cancelled invoices cannot be reconciled'; end if;
  new.company_id := inv.company_id;
  new.invoice_amount := inv.grand_total;
  if new.purchase_order_amount is null or new.purchase_order_amount <= 0 then
    raise exception 'Purchase order amount must be greater than zero';
  end if;

  v_expected := case when new.matching_type = '3-Way' then new.goods_received_amount else new.purchase_order_amount end;
  if v_expected is null then raise exception '3-way match needs the goods/service received amount'; end if;
  v_diff := round(inv.grand_total - v_expected, 3);
  new.difference_amount := v_diff;
  new.variance_percentage := case when v_expected > 0 then round(abs(v_diff) / v_expected * 100, 3)
                                  when v_diff = 0 then 0 else 100 end;
  new.status := case when abs(v_diff) < 0.0005 then 'Matched'
                     when v_expected > 0 and new.variance_percentage <= 5 then 'Partially Matched'
                     else 'Mismatch' end;
  new.reconciled_date := coalesce(new.reconciled_date, current_date);
  if tg_op = 'INSERT' then new.reconciled_by := auth.uid(); end if;
  return new;
end $$;

create trigger fin_reconciliation_compute before insert or update on public.reconciliations
  for each row execute function public.fin_reconciliation_compute();

-- ---------------------------------------------------------------------
-- 6. Party balances across every office the caller can see (suppliers/customers are group-level)
-- ---------------------------------------------------------------------
create view public.v_party_summary with (security_invoker = true) as
select 'Supplier'::public.party_type as party_type, s.id as party_id, s.opening_balance,
       coalesce(sum(i.grand_total) filter (where not i.is_credit_note), 0)        as total_invoiced,
       coalesce(sum(i.amount_paid) filter (where not i.is_credit_note), 0)        as total_paid,
       coalesce(sum(i.grand_total) filter (where i.is_credit_note), 0)            as total_credited,
       coalesce(sum(i.outstanding_amount) filter (where not i.is_credit_note), 0) as outstanding,
       count(i.id) filter (where not i.is_credit_note)                            as invoice_count,
       s.opening_balance + coalesce(sum(i.outstanding_amount) filter (where not i.is_credit_note), 0) as current_balance
from public.suppliers s
left join public.invoices i on i.supplier_id = s.id and i.payment_status <> 'Cancelled'
group by s.id
union all
select 'Customer'::public.party_type, c.id, c.opening_balance,
       coalesce(sum(i.grand_total) filter (where not i.is_credit_note), 0),
       coalesce(sum(i.amount_paid) filter (where not i.is_credit_note), 0),
       coalesce(sum(i.grand_total) filter (where i.is_credit_note), 0),
       coalesce(sum(i.outstanding_amount) filter (where not i.is_credit_note), 0),
       count(i.id) filter (where not i.is_credit_note),
       c.opening_balance + coalesce(sum(i.outstanding_amount) filter (where not i.is_credit_note), 0)
from public.customers c
left join public.invoices i on i.customer_id = c.id and i.payment_status <> 'Cancelled'
group by c.id;

-- ---------------------------------------------------------------------
-- 7. Grants
-- ---------------------------------------------------------------------
revoke execute on function public.fin_insert_lines(uuid, uuid, jsonb), public.fin_submit_invoice(uuid),
  public.fin_invoices_guard(), public.fin_invoice_lines_guard(), public.fin_payments_guard(),
  public.fin_invoice_approval_bridge(), public.fin_reconciliation_compute() from public, anon, authenticated;
grant execute on function
  public.create_invoice(jsonb, jsonb, boolean), public.submit_invoice(uuid),
  public.replace_invoice_lines(uuid, jsonb), public.duplicate_invoice(uuid),
  public.create_credit_note(uuid, text, numeric)
to authenticated;
revoke execute on function
  public.create_invoice(jsonb, jsonb, boolean), public.submit_invoice(uuid),
  public.replace_invoice_lines(uuid, jsonb), public.duplicate_invoice(uuid),
  public.create_credit_note(uuid, text, numeric)
from public, anon;
grant select on public.v_party_summary to authenticated;

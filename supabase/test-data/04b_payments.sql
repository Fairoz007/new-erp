-- =====================================================================
-- Test data phase 4/5 (part b): payments via record_payment() for posted
-- invoices 1401..2800 (by invoice date order). Older than 20 days: 78% settled in
-- full, 12% part-paid, 10% left open (feeds AR/AP aging). Remittance PDFs
-- attached to the first 100 payments per office (part a) via set_payment_attachment().
-- Part c also raises 40 credit notes and 300 reconciliations.
-- Run: npx supabase db query --linked -f supabase/test-data/04b_payments.sql
-- =====================================================================
do $gen$
declare
  v_admin uuid; r record; v_bank uuid; v_amt numeric; v_pay uuid; v_date date; n int := 0;
begin
  perform setseed(0.52);
  select id into v_admin from auth.users where email = 'superadmin@hakim.com';
  perform set_config('request.jwt.claim.sub', v_admin::text, false);
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, false);
  perform set_config('request.uid', v_admin::text, false);

  for r in select * from (
             select i.*, row_number() over (order by i.invoice_date, i.created_at, i.id) rn
             from public.invoices i
             where i.approval_status = 'Approved' and not i.is_credit_note) s
           where s.rn between 1401 and 2800 and s.amount_paid = 0
             and s.invoice_date < current_date - 20 and s.rn % 10 <> 0
           order by s.rn loop
    select id into v_bank from public.bank_accounts where company_id = r.company_id and account_type = 'Current'
      order by account_name limit 1;
    v_amt  := case when r.rn % 8 = 0 then round(r.outstanding_amount * 0.5, 3) else r.outstanding_amount end;
    v_date := least(r.invoice_date + 10 + (r.rn::int % 35), current_date);
    v_pay := public.record_payment(r.id, v_amt, v_date,
               (array['Bank Transfer','Bank Transfer','Cheque','Online'])[1 + (r.rn::int % 4)], v_bank,
               'TXN-' || lpad(r.rn::text, 6, '0'), case when r.rn % 4 = 2 then 'CHQ-' || (500000 + r.rn) end, null);
  end loop;

  if 'b' = 'c' and not exists (select 1 from public.invoices where is_credit_note) then
    -- 40 credit notes against settled-or-open posted sales and purchase invoices
    for r in select id from public.invoices where approval_status = 'Approved' and not is_credit_note and outstanding_amount > 0
             order by invoice_date, id offset 50 limit 40 loop
      perform public.create_credit_note(r.id, 'Price adjustment agreed with party', null);
    end loop;
    -- 300 reconciliations (2-way / 3-way) on purchase bills
    insert into public.reconciliations (company_id, reconciliation_number, invoice_id, matching_type, purchase_order_number,
        purchase_order_amount, goods_received_amount, invoice_amount, difference_amount, variance_percentage, status,
        discrepancy_reason, reconciled_date)
    select i.company_id, null, i.id, case when s.rn % 3 = 0 then '3-Way' else '2-Way' end, i.purchase_order_number,
           case when s.rn % 11 = 0 then round(i.grand_total * 0.95, 3) else i.grand_total end,
           case when s.rn % 3 = 0 then i.grand_total end, i.grand_total, 0, 0, 'Pending Review',
           case when s.rn % 11 = 0 then 'Invoice above PO value' end, i.invoice_date + 3
    from (select id, row_number() over (order by invoice_date, id) rn from public.invoices
          where invoice_type = 'Purchase' and not is_credit_note and approval_status = 'Approved') s
    join public.invoices i on i.id = s.id
    where s.rn <= 300;
  end if;
end $gen$;

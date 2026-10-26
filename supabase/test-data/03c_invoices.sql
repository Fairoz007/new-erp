-- =====================================================================
-- Test data phase 3/5 (part c): invoices 2601..3800 of 3,800 via create_invoice().
-- Purchase bills (58%) and sales invoices (42%), 1-4 lines, posted to the GL
-- immediately (Super Admin can approve). Bills 1-300 carry a scanned PDF.
-- Skips itself when invoice 3800 already exists.
-- Run: npx supabase db query --linked -f supabase/test-data/03c_invoices.sql
-- =====================================================================
do $gen$
declare
  v_admin uuid; i int; k int; nl int; v_comp uuid; v_date date; v_type text; v_party uuid; v_lines jsonb; v_inv uuid;
  v_veh uuid; v_sup uuid[]; v_cus uuid[]; c_ho uuid; c_dq uuid;
  p_items text[] := array['Brake pads & discs','Engine oil 5W-30 (drum)','Tyres 265/65R17','Air filter set','Battery 100Ah',
                          'Labour - mechanical','AC gas recharge','Body repair & paint','Diagnostic service','Suspension bushes'];
  p_accts text[] := array['5000','5025','5020','5000','5000','5000','5000','5000','5000','5000'];
  s_items text[] := array['Crew transport - monthly contract','Heavy haulage trip','Vehicle rental (daily)','Shuttle service',
                          'Logistics support - project','Equipment hire with operator'];
  s_accts text[] := array['4020','4010','4020','4020','4010','4010'];
begin
  if exists (select 1 from public.invoices where notes = 'TD-INV-3800') then
    raise notice 'Phase 3c skipped: already loaded'; return;
  end if;
  perform setseed(0.43);
  select id into v_admin from auth.users where email = 'superadmin@hakim.com';
  perform set_config('request.jwt.claim.sub', v_admin::text, false);
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, false);
  perform set_config('request.uid', v_admin::text, false);
  select id into c_ho from public.companies where legacy_id = 'comp-1';
  select id into c_dq from public.companies where legacy_id = 'comp-2';
  select array_agg(id order by supplier_code) into v_sup from public.suppliers;
  select array_agg(id order by customer_code) into v_cus from public.customers;

  for i in 2601..3800 loop
    continue when exists (select 1 from public.invoices where notes = 'TD-INV-' || i);
    v_comp := case when i % 10 < 7 then c_ho else c_dq end;
    v_date := date '2025-11-01' + ((i * 359) / 3800);
    v_type := case when i % 100 < 58 then 'Purchase' else 'Sales' end;
    select id into v_veh from public.vehicles where company_id = v_comp order by vehicle_code
      offset (i % (case when v_comp = c_ho then 280 else 120 end)) limit 1;
    nl := 1 + (i % 4);
    v_lines := '[]'::jsonb;
    for k in 1..nl loop
      if v_type = 'Purchase' then
        v_lines := v_lines || jsonb_build_array(jsonb_build_object(
          'description', p_items[1 + ((i + k) % 10)], 'quantity', 1 + ((i + k) % 4), 'unit', 'pcs',
          'unit_price', round((12 + random()::numeric * 180)::numeric, 3), 'discount_percentage', case when k = 2 then 5 else 0 end,
          'tax_rate_percentage', 5, 'gl_account_code', p_accts[1 + ((i + k) % 10)], 'vehicle_id', v_veh,
          'expense_category', 'Maintenance', 'cost_centre', 'Fleet'));
      else
        v_lines := v_lines || jsonb_build_array(jsonb_build_object(
          'description', s_items[1 + ((i + k) % 6)], 'quantity', 1 + ((i + k) % 3), 'unit', 'job',
          'unit_price', round((150 + random()::numeric * 2400)::numeric, 3), 'discount_percentage', 0,
          'tax_rate_percentage', 5, 'gl_account_code', s_accts[1 + ((i + k) % 6)], 'vehicle_id', v_veh,
          'cost_centre', 'Operations'));
      end if;
    end loop;
    v_inv := public.create_invoice(jsonb_build_object(
        'company_id', v_comp, 'invoice_type', v_type,
        'supplier_id', case when v_type = 'Purchase' then v_sup[1 + (i % 60)] end,
        'customer_id', case when v_type = 'Sales' then v_cus[1 + (i % 80)] end,
        'invoice_date', v_date, 'vehicle_id', v_veh,
        'reference_number', case when v_type = 'Purchase' then 'SB-' || lpad(i::text, 5, '0') end,
        'purchase_order_number', case when v_type = 'Purchase' then 'PO-' || lpad(i::text, 5, '0') end,
        'attachment_path', case when v_type = 'Purchase' and i <= 520 then v_comp || '/invoices/bill-' || lpad(i::text, 4, '0') || '.pdf' end,
        'notes', 'TD-INV-' || i), v_lines, true);
  end loop;
end $gen$;

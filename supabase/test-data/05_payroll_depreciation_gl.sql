-- =====================================================================
-- Test data phase 5/5: 12 months of payroll (process_payroll) and depreciation
-- (run_depreciation) per office, monthly accruals/insurance/loan journals, and
-- expiry/overdue notifications. Each month is skipped if it already exists.
-- Run: npx supabase db query --linked -f supabase/test-data/05_payroll_depreciation_gl.sql
-- =====================================================================
do $gen$
declare
  v_admin uuid; c record; m date; v_bank uuid;
begin
  select id into v_admin from auth.users where email = 'superadmin@hakim.com';
  perform set_config('request.jwt.claim.sub', v_admin::text, false);
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, false);
  perform set_config('request.uid', v_admin::text, false);

  for c in select id from public.companies order by legacy_id loop
    select id into v_bank from public.bank_accounts where company_id = c.id and account_type = 'Current'
      order by account_name desc limit 1;
    for m in select generate_series(date '2025-11-01', date_trunc('month', current_date)::date - 1, interval '1 month')::date loop
      if not exists (select 1 from public.payroll_runs where company_id = c.id and year = extract(year from m) and month = extract(month from m)) then
        perform public.process_payroll(c.id, extract(year from m)::int, extract(month from m)::int,
                                       (m + interval '1 month' - interval '1 day')::date, v_bank, true);
      end if;
      if not exists (select 1 from public.depreciation_runs where company_id = c.id and period = m) then
        perform public.run_depreciation(c.id, m, 'Monthly straight-line depreciation', true);
      end if;
      if not exists (select 1 from public.journal_entries where company_id = c.id and reference = 'ACCR-' || to_char(m, 'YYYYMM')) then
        perform public.post_journal_entry(c.id, (m + interval '1 month' - interval '1 day')::date, 'Monthly insurance & utilities accrual',
          jsonb_build_array(jsonb_build_object('account_code','5030','debit', 1850),
                            jsonb_build_object('account_code','5090','debit', 420),
                            jsonb_build_object('account_code','2030','credit', 2270)),
          'ACCR-' || to_char(m, 'YYYYMM'), 'Manual');
        perform public.post_journal_entry(c.id, (m + interval '1 month' - interval '1 day')::date, 'Vehicle loan instalment',
          jsonb_build_array(jsonb_build_object('account_code','2510','debit', 3200),
                            jsonb_build_object('account_code','5090','debit', 280),
                            jsonb_build_object('account_code','1020','credit', 3480)),
          'LOAN-' || to_char(m, 'YYYYMM'), 'Manual');
      end if;
    end loop;
  end loop;

  perform public.refresh_expiry_notifications(45);
end $gen$;

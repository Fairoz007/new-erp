-- Read-only checks after loading test data.
-- Run: npx supabase db query --linked -f supabase/test-data/verify.sql
select 'vehicles' k, count(*)::text v from vehicles
union all select 'tyres', count(*)::text from tyres
union all select 'oil_changes', count(*)::text from oil_changes
union all select 'maintenance_records', count(*)::text from maintenance_records
union all select 'work_orders', count(*)::text from work_orders
union all select 'approval_requests', count(*)::text from approval_requests
union all select 'accidents', count(*)::text from accidents
union all select 'expenses', count(*)::text from expenses
union all select 'documents', count(*)::text from documents
union all select 'invoices', count(*)::text from invoices
union all select 'invoice_lines', count(*)::text from invoice_lines
union all select 'credit_notes', count(*)::text from invoices where is_credit_note
union all select 'payments', count(*)::text from payments
union all select 'reconciliations', count(*)::text from reconciliations
union all select 'journal_entries', count(*)::text from journal_entries
union all select 'employees', count(*)::text from employees
union all select 'payroll_runs', count(*)::text from payroll_runs
union all select 'depreciation_runs', count(*)::text from depreciation_runs
union all select 'notifications', count(*)::text from notifications
union all select 'audit_logs', count(*)::text from audit_logs
union all select 'TOTAL rows (public)', sum(n_live_tup)::text from pg_stat_user_tables where schemaname = 'public'
union all select 'unbalanced journal entries', count(*)::text from (select entry_id from journal_lines group by entry_id having sum(debit) <> sum(credit)) x
union all select 'negative outstanding invoices', count(*)::text from invoices where outstanding_amount < -0.0005
union all select 'AP ledger vs open bills (diff)', string_agg(c.code || '=' || (
    coalesce((select balance from v_account_balances where company_id = c.id and code = '2010'), 0) -
    coalesce((select sum(outstanding_amount) from invoices where company_id = c.id and invoice_type = 'Purchase' and approval_status = 'Approved' and not is_credit_note), 0))::text, ' ') from companies c
union all select 'AR ledger vs open sales (diff)', string_agg(c.code || '=' || (
    coalesce((select balance from v_account_balances where company_id = c.id and code = '1100'), 0) -
    coalesce((select sum(outstanding_amount) from invoices where company_id = c.id and invoice_type = 'Sales' and approval_status = 'Approved' and not is_credit_note), 0))::text, ' ') from companies c
union all select 'invoice date range', min(invoice_date)::text || ' .. ' || max(invoice_date)::text from invoices
union all select 'vehicle photos referenced', count(distinct photo_url)::text from vehicles
union all select 'files expected in storage', (select count(*) from documents where storage_path is not null)
    + (select count(*) from expenses where attachment_path is not null) + (select count(*) from invoices where attachment_path is not null)
    + (select count(*) from payments where attachment_path is not null) || ''
union all select 'storage objects (documents/media)', (select count(*) from storage.objects where bucket_id = 'documents') || ' / ' || (select count(*) from storage.objects where bucket_id = 'media');

-- =====================================================================
-- FLEETX ERP — COMPLETE DATA WIPE (Run in Supabase SQL Editor)
-- =====================================================================
-- KEEPS:  auth.users, profiles, companies, company_members
--         (all user logins, admin, and the 3 office entities)
--
-- REMOVES: EVERYTHING else — vehicles, accounts, bank accounts,
--          invoices, payments, journal entries, P&L data, suppliers,
--          customers, employees, work orders, expenses, assets, etc.
-- =====================================================================

-- Disable triggers temporarily to avoid cascading conflicts
SET session_replication_role = 'replica';

-- 1. FINANCIAL LEDGER (read-only tables that clients can't touch)
DELETE FROM public.reconciliations;
DELETE FROM public.payments;
DELETE FROM public.journal_lines;
DELETE FROM public.journal_entries;

-- 2. INVOICES & LINES
DELETE FROM public.invoice_lines;
DELETE FROM public.invoices;

-- 3. APPROVAL WORKFLOW
DELETE FROM public.approval_actions;
DELETE FROM public.approval_requests;

-- 4. NOTIFICATIONS
DELETE FROM public.notification_reads;
DELETE FROM public.notifications;

-- 5. DEPRECIATION & FIXED ASSETS
DELETE FROM public.depreciation_run_items;
DELETE FROM public.depreciation_runs;
DELETE FROM public.fixed_assets;

-- 6. PAYROLL & HR
DELETE FROM public.payroll_items;
DELETE FROM public.payroll_runs;
DELETE FROM public.employees;

-- 7. FLEET — children first
DELETE FROM public.tyre_events;
DELETE FROM public.oil_changes;
DELETE FROM public.tyres;
DELETE FROM public.maintenance_records;
DELETE FROM public.vehicle_timeline;
DELETE FROM public.expenses;
DELETE FROM public.accidents;
DELETE FROM public.work_orders;
DELETE FROM public.vehicles;

-- 8. MASTER DATA
DELETE FROM public.customers;
DELETE FROM public.suppliers;

-- 9. ACCOUNTING (Chart of Accounts & Bank Accounts)
DELETE FROM public.accounts;
DELETE FROM public.bank_accounts;

-- 10. AUDIT LOGS & DOCUMENTS
DELETE FROM public.audit_logs;
DELETE FROM public.documents;

-- Re-enable triggers
SET session_replication_role = 'origin';

-- Verification: count remaining rows in key tables
SELECT 'profiles' AS tbl, count(*) AS rows FROM public.profiles
UNION ALL SELECT 'companies', count(*) FROM public.companies
UNION ALL SELECT 'company_members', count(*) FROM public.company_members
UNION ALL SELECT 'vehicles', count(*) FROM public.vehicles
UNION ALL SELECT 'accounts', count(*) FROM public.accounts
UNION ALL SELECT 'bank_accounts', count(*) FROM public.bank_accounts
UNION ALL SELECT 'invoices', count(*) FROM public.invoices
UNION ALL SELECT 'journal_entries', count(*) FROM public.journal_entries
UNION ALL SELECT 'payments', count(*) FROM public.payments
UNION ALL SELECT 'suppliers', count(*) FROM public.suppliers
UNION ALL SELECT 'customers', count(*) FROM public.customers
UNION ALL SELECT 'employees', count(*) FROM public.employees
UNION ALL SELECT 'work_orders', count(*) FROM public.work_orders
UNION ALL SELECT 'expenses', count(*) FROM public.expenses
UNION ALL SELECT 'notifications', count(*) FROM public.notifications
UNION ALL SELECT 'audit_logs', count(*) FROM public.audit_logs
ORDER BY tbl;

-- Audit trail and reports were open to every role. Restrict them to admins, finance and management.
delete from public.role_permissions
where module in ('audit-logs', 'reports')
  and role not in ('Super Admin', 'Company Admin', 'Finance Manager', 'Accountant', 'Management');

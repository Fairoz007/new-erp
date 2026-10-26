-- The audit log page reads the newest 1000 rows across all offices (order by occurred_at desc).
-- The existing index starts with company_id, so that query sorted all rows and hit the timeout.
create index if not exists audit_logs_occurred_at_idx on public.audit_logs (occurred_at desc);

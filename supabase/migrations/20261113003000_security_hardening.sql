-- Phase 6: security hardening found by supabase/tests/security_audit.test.mjs.
-- 1. budget_total() ran as owner, so any signed-in user could read the expense total of any
--    office's budget by id. It now runs as the caller (RLS on budget_lines applies). Callers that
--    are themselves security definer (submit_budget, budget alerts) are unaffected.
alter function public.budget_total(uuid) security invoker;

-- 2. preview_doc_number() showed the next document number of any office. Now only for offices the
--    caller can access (server-side callers, auth.uid() null, are unchanged).
create or replace function public.preview_doc_number(p_type text, p_company uuid default null) returns text
language sql stable security definer set search_path = public as $$
  select case when p_company is null or auth.uid() is null or public.has_company_access(p_company) then
    public._fmt_doc_number(public.doc_prefix(p_type, p_company, current_date),
           coalesce((select last_value from public.doc_sequences
                     where company_id = p_company and prefix = public.doc_prefix(p_type, p_company, current_date)), 0) + 1,
           public.doc_pad(p_type)) end
$$;
revoke all on function public.preview_doc_number(text, uuid) from public, anon;
grant execute on function public.preview_doc_number(text, uuid) to authenticated;

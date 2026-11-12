-- Fixes for the Supabase advisor warnings raised after the push of this release (2026-11-12).
-- No behaviour change.
--
-- 1. function_search_path_mutable: four helper / trigger functions did not pin search_path.
--    They are not SECURITY DEFINER, but a fixed search_path keeps them from resolving names
--    through a caller's schema.
alter function public._journal_total(jsonb) set search_path = public;
alter function public.storage_entity(text) set search_path = public;
alter function public.storage_module(text) set search_path = public;
alter function public.trg_version_check() set search_path = public;

-- 2. auth_rls_initplan: evaluate auth.uid() once per statement, not once per row.
drop policy if exists client_errors_insert on public.client_errors;
create policy client_errors_insert on public.client_errors for insert to authenticated
  with check (user_id = (select auth.uid()));

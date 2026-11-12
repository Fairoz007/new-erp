-- =====================================================================
-- Phase 9: Roles and permission customization (the role tables, matrix and per-office roles were
-- added in 20261112000100_roles_permissions.sql; this finishes the job)
--   1. Approval rules name roles by id (custom roles included) instead of the legacy enum.
--      decide_approval / approvers_for_request use the role ids. Rules are edited through
--      save_approval_rule / delete_approval_rule (super admin or settings:edit).
--   2. Financial statements as their own permission: a role with financial-statements:view but
--      not accounting:view (the Sponsor) gets account totals for the statements, never the
--      journal detail. Cash flow and budget vs actual accept the same right.
--   3. Role guard: system roles and roles still assigned to users or office memberships cannot be
--      deleted; the super admin and system flags cannot change.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Approval rules by role id
-- ---------------------------------------------------------------------
alter table public.approval_rules add column if not exists required_role_ids uuid[] not null default '{}';
alter table public.approval_requests add column if not exists required_role_ids uuid[] not null default '{}';

create or replace function public._legacy_roles_to_ids(p_roles public.user_role[]) returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(r.id order by array_position(p_roles, r.legacy_role)), '{}')
    from public.roles r where r.legacy_role = any(coalesce(p_roles, '{}'))
$$;
revoke all on function public._legacy_roles_to_ids(public.user_role[]) from public, anon, authenticated;

update public.approval_rules set required_role_ids = public._legacy_roles_to_ids(required_roles)
 where cardinality(required_role_ids) = 0 and cardinality(required_roles) > 0;
update public.approval_requests set required_role_ids = public._legacy_roles_to_ids(required_roles)
 where cardinality(required_role_ids) = 0 and cardinality(required_roles) > 0;

-- New requests take the role ids of the rule that applies (the code that creates them copies only
-- the legacy column); a rule naming custom roles also sets the number of levels.
create or replace function public.trg_approval_request_roles() returns trigger
language plpgsql security definer set search_path = public as $$
declare ru public.approval_rules; v_module text;
begin
  if cardinality(new.required_role_ids) = 0 then
    v_module := case new.reference_type when 'WorkOrder' then 'maintenance' when 'Invoice' then 'invoice' when 'Expense' then 'expense' end;
    select * into ru from public.approval_rules
     where module = v_module and active and threshold_amount <= coalesce(new.amount, 0)
     order by threshold_amount desc limit 1;
    if found and cardinality(ru.required_role_ids) > 0 then
      new.required_role_ids := ru.required_role_ids;
      if new.reference_type = 'WorkOrder' then new.total_levels := greatest(1, cardinality(ru.required_role_ids)); end if;
    else
      new.required_role_ids := public._legacy_roles_to_ids(new.required_roles);
    end if;
  end if;
  return new;
end $$;
revoke all on function public.trg_approval_request_roles() from public, anon, authenticated;
drop trigger if exists approval_requests_roles on public.approval_requests;
create trigger approval_requests_roles before insert on public.approval_requests
  for each row execute function public.trg_approval_request_roles();

-- decide_approval and approvers_for_request: role ids instead of legacy role names
do $$
declare def text; nd text;
begin
  def := pg_get_functiondef('public.decide_approval(uuid, text, text)'::regprocedure);
  nd := replace(def,
    '(cardinality(r.required_roles) > 0 and not public.is_super_admin() and not (v_legacy = any(r.required_roles)))',
    '(cardinality(r.required_role_ids) > 0 and not public.is_super_admin() and not (v_role = any(r.required_role_ids)))');
  if nd = def then raise exception 'decide_approval: required_roles check not found'; end if;
  execute nd;

  def := pg_get_functiondef('public.approvers_for_request(public.approval_requests)'::regprocedure);
  nd := replace(def,
    '(select legacy_role from public.roles where id = coalesce(m.role_id, p.role_id)) = any (r.required_roles)',
    'coalesce(m.role_id, p.role_id) = any (r.required_role_ids)');
  nd := replace(nd, 'cardinality(r.required_roles) = 0', 'cardinality(r.required_role_ids) = 0');
  if nd = def then raise exception 'approvers_for_request: required_roles check not found'; end if;
  execute nd;
end $$;

-- Rules are written through RPCs (the old settings:edit table policy stays for reads by admins)
create or replace function public.save_approval_rule(p_id uuid, p_module text, p_threshold numeric, p_role_ids uuid[],
  p_description text default null, p_active boolean default true) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_legacy public.user_role[];
begin
  if not (public.is_super_admin() or public.has_perm('settings', 'edit')) then raise exception 'Permission denied' using errcode = '42501'; end if;
  if p_module not in ('maintenance', 'invoice') then raise exception 'Approval rules apply to work orders (maintenance) and invoices'; end if;
  if p_threshold is null or p_threshold < 0 then raise exception 'The threshold cannot be negative'; end if;
  if exists (select 1 from unnest(coalesce(p_role_ids, '{}')) x where not exists (select 1 from public.roles where id = x)) then
    raise exception 'Unknown role';
  end if;
  select coalesce(array_agg(r.legacy_role order by array_position(p_role_ids, r.id)) filter (where r.legacy_role is not null), '{}')
    into v_legacy from public.roles r where r.id = any(coalesce(p_role_ids, '{}'));
  if p_id is null then
    insert into public.approval_rules (module, threshold_amount, required_roles, required_role_ids, description, active)
    values (p_module, round(p_threshold, 3), v_legacy, coalesce(p_role_ids, '{}'), nullif(btrim(coalesce(p_description, '')), ''), coalesce(p_active, true))
    returning id into v_id;
  else
    update public.approval_rules set module = p_module, threshold_amount = round(p_threshold, 3), required_roles = v_legacy,
           required_role_ids = coalesce(p_role_ids, '{}'), description = nullif(btrim(coalesce(p_description, '')), ''), active = coalesce(p_active, true)
     where id = p_id returning id into v_id;
    if v_id is null then raise exception 'Approval rule not found'; end if;
  end if;
  return v_id;
end $$;
create or replace function public.delete_approval_rule(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_super_admin() or public.has_perm('settings', 'edit')) then raise exception 'Permission denied' using errcode = '42501'; end if;
  delete from public.approval_rules where id = p_id;
end $$;
revoke execute on function public.save_approval_rule(uuid, text, numeric, uuid[], text, boolean), public.delete_approval_rule(uuid) from anon, public;
grant execute on function public.save_approval_rule(uuid, text, numeric, uuid[], text, boolean), public.delete_approval_rule(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 2. Financial statements without journal detail
-- ---------------------------------------------------------------------
-- Offices where the caller may see statements but not the ledger itself
create or replace function public.statement_only_company_ids() returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(x), '{}') from unnest(public.perm_company_ids('financial-statements', 'view')) x
   where not x = any(public.perm_company_ids('accounting', 'view'))
$$;
revoke all on function public.statement_only_company_ids() from public, anon;
grant execute on function public.statement_only_company_ids() to authenticated;

create or replace function public.statement_accounts()
returns table (company_id uuid, code text, name text, category text, subcategory text, currency text, description text,
               is_system boolean, opening_balance numeric, balance numeric, total_debit numeric, total_credit numeric)
language sql stable security definer set search_path = public as $$
  select a.company_id, a.code, a.name, a.category::text, a.subcategory, a.currency, a.description, a.is_system, a.opening_balance,
         a.opening_balance + case when a.category in ('Asset', 'Expense') then coalesce(sum(l.debit - l.credit), 0)
                                  else coalesce(sum(l.credit - l.debit), 0) end,
         coalesce(sum(l.debit), 0), coalesce(sum(l.credit), 0)
    from public.accounts a
    left join (select l.* from public.journal_lines l join public.journal_entries e on e.id = l.entry_id and e.status = 'Posted') l
           on l.company_id = a.company_id and l.account_code = a.code
   where a.company_id = any(public.statement_only_company_ids())
   group by a.company_id, a.code
$$;

-- Posted movements per office, day and account (enough for trial balance, P&L and balance sheet
-- over any date range; no descriptions, parties or entry numbers)
create or replace function public.statement_daily_totals()
returns table (company_id uuid, date date, account_code text, debit numeric, credit numeric)
language sql stable security definer set search_path = public as $$
  select e.company_id, e.date, l.account_code, sum(l.debit), sum(l.credit)
    from public.journal_entries e join public.journal_lines l on l.entry_id = e.id
   where e.status = 'Posted' and e.company_id = any(public.statement_only_company_ids())
   group by e.company_id, e.date, l.account_code
$$;
revoke execute on function public.statement_accounts(), public.statement_daily_totals() from anon, public;
grant execute on function public.statement_accounts(), public.statement_daily_totals() to authenticated;

do $$
declare f text; def text; nd text;
begin
  foreach f in array array['public.cash_flow_statement(uuid, date, date)', 'public.budget_vs_actual(uuid, integer)'] loop
    def := pg_get_functiondef(f::regprocedure);
    nd := replace(def, 'public.can_in(p_company, ''accounting'', ''view'')',
                       '(public.can_in(p_company, ''accounting'', ''view'') or public.can_in(p_company, ''financial-statements'', ''view''))');
    if nd = def then raise exception '% has no accounting:view check', f; end if;
    execute nd;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 3. Role deletion and renaming guards
-- ---------------------------------------------------------------------
create or replace function public.trg_role_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.is_system then raise exception 'System roles cannot be deleted'; end if;
    if exists (select 1 from public.profiles where role_id = old.id) or exists (select 1 from public.company_members where role_id = old.id) then
      raise exception 'Role "%" is still assigned to users; reassign them first', old.name;
    end if;
    return old;
  end if;
  if new.is_super is distinct from old.is_super or (old.is_system and new.is_system is distinct from old.is_system) then
    raise exception 'The super admin and system flags of a role cannot change';
  end if;
  return new;
end $$;
revoke all on function public.trg_role_guard() from public, anon, authenticated;
drop trigger if exists roles_guard on public.roles;
create trigger roles_guard before update or delete on public.roles for each row execute function public.trg_role_guard();

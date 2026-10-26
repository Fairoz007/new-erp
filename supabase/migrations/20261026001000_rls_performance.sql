-- RLS performance. Every policy called the SECURITY DEFINER helpers once PER ROW, and each call runs
-- its own sub-queries (profiles, company_members, role_permissions). On a year of data a single
-- list query (1000 rows) took 8+ seconds and hit the statement timeout.
--
-- Fix: the per-request answers (role, permission, set of offices) are computed ONCE per statement
-- by wrapping them in a scalar sub-select, which Postgres plans as an InitPlan.
--   has_perm('x','view')           -> (select has_perm('x','view'))
--   is_super_admin()               -> (select is_super_admin())
--   has_company_access(company_id) -> company_id = any((select my_company_ids()))
-- Policies are rewritten in place (alter policy), so the access rules themselves do not change.

create or replace function public.my_company_ids() returns uuid[]
language sql stable security definer set search_path = public as $$
  select case
    when public.is_super_admin() then coalesce((select array_agg(c.id) from public.companies c), '{}'::uuid[])
    else coalesce((select array_agg(m.company_id)
                   from public.company_members m
                   join public.profiles p on p.id = m.user_id and p.status = 'active'
                   where m.user_id = auth.uid()), '{}'::uuid[])
  end
$$;
revoke execute on function public.my_company_ids() from anon, public;
grant execute on function public.my_company_ids() to authenticated;

create index if not exists company_members_user_company_idx on public.company_members (user_id, company_id);
create index if not exists role_permissions_lookup_idx on public.role_permissions (role, module, action);

do $$
declare
  pol record;
  new_qual text;
  new_check text;
  stmt text;

  -- rewrite one expression; leave it alone when it was already rewritten
  rewrite text;
begin
  for pol in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and (coalesce(qual, '') ~* '(has_perm|has_company_access|is_super_admin)\('
        or coalesce(with_check, '') ~* '(has_perm|has_company_access|is_super_admin)\(')
  loop
    new_qual := pol.qual;
    new_check := pol.with_check;

    if new_qual is not null and new_qual !~* 'my_company_ids|select\s+(public\.)?(has_perm|is_super_admin)' then
      new_qual := regexp_replace(new_qual, '(?:public\.)?has_company_access\(([A-Za-z_][A-Za-z0-9_\.]*)\)', '(\1 = any(((select public.my_company_ids())::uuid[])))', 'gi');
      new_qual := regexp_replace(new_qual, '(?:public\.)?has_perm\(([^()]*)\)', '(select public.has_perm(\1))', 'gi');
      new_qual := regexp_replace(new_qual, '(?:public\.)?is_super_admin\(\)', '(select public.is_super_admin())', 'gi');
    end if;
    if new_check is not null and new_check !~* 'my_company_ids|select\s+(public\.)?(has_perm|is_super_admin)' then
      new_check := regexp_replace(new_check, '(?:public\.)?has_company_access\(([A-Za-z_][A-Za-z0-9_\.]*)\)', '(\1 = any(((select public.my_company_ids())::uuid[])))', 'gi');
      new_check := regexp_replace(new_check, '(?:public\.)?has_perm\(([^()]*)\)', '(select public.has_perm(\1))', 'gi');
      new_check := regexp_replace(new_check, '(?:public\.)?is_super_admin\(\)', '(select public.is_super_admin())', 'gi');
    end if;

    if new_qual is not distinct from pol.qual and new_check is not distinct from pol.with_check then
      continue;
    end if;

    stmt := format('alter policy %I on %I.%I', pol.policyname, pol.schemaname, pol.tablename);
    if new_qual is not null then stmt := stmt || ' using (' || new_qual || ')'; end if;
    if new_check is not null then stmt := stmt || ' with check (' || new_check || ')'; end if;
    execute stmt;
  end loop;
end $$;

analyze;

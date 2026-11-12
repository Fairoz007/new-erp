-- =====================================================================
-- Data-driven roles and per-office role assignment (brief: Phase 9, built first because the
-- Setup Wizard's roles step depends on it). Additive; existing assignments are migrated.
--
--  * roles            : one row per role. System roles cannot be deleted; exactly one role is
--                       is_super (Super Admin). legacy_role links the old user_role enum value.
--  * role_grants      : module x action matrix (replaces the role_permissions table).
--  * role_approval_limits : approval thresholds per role and module (replaces approval_limits).
--  * profiles.role_id : the user's organization-level role. profiles.all_offices = the user
--                       works at organization level and sees every office (the header's
--                       "All offices" option).
--  * company_members.role_id : optional office-specific role. A user can be Finance Manager in
--                       office A and Viewer in office B. Null = the profile role.
--  * Helpers: perm_company_ids(module, action) = offices where the caller holds the permission.
--    RLS policies use `company_id = any((select perm_company_ids(m, a)))` (one InitPlan per
--    statement), and every RPC uses can_in(office, module, action). The UI reads the same
--    tables, so UI and server agree.
--  * role_permissions and approval_limits survive as read-only compatibility views.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------
create table if not exists public.roles (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (btrim(name) <> '' and length(name) <= 60),
  description  text,
  is_system    boolean not null default false,
  is_super     boolean not null default false,
  legacy_role  public.user_role unique,
  sort_order   integer not null default 100,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create unique index if not exists roles_name_ci on public.roles (lower(btrim(name)));
create unique index if not exists roles_single_super on public.roles ((true)) where is_super;

create table if not exists public.role_grants (
  role_id  uuid not null references public.roles(id) on delete cascade,
  module   text not null check (module ~ '^[a-z][a-z-]*$'),
  action   public.permission_action not null,
  primary key (role_id, module, action)
);
create index if not exists role_grants_lookup on public.role_grants (module, action, role_id);

create table if not exists public.role_approval_limits (
  role_id     uuid not null references public.roles(id) on delete cascade,
  module      text not null check (module in ('maintenance','invoice','expense','payment','payroll','leave','budget','party','journal')),
  max_amount  numeric(14,3) check (max_amount is null or max_amount >= 0),   -- null = unlimited
  primary key (role_id, module)
);

alter table public.profiles add column if not exists role_id uuid references public.roles(id) on delete restrict;
alter table public.profiles add column if not exists all_offices boolean not null default false;
alter table public.company_members add column if not exists role_id uuid references public.roles(id) on delete restrict;
create index if not exists profiles_role_idx on public.profiles (role_id);
create index if not exists company_members_role_idx on public.company_members (role_id);

-- Approver / audit role names for custom roles (the enum columns cannot hold them)
alter table public.approval_actions alter column approver_role drop not null;
alter table public.approval_actions add column if not exists approver_role_name text;
alter table public.audit_logs add column if not exists user_role_name text;

-- ---------------------------------------------------------------------
-- 2. Seed roles: the legacy enum roles plus HR Manager and Sponsor
-- ---------------------------------------------------------------------
insert into public.roles (name, description, is_system, is_super, legacy_role, sort_order) values
  ('Super Admin', 'Full access to every office and setting. Runs the Setup Wizard.', true, true, 'Super Admin', 10),
  ('Admin', 'Administers offices, users and master data. Cannot grant Super Admin or edit role definitions.', true, false, 'Company Admin', 20),
  ('Finance Manager', 'Owns finance: approves invoices, payments, expenses and payroll above the accountant limit; closes periods.', true, false, 'Finance Manager', 30),
  ('Accountant', 'Prepares invoices, bills, payments, expenses and journals. Approves only small amounts.', true, false, 'Accountant', 40),
  ('Fleet Manager', 'Runs the fleet: vehicles, drivers, maintenance, documents and fleet expenses.', true, false, 'Fleet Manager', 50),
  ('HR Manager', 'Runs HR: employees, drivers, attendance, leave and payroll preparation.', true, false, null, 60),
  ('Maintenance Manager', 'Runs the workshop: work orders, maintenance, oil and tyres.', true, false, 'Maintenance Manager', 70),
  ('Procurement', 'Registers suppliers and prepares purchase bills.', true, false, 'Procurement', 80),
  ('Sponsor', 'Read-only owner view of the offices they sponsor: dashboards, reports and financial statements.', true, false, null, 90),
  ('Viewer', 'Read-only access to operational screens.', true, false, 'Viewer', 100),
  ('Management', 'Read-only management access (legacy role).', false, false, 'Management', 110)
on conflict do nothing;

-- Migrate the old matrix (only when the old table still exists)
do $$
begin
  if exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
             where n.nspname = 'public' and c.relname = 'role_permissions' and c.relkind = 'r') then
    insert into public.role_grants (role_id, module, action)
    select r.id, rp.module, rp.action
    from public.role_permissions rp join public.roles r on r.legacy_role = rp.role
    on conflict do nothing;
  end if;
  if exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
             where n.nspname = 'public' and c.relname = 'approval_limits' and c.relkind = 'r') then
    insert into public.role_approval_limits (role_id, module, max_amount)
    select r.id, l.module, l.max_amount
    from public.approval_limits l join public.roles r on r.legacy_role = l.role
    on conflict do nothing;
  end if;
end $$;

-- New modules inherit from the closest existing module, so behaviour for existing roles is unchanged
insert into public.role_grants (role_id, module, action)
select g.role_id, m.new_module, g.action
from public.role_grants g
join (values ('payroll','hr'), ('payroll','attendance'), ('payroll','leave'), ('vehicles','drivers'),
             ('accounting','financial-statements'), ('payments','bank-accounts'), ('customers','contracts'),
             ('expenses','budgets'), ('reports','dashboards')) as m(old_module, new_module)
  on m.old_module = g.module
on conflict do nothing;
-- Every role sees its own dashboard
insert into public.role_grants (role_id, module, action)
select id, 'dashboards', 'view' from public.roles where not is_super on conflict do nothing;

-- HR Manager defaults
insert into public.role_grants (role_id, module, action)
select r.id, m.module, a.action
from public.roles r
cross join (values ('hr'), ('attendance'), ('leave'), ('payroll'), ('drivers'), ('documents')) as m(module)
cross join unnest(array['view','create','edit','delete','export','print']::public.permission_action[]) as a(action)
where r.name = 'HR Manager'
on conflict do nothing;
insert into public.role_grants (role_id, module, action)
select r.id, m.module, a.action from public.roles r
cross join (values ('leave','approve'), ('attendance','approve'), ('vehicles','view'), ('companies','view'),
                   ('notifications','view'), ('approvals','view'), ('approvals','approve'), ('reports','view'),
                   ('reports','export'), ('reports','print'), ('dashboards','view')) as m(module, action)
cross join lateral (select m.action::public.permission_action as action) a
where r.name = 'HR Manager'
on conflict do nothing;
insert into public.role_approval_limits (role_id, module, max_amount)
select id, 'leave', null from public.roles where name = 'HR Manager' on conflict do nothing;

-- Sponsor defaults: read-only dashboards, reports and financial statements
insert into public.role_grants (role_id, module, action)
select r.id, m.module, m.action::public.permission_action from public.roles r
cross join (values ('dashboards','view'), ('reports','view'), ('reports','export'), ('reports','print'),
                   ('financial-statements','view'), ('financial-statements','export'), ('financial-statements','print'),
                   ('companies','view'), ('notifications','view')) as m(module, action)
where r.name = 'Sponsor'
on conflict do nothing;

-- Finance Manager approves above the accountant limit, including payments, payroll and budgets
insert into public.role_approval_limits (role_id, module, max_amount)
select r.id, m.module, null from public.roles r
cross join (values ('payment'), ('payroll'), ('budget'), ('party'), ('journal')) as m(module)
where r.name in ('Finance Manager', 'Admin')
on conflict do nothing;
insert into public.role_grants (role_id, module, action)
select r.id, m.module, 'approve' from public.roles r
cross join (values ('payments'), ('payroll'), ('budgets'), ('expenses'), ('invoices'), ('suppliers'), ('customers')) as m(module)
where r.name = 'Finance Manager'
on conflict do nothing;
insert into public.role_approval_limits (role_id, module, max_amount)
select r.id, 'expense', 500 from public.roles r where r.name in ('Accountant', 'Fleet Manager') on conflict do nothing;

-- Link existing profiles and members
update public.profiles p set role_id = r.id from public.roles r where p.role_id is null and r.legacy_role = p.role;
update public.profiles p set all_offices = true from public.roles r where r.id = p.role_id and r.is_super;
update public.profiles set role_id = (select id from public.roles where name = 'Viewer') where role_id is null;
alter table public.profiles alter column role_id set not null;

-- ---------------------------------------------------------------------
-- 3. Helper functions (SECURITY DEFINER: RLS calls them without recursion)
-- ---------------------------------------------------------------------
create or replace function public.is_super_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select r.is_super from public.profiles p join public.roles r on r.id = p.role_id
                   where p.id = auth.uid() and p.status = 'active'), false)
$$;

-- Legacy enum value of the caller's organization role (null for custom roles)
create or replace function public.app_role() returns public.user_role
language sql stable security definer set search_path = public as $$
  select r.legacy_role from public.profiles p join public.roles r on r.id = p.role_id
  where p.id = auth.uid() and p.status = 'active'
$$;

create or replace function public.app_role_name() returns text
language sql stable security definer set search_path = public as $$
  select r.name from public.profiles p join public.roles r on r.id = p.role_id
  where p.id = auth.uid() and p.status = 'active'
$$;

create or replace function public.my_company_ids() returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce(case
    when exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'active'
                 and (p.all_offices or exists (select 1 from public.roles r where r.id = p.role_id and r.is_super)))
      then (select array_agg(c.id) from public.companies c)
    else (select array_agg(m.company_id) from public.company_members m
          join public.profiles p on p.id = m.user_id and p.status = 'active'
          where m.user_id = auth.uid())
  end, '{}'::uuid[])
$$;

-- The caller's effective role in one office (null = no access to that office)
create or replace function public.my_role_in(p_company uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select case when m.user_id is not null then coalesce(m.role_id, p.role_id)
              when p.all_offices or r.is_super then p.role_id end
  from public.profiles p
  join public.roles r on r.id = p.role_id
  left join public.company_members m on m.user_id = p.id and m.company_id = p_company
  where p.id = auth.uid() and p.status = 'active'
    and exists (select 1 from public.companies c where c.id = p_company)
$$;

-- Offices where the caller holds module:action
create or replace function public.perm_company_ids(p_module text, p_action public.permission_action) returns uuid[]
language sql stable security definer set search_path = public as $$
  with me as (
    select p.id, p.role_id, p.all_offices, r.is_super
    from public.profiles p join public.roles r on r.id = p.role_id
    where p.id = auth.uid() and p.status = 'active'
  )
  select coalesce(case
    when (select is_super from me) then (select array_agg(c.id) from public.companies c)
    else (select array_agg(c.id) from public.companies c, me
          left join lateral (select m.role_id, true as member from public.company_members m
                             where m.user_id = me.id and m.company_id = c.id) mm on true
          where (mm.member or me.all_offices)
            and exists (select 1 from public.role_grants g
                        where g.role_id = coalesce(mm.role_id, me.role_id) and g.module = p_module and g.action = p_action))
  end, '{}'::uuid[])
$$;

create or replace function public.has_company_access(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select cid is not null and cid = any(public.my_company_ids())
$$;

-- Holds module:action anywhere: through the organization role or any office role.
-- Used for organization-level data (master data, settings). Office data uses can_in / perm_company_ids.
create or replace function public.has_perm(p_module text, p_action public.permission_action) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_super_admin()
      or exists (select 1 from public.profiles p
                 join public.role_grants g on g.role_id = p.role_id and g.module = p_module and g.action = p_action
                 where p.id = auth.uid() and p.status = 'active')
      or exists (select 1 from public.company_members m
                 join public.profiles p on p.id = m.user_id and p.status = 'active'
                 join public.role_grants g on g.role_id = m.role_id and g.module = p_module and g.action = p_action
                 where m.user_id = auth.uid() and m.role_id is not null)
$$;

create or replace function public.can_in(p_company uuid, p_module text, p_action public.permission_action)
returns boolean language sql stable security definer set search_path = public as $$
  select p_company is not null and (public.is_super_admin()
      or exists (select 1 from public.role_grants g
                 where g.role_id = public.my_role_in(p_company) and g.module = p_module and g.action = p_action))
$$;

-- Approval authority anywhere (organization role or any office role)
create or replace function public.can_approve(p_module text, p_amount numeric) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_super_admin()
      or exists (select 1 from public.role_approval_limits l
                 where l.module = p_module and (l.max_amount is null or p_amount <= l.max_amount)
                   and l.role_id in (select p.role_id from public.profiles p where p.id = auth.uid() and p.status = 'active'
                                     union
                                     select m.role_id from public.company_members m join public.profiles p on p.id = m.user_id
                                     where m.user_id = auth.uid() and p.status = 'active' and m.role_id is not null))
$$;

-- Approval authority in one office (the role the caller holds there)
create or replace function public.can_approve_in(p_company uuid, p_module text, p_amount numeric) returns boolean
language sql stable security definer set search_path = public as $$
  select p_company is not null and (public.is_super_admin()
      or exists (select 1 from public.role_approval_limits l
                 where l.role_id = public.my_role_in(p_company) and l.module = p_module
                   and (l.max_amount is null or coalesce(p_amount, 0) <= l.max_amount)))
$$;

revoke execute on function public.app_role_name(), public.my_role_in(uuid), public.perm_company_ids(text, public.permission_action),
  public.can_approve_in(uuid, text, numeric) from anon, public;
grant execute on function public.app_role(), public.app_role_name(), public.is_super_admin(), public.my_company_ids(),
  public.my_role_in(uuid), public.perm_company_ids(text, public.permission_action), public.has_company_access(uuid),
  public.has_perm(text, public.permission_action), public.can_in(uuid, text, public.permission_action),
  public.can_approve(text, numeric), public.can_approve_in(uuid, text, numeric) to authenticated;

-- ---------------------------------------------------------------------
-- 4. Old tables -> read-only compatibility views
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
             where n.nspname = 'public' and c.relname = 'role_permissions' and c.relkind = 'r') then
    drop table public.role_permissions cascade;
  end if;
  if exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
             where n.nspname = 'public' and c.relname = 'approval_limits' and c.relkind = 'r') then
    drop table public.approval_limits cascade;
  end if;
end $$;

create or replace view public.role_permissions with (security_invoker = true) as
  select r.name as role, g.role_id, g.module, g.action from public.role_grants g join public.roles r on r.id = g.role_id;
create or replace view public.approval_limits with (security_invoker = true) as
  select r.name as role, l.role_id, l.module, l.max_amount from public.role_approval_limits l join public.roles r on r.id = l.role_id;
revoke all on public.role_permissions, public.approval_limits from anon;
revoke insert, update, delete on public.role_permissions, public.approval_limits from authenticated;
grant select on public.role_permissions, public.approval_limits to authenticated;

-- ---------------------------------------------------------------------
-- 5. RLS on the role tables: readable by every signed-in user, written through RPCs only
-- ---------------------------------------------------------------------
alter table public.roles enable row level security;
alter table public.roles force row level security;
alter table public.role_grants enable row level security;
alter table public.role_grants force row level security;
alter table public.role_approval_limits enable row level security;
alter table public.role_approval_limits force row level security;
drop policy if exists roles_select on public.roles;
create policy roles_select on public.roles for select to authenticated using (true);
drop policy if exists role_grants_select on public.role_grants;
create policy role_grants_select on public.role_grants for select to authenticated using (true);
drop policy if exists role_limits_select on public.role_approval_limits;
create policy role_limits_select on public.role_approval_limits for select to authenticated using (true);
revoke all on public.roles, public.role_grants, public.role_approval_limits from anon;
revoke insert, update, delete on public.roles, public.role_grants, public.role_approval_limits from authenticated;
grant select on public.roles, public.role_grants, public.role_approval_limits to authenticated;

-- ---------------------------------------------------------------------
-- 6. Role management RPCs (Super Admin only: editing a role definition changes what every
--    holder of that role can do, so an Admin could otherwise escalate their own role)
-- ---------------------------------------------------------------------
create or replace function public._require_super() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_super_admin() then
    raise exception 'Permission denied: only a Super Admin can change role definitions' using errcode = '42501';
  end if;
end $$;

create or replace function public.create_role(p_name text, p_description text default null, p_copy_from uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform public._require_super();
  if coalesce(btrim(p_name), '') = '' then raise exception 'Role name is required'; end if;
  if exists (select 1 from public.roles where lower(btrim(name)) = lower(btrim(p_name))) then
    raise exception 'A role named "%" already exists', btrim(p_name);
  end if;
  if p_copy_from is not null and exists (select 1 from public.roles where id = p_copy_from and is_super) then
    raise exception 'The Super Admin role cannot be cloned; clone Admin instead';
  end if;
  insert into public.roles (name, description, is_system, sort_order)
  values (btrim(p_name), nullif(btrim(p_description), ''), false, 200) returning id into v_id;
  if p_copy_from is not null then
    insert into public.role_grants (role_id, module, action) select v_id, module, action from public.role_grants where role_id = p_copy_from;
    insert into public.role_approval_limits (role_id, module, max_amount) select v_id, module, max_amount from public.role_approval_limits where role_id = p_copy_from;
  end if;
  return v_id;
end $$;

create or replace function public.update_role(p_role uuid, p_name text, p_description text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._require_super();
  if coalesce(btrim(p_name), '') = '' then raise exception 'Role name is required'; end if;
  if exists (select 1 from public.roles where lower(btrim(name)) = lower(btrim(p_name)) and id <> p_role) then
    raise exception 'A role named "%" already exists', btrim(p_name);
  end if;
  update public.roles set name = btrim(p_name), description = nullif(btrim(p_description), ''), updated_at = now() where id = p_role;
  if not found then raise exception 'Role not found'; end if;
end $$;

create or replace function public.delete_role(p_role uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r public.roles;
begin
  perform public._require_super();
  select * into r from public.roles where id = p_role;
  if not found then raise exception 'Role not found'; end if;
  if r.is_system then raise exception 'System role "%" cannot be deleted', r.name; end if;
  if exists (select 1 from public.profiles where role_id = p_role) or exists (select 1 from public.company_members where role_id = p_role) then
    raise exception 'Role "%" is still assigned to users; reassign them first', r.name;
  end if;
  delete from public.roles where id = p_role;
end $$;

-- p_grants: [{"module":"vehicles","action":"view"}, ...] replaces the role's whole matrix
create or replace function public.set_role_grants(p_role uuid, p_grants jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._require_super();
  if exists (select 1 from public.roles where id = p_role and is_super) then
    raise exception 'Super Admin always has every permission';
  end if;
  if not exists (select 1 from public.roles where id = p_role) then raise exception 'Role not found'; end if;
  if jsonb_typeof(coalesce(p_grants, '[]')) <> 'array' then raise exception 'Grants must be a JSON array'; end if;
  delete from public.role_grants where role_id = p_role;
  insert into public.role_grants (role_id, module, action)
  select distinct p_role, g->>'module', (g->>'action')::public.permission_action
  from jsonb_array_elements(coalesce(p_grants, '[]')) g;
end $$;

-- p_limits: [{"module":"invoice","max_amount":500}, {"module":"expense","max_amount":null}]
create or replace function public.set_role_approval_limits(p_role uuid, p_limits jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._require_super();
  if exists (select 1 from public.roles where id = p_role and is_super) then
    raise exception 'Super Admin can approve any amount';
  end if;
  delete from public.role_approval_limits where role_id = p_role;
  insert into public.role_approval_limits (role_id, module, max_amount)
  select p_role, l->>'module', nullif(l->>'max_amount', '')::numeric
  from jsonb_array_elements(coalesce(p_limits, '[]')) l;
end $$;

revoke execute on function public._require_super() from anon, authenticated, public;
revoke execute on function public.create_role(text, text, uuid), public.update_role(uuid, text, text), public.delete_role(uuid),
  public.set_role_grants(uuid, jsonb), public.set_role_approval_limits(uuid, jsonb) from anon, public;
grant execute on function public.create_role(text, text, uuid), public.update_role(uuid, text, text), public.delete_role(uuid),
  public.set_role_grants(uuid, jsonb), public.set_role_approval_limits(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 7. Profiles: role_id is the truth; profiles.role (enum) is kept in sync for legacy readers
-- ---------------------------------------------------------------------
create or replace function public.trg_profile_role_sync() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_legacy public.user_role;
begin
  if tg_op = 'INSERT' then
    if new.role_id is null then
      select id into new.role_id from public.roles where legacy_role = coalesce(new.role, 'Viewer');
    end if;
  elsif new.role_id is distinct from old.role_id then
    null;                                                  -- role_id changed: derive the enum below
  elsif new.role is distinct from old.role then
    -- legacy writer (SQL editor bootstrap: update profiles set role = 'Super Admin')
    select id into new.role_id from public.roles where legacy_role = new.role;
  end if;
  select legacy_role into v_legacy from public.roles where id = new.role_id;
  new.role := coalesce(v_legacy, 'Viewer');
  if exists (select 1 from public.roles where id = new.role_id and is_super) then new.all_offices := true; end if;
  return new;
end $$;
revoke execute on function public.trg_profile_role_sync() from anon, authenticated, public;
-- named to fire before profiles_guard (BEFORE triggers run in name order), so the guard sees the
-- role_id a legacy `set role = ...` resolves to
drop trigger if exists profiles_role_sync on public.profiles;
drop trigger if exists profiles_a_role_sync on public.profiles;
create trigger profiles_a_role_sync before insert or update on public.profiles
  for each row execute function public.trg_profile_role_sync();

create or replace function public.guard_profile_update() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  v_super boolean;
  v_old_super boolean;
  v_new_super boolean;
begin
  new.updated_at := now();
  if v_uid is null then return new; end if;   -- server side (SQL editor / service role): bootstrap
  if new.id is distinct from old.id or new.email is distinct from old.email or new.legacy_id is distinct from old.legacy_id then
    raise exception 'Permission denied: id, email and legacy_id cannot be changed from the app';
  end if;
  v_super := public.is_super_admin();
  if new.role_id is not distinct from old.role_id and new.status is not distinct from old.status
     and new.all_offices is not distinct from old.all_offices then
    if old.id <> v_uid and not v_super then
      if not exists (select 1 from public.company_members m where m.user_id = old.id)
         or exists (select 1 from public.company_members m where m.user_id = old.id and public.can_in(m.company_id, 'users-roles', 'edit')) then
        return new;
      end if;
      raise exception 'Permission denied: user belongs to an office you do not manage';
    end if;
    return new;
  end if;
  -- Role / status / organization-level access change
  if not public.has_perm('users-roles', 'edit') then
    raise exception 'Only administrators can change role or status';
  end if;
  select is_super into v_old_super from public.roles where id = old.role_id;
  select is_super into v_new_super from public.roles where id = new.role_id;
  if not v_super then
    if old.id = v_uid then raise exception 'Permission denied: you cannot change your own role or status'; end if;
    if v_old_super or v_new_super then
      raise exception 'Permission denied: only a Super Admin can grant, change or revoke Super Admin';
    end if;
    if new.all_offices and not old.all_offices then
      raise exception 'Permission denied: only a Super Admin can grant organization-wide access';
    end if;
    if exists (select 1 from public.company_members m where m.user_id = old.id)
       and not exists (select 1 from public.company_members m where m.user_id = old.id and public.can_in(m.company_id, 'users-roles', 'edit')) then
      raise exception 'Permission denied: user belongs to an office you do not manage';
    end if;
  end if;
  if v_old_super and old.status = 'active' and (not coalesce(v_new_super, false) or new.status <> 'active')
     and not exists (select 1 from public.profiles p join public.roles r on r.id = p.role_id
                     where r.is_super and p.status = 'active' and p.id <> old.id) then
    raise exception 'Cannot demote or deactivate the last active Super Admin';
  end if;
  return new;
end $$;

create or replace function public.guard_company_member() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_target uuid := coalesce(new.user_id, old.user_id);
begin
  if tg_op <> 'DELETE' and new.role_id is not null
     and exists (select 1 from public.roles where id = new.role_id and is_super) then
    raise exception 'Super Admin is an organization role; it cannot be assigned per office';
  end if;
  if auth.uid() is not null and not public.is_super_admin()
     and exists (select 1 from public.profiles p join public.roles r on r.id = p.role_id where p.id = v_target and r.is_super) then
    raise exception 'Permission denied: only a Super Admin can change a Super Admin''s offices';
  end if;
  if auth.uid() is not null and tg_op <> 'DELETE' and v_target = auth.uid() and not public.is_super_admin()
     and new.role_id is distinct from (case when tg_op = 'UPDATE' then old.role_id end) then
    raise exception 'Permission denied: you cannot change your own office role';
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists company_members_guard on public.company_members;
create trigger company_members_guard before insert or update or delete on public.company_members
  for each row execute function public.guard_company_member();

-- Replace a user's office assignments atomically: [{"company_id": "...", "role_id": "..." | null}]
create or replace function public.set_user_office_roles(p_user uuid, p_assignments jsonb)
returns void language plpgsql set search_path = public as $$
declare a jsonb; v_company uuid; v_role uuid;
begin
  if not public.has_perm('users-roles', 'edit') then raise exception 'Permission denied' using errcode = '42501'; end if;
  if jsonb_typeof(coalesce(p_assignments, '[]')) <> 'array' then raise exception 'Assignments must be a JSON array'; end if;
  -- offices the caller manages and that are not in the new list are removed (RLS limits the delete)
  delete from public.company_members m
   where m.user_id = p_user
     and not exists (select 1 from jsonb_array_elements(coalesce(p_assignments, '[]')) x where (x->>'company_id')::uuid = m.company_id);
  for a in select * from jsonb_array_elements(coalesce(p_assignments, '[]')) loop
    v_company := (a->>'company_id')::uuid;
    v_role := nullif(a->>'role_id', '')::uuid;
    if not public.can_in(v_company, 'users-roles', 'edit') then
      raise exception 'Permission denied: you cannot assign an office you do not manage' using errcode = '42501';
    end if;
    if exists (select 1 from public.company_members where user_id = p_user and company_id = v_company) then
      update public.company_members set role_id = v_role where user_id = p_user and company_id = v_company
        and role_id is distinct from v_role;
    else
      insert into public.company_members (user_id, company_id, role_id) values (p_user, v_company, v_role);
    end if;
  end loop;
end $$;
revoke execute on function public.set_user_office_roles(uuid, jsonb) from anon, public;
grant execute on function public.set_user_office_roles(uuid, jsonb) to authenticated;

-- set_user_companies keeps working (office list only, roles untouched)
create or replace function public.set_user_companies(p_user uuid, p_companies uuid[])
returns setof uuid language plpgsql set search_path = public as $$
begin
  if not public.has_perm('users-roles', 'edit') then raise exception 'Permission denied'; end if;
  delete from public.company_members where user_id = p_user and not (company_id = any(coalesce(p_companies, '{}')));
  insert into public.company_members (user_id, company_id)
  select distinct p_user, c from unnest(coalesce(p_companies, '{}')) as c
  where not exists (select 1 from public.company_members m where m.user_id = p_user and m.company_id = c)
  on conflict (user_id, company_id) do nothing;
  if exists (select 1 from unnest(coalesce(p_companies, '{}')) c
             where not exists (select 1 from public.company_members m where m.user_id = p_user and m.company_id = c)) then
    raise exception 'Permission denied: you cannot assign an office you do not manage';
  end if;
  return query select company_id from public.company_members where user_id = p_user;
end $$;

-- Approver role name for custom roles
create or replace function public.trg_approval_action_role() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.approver_role_name := coalesce(new.approver_role_name, public.app_role_name());
  return new;
end $$;
revoke execute on function public.trg_approval_action_role() from anon, authenticated, public;
drop trigger if exists approval_actions_role_name on public.approval_actions;
create trigger approval_actions_role_name before insert on public.approval_actions
  for each row execute function public.trg_approval_action_role();

-- ---------------------------------------------------------------------
-- 8. RLS policies: office permission = perm_company_ids (per-office roles)
--    `X = ANY((SELECT my_company_ids())) AND (SELECT has_perm('m','a'))`  ->  `X = ANY((SELECT perm_company_ids('m','a')))`
-- ---------------------------------------------------------------------
do $$
declare
  pol record; q text; c text; stmt text;
  pat constant text := '\(?(\w+(?:\.\w+)?) = ANY \(\( SELECT my_company_ids\(\) AS my_company_ids\)::uuid\[\]\)\)\)? AND \( SELECT has_perm\(''([a-z-]+)''::text, ''([a-z]+)''::permission_action\) AS has_perm\)';
  rep constant text := '(\1 = ANY ((SELECT public.perm_company_ids(''\2''::text, ''\3''::public.permission_action))::uuid[]))';
begin
  for pol in select schemaname, tablename, policyname, qual, with_check from pg_policies
             where schemaname = 'public' and (coalesce(qual,'') ~ 'my_company_ids' or coalesce(with_check,'') ~ 'my_company_ids')
  loop
    q := case when pol.qual is not null then regexp_replace(pol.qual, pat, rep, 'g') end;
    c := case when pol.with_check is not null then regexp_replace(pol.with_check, pat, rep, 'g') end;
    if q is not distinct from pol.qual and c is not distinct from pol.with_check then continue; end if;
    stmt := format('alter policy %I on %I.%I', pol.policyname, pol.schemaname, pol.tablename);
    if q is not null then stmt := stmt || ' using (' || q || ')'; end if;
    if c is not null then stmt := stmt || ' with check (' || c || ')'; end if;
    execute stmt;
  end loop;
end $$;

-- policies of a different shape
drop policy if exists invoice_lines_insert on public.invoice_lines;
create policy invoice_lines_insert on public.invoice_lines for insert to authenticated
  with check (exists (select 1 from public.invoices i
                      where i.id = invoice_lines.invoice_id and i.journal_entry_id is null
                        and (i.company_id = any((select public.perm_company_ids('invoices', 'create'))::uuid[])
                             or i.company_id = any((select public.perm_company_ids('invoices', 'edit'))::uuid[]))));
drop policy if exists audit_logs_select on public.audit_logs;
create policy audit_logs_select on public.audit_logs for select to authenticated
  using ((company_id is null and (select public.is_super_admin()))
         or (company_id is not null and company_id = any((select public.perm_company_ids('audit-logs', 'view'))::uuid[])));
drop policy if exists companies_update on public.companies;
create policy companies_update on public.companies for update to authenticated
  using (id = any((select public.perm_company_ids('companies', 'edit'))::uuid[]))
  with check (id = any((select public.perm_company_ids('companies', 'edit'))::uuid[]));
drop policy if exists companies_delete on public.companies;
create policy companies_delete on public.companies for delete to authenticated
  using (id = any((select public.perm_company_ids('companies', 'delete'))::uuid[]));

drop policy if exists members_insert on public.company_members;
create policy members_insert on public.company_members for insert to authenticated
  with check (company_id = any((select public.perm_company_ids('users-roles', 'edit'))::uuid[]));
drop policy if exists members_update on public.company_members;
create policy members_update on public.company_members for update to authenticated
  using (company_id = any((select public.perm_company_ids('users-roles', 'edit'))::uuid[]))
  with check (company_id = any((select public.perm_company_ids('users-roles', 'edit'))::uuid[]));
drop policy if exists members_delete on public.company_members;
create policy members_delete on public.company_members for delete to authenticated
  using (company_id = any((select public.perm_company_ids('users-roles', 'edit'))::uuid[]));

-- storage: office permission for the module encoded in the path
drop policy if exists documents_read on storage.objects;
create policy documents_read on storage.objects for select to authenticated
  using (bucket_id = 'documents' and public.storage_module(name) is not null
         and public.can_in(public.storage_company(name), public.storage_module(name), 'view'));
drop policy if exists documents_upload on storage.objects;
create policy documents_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and public.storage_module(name) is not null
              and (public.can_in(public.storage_company(name), public.storage_module(name), 'create')
                   or (public.storage_module(name) <> 'documents' and public.can_in(public.storage_company(name), public.storage_module(name), 'edit'))));
drop policy if exists documents_delete on storage.objects;
create policy documents_delete on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and public.storage_module(name) is not null
         and (public.can_in(public.storage_company(name), public.storage_module(name), 'delete')
              or (public.storage_module(name) <> 'documents' and public.can_in(public.storage_company(name), public.storage_module(name), 'edit'))));

create or replace function public.media_can_write(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select case public.storage_entity(p_name)
    when 'vehicles' then public.can_in(public.storage_company(p_name), 'vehicles', 'edit')
                         or public.can_in(public.storage_company(p_name), 'vehicles', 'create')
    when 'logos'    then public.can_in(public.storage_company(p_name), 'companies', 'edit')
    when 'avatars'  then public.has_company_access(public.storage_company(p_name)) and split_part(p_name, '/', 3) = auth.uid()::text
    else false end
$$;

-- ---------------------------------------------------------------------
-- 9. RPC bodies: `has_company_access(X) or not has_perm(m, a)` -> `can_in(X, m, a)`
--    (rewritten in place from the live definitions so behaviour changes only in the check)
-- ---------------------------------------------------------------------
do $$
declare f record; def text; nd text;
begin
  for f in select p.oid, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prokind = 'f'
             and p.proname in ('seed_chart_of_accounts','complete_work_order','create_credit_note','create_invoice',
                               'submit_invoice','replace_invoice_lines','duplicate_invoice','run_depreciation',
                               'process_payroll','set_payment_attachment','post_invoice','decide_approval','fin_submit_invoice',
                               'trg_wo_guard')
  loop
    def := pg_get_functiondef(f.oid);
    nd := def;
    -- not has_company_access(X) or not has_perm(M, A)   =>   not can_in(X, M, A)
    nd := regexp_replace(nd, 'not public\.has_company_access\(([^()]+)\)\s+or\s+not\s+public\.has_perm\(([^()]+)\)',
                         'not public.can_in(\1, \2)', 'g');
    -- submit_invoice: not has_company_access(X) or not (has_perm(a) or has_perm(b))
    nd := regexp_replace(nd, 'not public\.has_company_access\(([^()]+)\)\s+or\s+not\s+\(public\.has_perm\(([^()]+)\)\s+or\s+public\.has_perm\(([^()]+)\)\)',
                         'not (public.can_in(\1, \2) or public.can_in(\1, \3))', 'g');
    -- p_post_gl and not has_perm('accounting','create')  (run_depreciation / process_payroll)
    nd := regexp_replace(nd, 'p_post_gl and not public\.has_perm\(''accounting'', ''create''\)',
                         'p_post_gl and not public.can_in(p_company, ''accounting'', ''create'')', 'g');
    if nd <> def then execute nd; end if;
  end loop;
end $$;

-- approval authority is per office
do $$
declare f record; def text; nd text;
begin
  for f in select p.oid, p.proname, m.expr from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           join (values ('post_invoice', 'inv.company_id'), ('fin_submit_invoice', 'inv.company_id'),
                        ('create_credit_note', 'inv.company_id'), ('decide_approval', 'r.company_id'),
                        ('trg_wo_guard', 'new.company_id')) as m(fn, expr) on m.fn = p.proname
           where n.nspname = 'public'
  loop
    def := pg_get_functiondef(f.oid);
    nd := regexp_replace(def, 'public\.can_approve\(', 'public.can_approve_in(' || f.expr || ', ', 'g');
    if nd <> def then execute nd; end if;
  end loop;
end $$;

-- decide_approval: required roles may name custom roles (by name) as well as legacy enum roles
create or replace function public.decide_approval(p_request uuid, p_action text, p_comment text)
returns void language plpgsql security definer set search_path = public as $$
declare r public.approval_requests; v_module text; v_role uuid; v_legacy public.user_role;
begin
  select * into r from public.approval_requests where id = p_request for update;
  if not found then raise exception 'Request not found'; end if;
  if r.status <> 'Pending' then raise exception 'Request already %', r.status; end if;
  if p_action not in ('Approved','Rejected') then raise exception 'Invalid action'; end if;
  if coalesce(btrim(p_comment), '') = '' then raise exception 'A comment is required'; end if;
  v_module := case r.reference_type when 'WorkOrder' then 'maintenance' when 'Invoice' then 'invoice'
                                    when 'Payment' then 'payment' when 'Payroll' then 'payroll' when 'Leave' then 'leave'
                                    when 'Supplier' then 'party' when 'Customer' then 'party' when 'Budget' then 'budget'
                                    else 'expense' end;
  v_role := public.my_role_in(r.company_id);
  select legacy_role into v_legacy from public.roles where id = v_role;
  if not public.can_approve_in(r.company_id, v_module, r.amount)
     or (cardinality(r.required_roles) > 0 and not public.is_super_admin() and not (v_legacy = any(r.required_roles))) then
    raise exception 'You are not authorised to decide this request' using errcode = '42501';
  end if;
  if r.requested_by = auth.uid() and p_action = 'Approved' then
    raise exception 'You cannot approve your own request' using errcode = '42501';
  end if;

  insert into public.approval_actions (request_id, level, approver_id, approver_role, approver_role_name, action, comment)
  values (p_request, r.current_level, auth.uid(), v_legacy, (select name from public.roles where id = v_role), p_action, btrim(p_comment));

  update public.approval_requests set
    status = case when p_action = 'Rejected' then 'Rejected'
                  when r.current_level >= r.total_levels then 'Approved' else 'Pending' end,
    current_level = case when p_action = 'Approved' and r.current_level < r.total_levels
                         then r.current_level + 1 else r.current_level end
  where id = p_request;

  if r.reference_type = 'WorkOrder' and (p_action = 'Rejected' or r.current_level >= r.total_levels) then
    update public.work_orders set approval_status = p_action,
           status = case when p_action = 'Approved' and status = 'Requested' then 'Approved' else status end
    where id = r.reference_id;
  end if;
end $$;
revoke execute on function public.decide_approval(uuid, text, text) from anon, public;
grant execute on function public.decide_approval(uuid, text, text) to authenticated;

-- Approvers of a request: effective role in the request's office has the approval limit
create or replace function public.approvers_for_request(r public.approval_requests)
returns setof uuid language sql stable security definer set search_path = public as $$
  select p.id
  from public.profiles p
  join public.roles pr on pr.id = p.role_id
  left join public.company_members m on m.user_id = p.id and m.company_id = r.company_id
  where p.status = 'active'
    and (pr.is_super
         or ((m.user_id is not null or p.all_offices)
             and exists (select 1 from public.role_approval_limits l
                         where l.role_id = coalesce(m.role_id, p.role_id)
                           and l.module = case r.reference_type when 'WorkOrder' then 'maintenance' when 'Invoice' then 'invoice'
                                                                 when 'Payment' then 'payment' when 'Payroll' then 'payroll'
                                                                 when 'Leave' then 'leave' when 'Supplier' then 'party'
                                                                 when 'Customer' then 'party' when 'Budget' then 'budget'
                                                                 else 'expense' end
                           and (l.max_amount is null or r.amount <= l.max_amount))
             and (cardinality(r.required_roles) = 0
                  or (select legacy_role from public.roles where id = coalesce(m.role_id, p.role_id)) = any (r.required_roles))))
$$;
revoke all on function public.approvers_for_request(public.approval_requests) from public, anon, authenticated;

-- Audit role name
alter table public.audit_logs alter column user_role set default null;
create or replace function public.trg_audit_role_name() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.user_role := coalesce(new.user_role, public.app_role());
  new.user_role_name := coalesce(new.user_role_name, public.app_role_name());
  return new;
end $$;
revoke execute on function public.trg_audit_role_name() from anon, authenticated, public;
drop trigger if exists audit_logs_role_name on public.audit_logs;
create trigger audit_logs_role_name before insert on public.audit_logs
  for each row execute function public.trg_audit_role_name();

-- audit the new identity tables
do $$
declare t text;
begin
  foreach t in array array['roles', 'role_grants', 'role_approval_limits'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_audit', t);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.trg_audit()', t || '_audit', t);
  end loop;
end $$;

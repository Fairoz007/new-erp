   -- =====================================================================
-- Agent G: auth & user-administration hardening
--   1. guard_profile_update: block self-promotion, cross-office admin edits,
--      Super Admin escalation by Company Admins, identity spoofing (email),
--      and removal of the last active Super Admin.
--   2. company_members: writers must already have access to the office
--      (a Company Admin can no longer add themselves to another office).
--   3. role_permissions / approval_limits are global (cross-office) tables:
--      only a Super Admin may change them.
--   4. set_user_companies(): atomic replace of a user's office memberships
--      (SECURITY INVOKER, so the RLS policies above apply).
-- Server-side callers (SQL editor, service role: auth.uid() is null) are not
-- restricted, which is how the first Super Admin is bootstrapped.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Profile guard
-- ---------------------------------------------------------------------
create or replace function public.guard_profile_update() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  v_admin boolean;
  v_super boolean;
begin
  new.updated_at := now();

  -- Server-side (SQL editor / service role): unrestricted, used to bootstrap the first Super Admin.
  if v_uid is null then
    return new;
  end if;

  -- Identity columns are never client-editable (email mirrors auth.users and is shown to other users).
  if new.id is distinct from old.id
     or new.email is distinct from old.email
     or new.legacy_id is distinct from old.legacy_id then
    raise exception 'Permission denied: id, email and legacy_id cannot be changed from the app';
  end if;

  if new.role is not distinct from old.role and new.status is not distinct from old.status then
    -- Only name / department / phone / avatar changed. Editing someone else's profile still needs admin rights,
    -- which the profiles_update policy already enforces; apply the same office scoping as for role changes.
    if old.id <> v_uid and not public.is_super_admin() then
      if not exists (select 1 from public.company_members m where m.user_id = old.id)
         or exists (select 1 from public.company_members m
                    where m.user_id = old.id and public.has_company_access(m.company_id)) then
        return new;
      end if;
      raise exception 'Permission denied: user belongs to an office you do not manage';
    end if;
    return new;
  end if;

  -- Role or status change from here on.
  v_admin := public.has_perm('users-roles', 'edit');
  v_super := public.is_super_admin();

  if not v_admin then
    raise exception 'Only administrators can change role or status';
  end if;

  if not v_super then
    if old.id = v_uid then
      raise exception 'Permission denied: you cannot change your own role or status';
    end if;
    if new.role = 'Super Admin' or old.role = 'Super Admin' then
      raise exception 'Permission denied: only a Super Admin can grant, change or revoke Super Admin';
    end if;
    -- Company Admins manage users of their own offices, plus not-yet-assigned users (fresh invitees).
    if exists (select 1 from public.company_members m where m.user_id = old.id)
       and not exists (select 1 from public.company_members m
                       where m.user_id = old.id and public.has_company_access(m.company_id)) then
      raise exception 'Permission denied: user belongs to an office you do not manage';
    end if;
  end if;

  -- Never leave the system without an active Super Admin.
  if old.role = 'Super Admin' and old.status = 'active'
     and (new.role is distinct from 'Super Admin' or new.status <> 'active')
     and not exists (select 1 from public.profiles p
                     where p.role = 'Super Admin' and p.status = 'active' and p.id <> old.id) then
    raise exception 'Cannot demote or deactivate the last active Super Admin';
  end if;

  return new;
end $$;

-- ---------------------------------------------------------------------
-- 2. Office memberships: caller must already have access to the office
-- ---------------------------------------------------------------------
drop policy if exists members_write on public.company_members;
drop policy if exists members_insert on public.company_members;
drop policy if exists members_update on public.company_members;
drop policy if exists members_delete on public.company_members;

create policy members_insert on public.company_members for insert to authenticated
  with check (public.has_perm('users-roles','edit') and public.has_company_access(company_id));
create policy members_update on public.company_members for update to authenticated
  using (public.has_perm('users-roles','edit') and public.has_company_access(company_id))
  with check (public.has_perm('users-roles','edit') and public.has_company_access(company_id));
create policy members_delete on public.company_members for delete to authenticated
  using (public.has_perm('users-roles','edit') and public.has_company_access(company_id));

-- Non-Super-Admins may not change a Super Admin's memberships (RLS cannot see the target's role cheaply,
-- so this is a trigger).
create or replace function public.guard_company_member() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_target uuid := coalesce(new.user_id, old.user_id);
begin
  if auth.uid() is not null and not public.is_super_admin()
     and exists (select 1 from public.profiles p where p.id = v_target and p.role = 'Super Admin') then
    raise exception 'Permission denied: only a Super Admin can change a Super Admin''s offices';
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists company_members_guard on public.company_members;
create trigger company_members_guard before insert or update or delete on public.company_members
  for each row execute function public.guard_company_member();

-- ---------------------------------------------------------------------
-- 3. Global permission tables: Super Admin only
-- ---------------------------------------------------------------------
drop policy if exists role_permissions_write on public.role_permissions;
create policy role_permissions_write on public.role_permissions for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

drop policy if exists approval_limits_write on public.approval_limits;
create policy approval_limits_write on public.approval_limits for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

-- ---------------------------------------------------------------------
-- 4. Atomic membership replacement (RLS + guard trigger apply: SECURITY INVOKER)
-- ---------------------------------------------------------------------
create or replace function public.set_user_companies(p_user uuid, p_companies uuid[])
returns setof uuid
language plpgsql security invoker set search_path = public as $$
begin
  if not public.has_perm('users-roles', 'edit') then
    raise exception 'Permission denied';
  end if;

  delete from public.company_members
   where user_id = p_user and not (company_id = any(coalesce(p_companies, '{}')));

  -- Insert only new rows: INSERT ... ON CONFLICT still applies the insert policy to existing rows,
  -- which would reject keeping a membership in an office the caller does not manage.
  insert into public.company_members (user_id, company_id)
  select distinct p_user, c from unnest(coalesce(p_companies, '{}')) as c
  where not exists (select 1 from public.company_members m where m.user_id = p_user and m.company_id = c)
  on conflict (user_id, company_id) do nothing;

  -- Every requested office must now be a membership (an RLS-filtered insert raises; this is a belt-and-braces check).
  if exists (select 1 from unnest(coalesce(p_companies, '{}')) c
             where not exists (select 1 from public.company_members m where m.user_id = p_user and m.company_id = c)) then
    raise exception 'Permission denied: you cannot assign an office you do not manage';
  end if;

  return query select company_id from public.company_members where user_id = p_user;
end $$;

revoke all on function public.set_user_companies(uuid, uuid[]) from public;
grant execute on function public.set_user_companies(uuid, uuid[]) to authenticated;

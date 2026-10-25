-- Agent F: Storage hardening (additive).
--  1. Per-entity object policies for the private `documents` bucket, so e.g. an Accountant (who has
--     invoices:create but only documents:view) can attach a bill to an invoice. Path convention:
--        <company_id>/<entity>/<uuid>-<sanitized file name>
--     entity -> permission module:  documents->documents, expenses->expenses, invoices->invoices,
--     payments->payments, maintenance->maintenance, accidents->accidents, journal->accounting
--  2. Private `media` bucket for images shown in lists (vehicle photos, company logos, user avatars):
--        <company_id>/vehicles/<uuid>-name | <company_id>/logos/<uuid>-name | <company_id>/avatars/<user_id>/<uuid>-name
--  3. Integrity: object path must live under the row's own company; one documents row per object.
--  4. storage_orphans(): admin report of objects no row references.
-- No UPDATE policy on objects: replacing a file = upload new path, update row, delete old object (never upsert).

-- ---------------------------------------------------------------------
-- 1. Helpers
-- ---------------------------------------------------------------------
create or replace function public.storage_entity(p_name text) returns text
language sql immutable as $$ select nullif(split_part(p_name, '/', 2), '') $$;

create or replace function public.storage_module(p_name text) returns text
language sql immutable as $$
  select case public.storage_entity(p_name)
    when 'documents' then 'documents' when 'expenses' then 'expenses' when 'invoices' then 'invoices'
    when 'payments' then 'payments' when 'maintenance' then 'maintenance' when 'accidents' then 'accidents'
    when 'journal' then 'accounting' end
$$;
grant execute on function public.storage_entity(text), public.storage_module(text) to authenticated;

-- ---------------------------------------------------------------------
-- 2. documents bucket policies (replace the module-agnostic ones from 000200)
-- ---------------------------------------------------------------------
drop policy if exists documents_read on storage.objects;
drop policy if exists documents_upload on storage.objects;
drop policy if exists documents_delete on storage.objects;

create policy documents_read on storage.objects for select to authenticated
  using (bucket_id = 'documents'
         and public.has_company_access(public.storage_company(name))
         and public.storage_module(name) is not null
         and public.has_perm(public.storage_module(name), 'view'));

-- attaching a file to a record is part of creating or editing that record
create policy documents_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'documents'
         and public.has_company_access(public.storage_company(name))
         and public.storage_module(name) is not null
         and (public.has_perm(public.storage_module(name), 'create')
              or (public.storage_module(name) <> 'documents' and public.has_perm(public.storage_module(name), 'edit'))));

-- generic repository files need 'delete'; record attachments can be removed by whoever may edit the record
create policy documents_delete on storage.objects for delete to authenticated
  using (bucket_id = 'documents'
         and public.has_company_access(public.storage_company(name))
         and public.storage_module(name) is not null
         and (public.has_perm(public.storage_module(name), 'delete')
              or (public.storage_module(name) <> 'documents' and public.has_perm(public.storage_module(name), 'edit'))));

-- ---------------------------------------------------------------------
-- 3. media bucket (private; read through short-lived signed URLs)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', false, 5242880, array['image/png','image/jpeg','image/webp'])
on conflict (id) do nothing;

-- write rule per entity: vehicles -> vehicles:edit, logos -> companies:edit, avatars -> own folder only
create or replace function public.media_can_write(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.has_company_access(public.storage_company(p_name)) and case public.storage_entity(p_name)
    when 'vehicles' then public.has_perm('vehicles','edit')
    when 'logos'    then public.has_perm('companies','edit')
    when 'avatars'  then split_part(p_name, '/', 3) = auth.uid()::text
    else false end
$$;
grant execute on function public.media_can_write(text) to authenticated;

create policy media_read on storage.objects for select to authenticated
  using (bucket_id = 'media' and public.has_company_access(public.storage_company(name)));
create policy media_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and public.media_can_write(name));
create policy media_delete on storage.objects for delete to authenticated
  using (bucket_id = 'media' and public.media_can_write(name));

-- ---------------------------------------------------------------------
-- 4. Integrity: a row may only point at an object inside its own company folder, and an object has
--    at most one owning documents row (deleting one row must never orphan/steal another's file).
-- ---------------------------------------------------------------------
alter table public.documents add constraint documents_path_in_company
  check (storage_path is null or storage_path like company_id::text || '/%') not valid;
create unique index documents_storage_path_uq on public.documents (storage_path) where storage_path is not null;

alter table public.expenses add constraint expenses_attachment_in_company
  check (attachment_path is null or attachment_path like company_id::text || '/%') not valid;
alter table public.invoices add constraint invoices_attachment_in_company
  check (attachment_path is null or attachment_path like company_id::text || '/%') not valid;
alter table public.payments add constraint payments_attachment_in_company
  check (attachment_path is null or attachment_path like company_id::text || '/%') not valid;
alter table public.journal_entries add constraint journal_entries_attachment_in_company
  check (attachment_path is null or attachment_path like company_id::text || '/%') not valid;

-- ---------------------------------------------------------------------
-- 5. Orphan report (needs settings:edit). Objects in a bucket that no row references: left behind when
--    a client crashes between upload and insert, or a compensating remove failed. Cleanup is done by
--    the client via storage.remove().
-- ---------------------------------------------------------------------
create or replace function public.storage_orphans(p_bucket text default 'documents')
returns table (name text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_perm('settings','edit') then raise exception 'Permission denied'; end if;
  if p_bucket = 'documents' then
    return query
      select o.name::text from storage.objects o
      where o.bucket_id = 'documents' and public.has_company_access(public.storage_company(o.name))
        and not exists (select 1 from public.documents d where d.storage_path = o.name)
        and not exists (select 1 from public.expenses d where d.attachment_path = o.name)
        and not exists (select 1 from public.invoices d where d.attachment_path = o.name)
        and not exists (select 1 from public.payments d where d.attachment_path = o.name)
        and not exists (select 1 from public.journal_entries d where d.attachment_path = o.name)
        and not exists (select 1 from public.maintenance_records m, jsonb_array_elements(m.attachments) a where a->>'storage_path' = o.name)
        and not exists (select 1 from public.accidents m, jsonb_array_elements(m.attachments) a where a->>'storage_path' = o.name);
  elsif p_bucket = 'media' then
    return query
      select o.name::text from storage.objects o
      where o.bucket_id = 'media' and public.has_company_access(public.storage_company(o.name))
        and not exists (select 1 from public.vehicles v where v.photo_url = o.name)
        and not exists (select 1 from public.companies c where c.logo = o.name)
        and not exists (select 1 from public.profiles p where p.avatar = o.name);
  else
    raise exception 'Unknown bucket %', p_bucket;
  end if;
end $$;
revoke all on function public.storage_orphans(text) from public;
grant execute on function public.storage_orphans(text) to authenticated;

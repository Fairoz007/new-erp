-- The `documents` and `media` buckets are created by the first migrations (20261025000200,
-- 20261026000500). On the hosted project they were removed together with their files when the
-- stored files were cleared on 2026-11-12 (`supabase storage rm -r` on the bucket root deletes the
-- bucket too), so every upload failed with "The stored file could not be found".
-- Create them again if missing, with the same settings as 20261113004000_storage_limits.sql
-- (private; documents: PDF, PNG, JPEG up to 10 MB; media: PNG, JPEG, WebP up to 5 MB).
-- The access policies are on storage.objects and were not affected.
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('documents', 'documents', false, 10485760, array['application/pdf','image/png','image/jpeg']),
           ('media', 'media', false, 5242880, array['image/png','image/jpeg','image/webp'])
    on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
                                   allowed_mime_types = excluded.allowed_mime_types;
  end if;
end $$;

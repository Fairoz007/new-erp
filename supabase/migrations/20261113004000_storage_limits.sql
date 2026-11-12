-- Phase 6: storage limits are enforced on existing projects too.
-- The buckets were created with `on conflict do nothing`, so a project whose buckets existed before
-- those migrations kept whatever limits it had. Set them explicitly (same values as the original
-- migrations and as src/services/storage.ts BUCKETS), private in both cases.
do $$
begin
  if to_regclass('storage.buckets') is not null then
    update storage.buckets set public = false, file_size_limit = 10485760,
           allowed_mime_types = array['application/pdf','image/png','image/jpeg']
     where id = 'documents';
    update storage.buckets set public = false, file_size_limit = 5242880,
           allowed_mime_types = array['image/png','image/jpeg','image/webp']
     where id = 'media';
  end if;
end $$;

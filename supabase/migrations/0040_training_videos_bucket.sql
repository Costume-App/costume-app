-- 0040: public Storage bucket for the training videos (MP4, WebVTT captions,
-- poster JPEG), written by scripts/upload-training-videos.mjs.
--
-- Public, so /storage/v1/object/public/training-videos/<path> serves without a
-- token. No storage.objects policies on purpose: public-URL reads do not
-- consult them, and the only writer is the upload script on the service-role
-- key, which bypasses RLS. An anon SELECT policy would also let anyone LIST
-- the bucket, which nothing needs. No table is created, so no RLS table work.
--
-- 50 MB per object is the Supabase Free plan cap; the script refuses larger
-- files before uploading.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'training-videos',
  'training-videos',
  true,
  52428800,
  array['video/mp4', 'text/vtt', 'image/jpeg']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

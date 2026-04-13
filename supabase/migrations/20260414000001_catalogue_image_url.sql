-- supabase/migrations/20260414000001_catalogue_image_url.sql

-- 1. Add image_url column
ALTER TABLE public.network_catalog_items
  ADD COLUMN IF NOT EXISTS image_url text;

-- 2. Create public Storage bucket (public = true allows read without auth)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'catalogue-images',
  'catalogue-images',
  true,
  2097152,
  ARRAY['image/jpeg','image/png','image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- 3. Block direct client-side uploads (all writes go through service role API)
CREATE POLICY IF NOT EXISTS "no_direct_client_uploads"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id <> 'catalogue-images');

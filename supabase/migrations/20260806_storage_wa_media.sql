-- ====================================================================
-- iBloomCRM v2 — Supabase Storage wa-media Bucket Migration
-- File: 20260806_storage_wa_media.sql
-- Run in Supabase SQL Editor (Append-Only Migration)
-- ====================================================================

-- ── 1. CREATE BUCKET IF NOT EXISTS ──────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) 
VALUES (
    'wa-media', 
    'wa-media', 
    false, 
    104857600, -- 100 MB max file size limit
    ARRAY[
        'image/jpeg', 'image/png', 'image/webp', 'image/gif',
        'video/mp4', 'video/3gpp',
        'audio/aac', 'audio/mp4', 'audio/mpeg', 'audio/ogg', 'audio/amr',
        'application/pdf', 'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain', 'text/csv'
    ]
)
ON CONFLICT (id) DO UPDATE SET 
    public = false,
    file_size_limit = 104857600;

-- ── 2. RLS POLICIES FOR STORAGE OBJECTS ────────────────────────────────────

-- Policy 1: Service Role full access for background worker download/upload
DROP POLICY IF EXISTS "Service role full access on wa-media bucket" ON storage.objects;
CREATE POLICY "Service role full access on wa-media bucket"
    ON storage.objects FOR ALL TO service_role
    USING (bucket_id = 'wa-media')
    WITH CHECK (bucket_id = 'wa-media');

-- Policy 2: Authenticated Users access within their own tenant folder path
-- Path convention: {tenant_uid}/{conversation_uid}/{message_uid}.{ext}
DROP POLICY IF EXISTS "Tenant isolation for wa-media bucket" ON storage.objects;
CREATE POLICY "Tenant isolation for wa-media bucket"
    ON storage.objects FOR ALL TO authenticated
    USING (
        bucket_id = 'wa-media' AND 
        (storage.foldername(name))[1] = (auth.jwt() -> 'app_metadata' ->> 'tenant_uid')
    )
    WITH CHECK (
        bucket_id = 'wa-media' AND 
        (storage.foldername(name))[1] = (auth.jwt() -> 'app_metadata' ->> 'tenant_uid')
    );

-- ============================================================================
-- Migration 001: Create Storage Bucket
-- Date: 2026-01-24
-- Description: Creates the 'baiyezhan' public storage bucket and access policies.
-- ============================================================================

-- 1. Create 'baiyezhan' bucket (idempotent)
INSERT INTO storage.buckets (id, name, public)
VALUES ('baiyezhan', 'baiyezhan', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Upload policy: authenticated users only
DROP POLICY IF EXISTS "Allow authenticated uploads to baiyezhan" ON storage.objects;
CREATE POLICY "Allow authenticated uploads to baiyezhan"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (bucket_id = 'baiyezhan');

-- 3. Read policy: public access
DROP POLICY IF EXISTS "Public read access to baiyezhan" ON storage.objects;
CREATE POLICY "Public read access to baiyezhan"
    ON storage.objects FOR SELECT
    TO public
    USING (bucket_id = 'baiyezhan');

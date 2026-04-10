-- ============================================================================
-- Migration 008: Add Guestbook & Profile Extensions
-- Date: 2026-02-01
-- Description: Adds avatar_url to users, creates the multi-context guestbook
--              table with fine-grained RLS policies.
-- ============================================================================

-- 1. Add avatar to users
ALTER TABLE public.baiyezhan_users
ADD COLUMN IF NOT EXISTS avatar_url text;

-- 2. Create guestbook table
CREATE TABLE IF NOT EXISTS public.baiyezhan_guestbook (
    id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    content     text NOT NULL,
    author_id   uuid REFERENCES public.baiyezhan_users(id) ON DELETE CASCADE NOT NULL,
    target_type text NOT NULL,  -- 'global', 'baiye', 'room'
    target_id   uuid,           -- NULL if global
    created_at  timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_guestbook_target
ON public.baiyezhan_guestbook(target_type, target_id);

-- 4. Enable RLS
ALTER TABLE public.baiyezhan_guestbook ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies
-- Everyone can read
CREATE POLICY "Public read access" ON public.baiyezhan_guestbook
FOR SELECT TO public USING (true);

-- Authenticated users can insert their own
CREATE POLICY "Authenticated insert access" ON public.baiyezhan_guestbook
FOR INSERT TO authenticated WITH CHECK (auth.uid() = author_id);

-- Users delete own; Admin/VIP delete any
CREATE POLICY "User delete own or Admin delete all" ON public.baiyezhan_guestbook
FOR DELETE TO authenticated USING (
    auth.uid() = author_id OR
    EXISTS (SELECT 1 FROM public.baiyezhan_users WHERE id = auth.uid() AND role = 'admin') OR
    EXISTS (SELECT 1 FROM public.baiyezhan_users WHERE id = auth.uid() AND role = 'vip')
);

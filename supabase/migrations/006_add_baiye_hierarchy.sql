-- ============================================================================
-- Migration 006: Add Baiye Hierarchy
-- Date: 2026-02-01
-- Description: Creates the baiye (大房间) table and links rooms to it.
--              Migrates existing orphan rooms to a default baiye.
-- ============================================================================

-- 1. Create baiye table
CREATE TABLE IF NOT EXISTS public.baiyezhan_baiye (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name        text NOT NULL,
    description text NULL,
    cover_image text NULL,
    password    text NULL,
    owner_id    uuid NOT NULL REFERENCES public.baiyezhan_users(id),
    created_at  timestamptz DEFAULT now()
);

-- 2. Index on owner
CREATE INDEX IF NOT EXISTS idx_baiyezhan_baiye_owner
ON public.baiyezhan_baiye(owner_id);

-- 3. Add baiye_id FK to rooms
ALTER TABLE public.baiyezhan_rooms
ADD COLUMN IF NOT EXISTS baiye_id uuid NULL
REFERENCES public.baiyezhan_baiye(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_baiyezhan_rooms_baiye
ON public.baiyezhan_rooms(baiye_id);

-- 4. Migrate orphan rooms to a default baiye
DO $$
DECLARE
    default_owner_id uuid;
    default_baiye_id uuid;
BEGIN
    IF EXISTS (SELECT 1 FROM public.baiyezhan_rooms WHERE baiye_id IS NULL) THEN
        -- Find an admin, or fallback to any user
        SELECT id INTO default_owner_id
        FROM public.baiyezhan_users
        WHERE role = 'admin'
        LIMIT 1;

        IF default_owner_id IS NULL THEN
            SELECT id INTO default_owner_id
            FROM public.baiyezhan_users
            LIMIT 1;
        END IF;

        IF default_owner_id IS NOT NULL THEN
            INSERT INTO public.baiyezhan_baiye (name, description, owner_id)
            VALUES ('默认百业', '系统自动创建，用于归档现有房间', default_owner_id)
            RETURNING id INTO default_baiye_id;

            UPDATE public.baiyezhan_rooms
            SET baiye_id = default_baiye_id
            WHERE baiye_id IS NULL;
        END IF;
    END IF;
END $$;

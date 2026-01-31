-- Migration: Add Baiye (大房间) hierarchy
-- Baiye contains multiple rooms (小房间)

-- 1. Create baiye table
CREATE TABLE public.baiyezhan_baiye (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    description text NULL,
    cover_image text NULL,
    password text NULL,
    owner_id uuid NOT NULL REFERENCES public.baiyezhan_users(id),
    created_at timestamp with time zone DEFAULT now()
);

-- 2. Add indexes
CREATE INDEX idx_baiyezhan_baiye_owner ON public.baiyezhan_baiye(owner_id);

-- 3. Add baiye_id column to rooms table
ALTER TABLE public.baiyezhan_rooms
ADD COLUMN baiye_id uuid NULL REFERENCES public.baiyezhan_baiye(id) ON DELETE CASCADE;

CREATE INDEX idx_baiyezhan_rooms_baiye ON public.baiyezhan_rooms(baiye_id);

-- 4. Create default baiye for existing rooms (run only if rooms exist)
-- This creates a "默认百业" owned by the first admin, or first user if no admin
DO $$
DECLARE
    default_owner_id uuid;
    default_baiye_id uuid;
BEGIN
    -- Check if there are any rooms without baiye_id
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
            -- Create default baiye
            INSERT INTO public.baiyezhan_baiye (name, description, owner_id)
            VALUES ('默认百业', '系统自动创建，用于归档现有房间', default_owner_id)
            RETURNING id INTO default_baiye_id;
            
            -- Assign all orphan rooms to default baiye
            UPDATE public.baiyezhan_rooms
            SET baiye_id = default_baiye_id
            WHERE baiye_id IS NULL;
        END IF;
    END IF;
END $$;

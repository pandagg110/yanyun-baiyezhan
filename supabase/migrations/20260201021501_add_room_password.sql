-- Migration: Add optional password to baiyezhan_rooms
-- Password is stored as plain text (room password, not account password)

ALTER TABLE public.baiyezhan_rooms
ADD COLUMN IF NOT EXISTS password text NULL;

-- Note: No constraint needed - NULL means no password required

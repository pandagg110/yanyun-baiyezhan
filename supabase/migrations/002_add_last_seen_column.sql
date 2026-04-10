-- ============================================================================
-- Migration 002: Add last_seen Column
-- Date: 2026-01-25
-- Description: Adds heartbeat tracking column to room_members for zombie cleanup.
-- ============================================================================

ALTER TABLE public.baiyezhan_room_members
ADD COLUMN IF NOT EXISTS last_seen timestamptz DEFAULT now();

-- Enable Realtime for this table
ALTER PUBLICATION supabase_realtime ADD TABLE baiyezhan_room_members;

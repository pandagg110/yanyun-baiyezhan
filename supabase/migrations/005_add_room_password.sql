-- ============================================================================
-- Migration 005: Add Room Password
-- Date: 2026-02-01
-- Description: Adds optional password field to rooms table.
--              NULL = no password required.
-- ============================================================================

ALTER TABLE public.baiyezhan_rooms
ADD COLUMN IF NOT EXISTS password text NULL;

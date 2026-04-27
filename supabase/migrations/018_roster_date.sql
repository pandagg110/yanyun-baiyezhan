-- ============================================================================
-- Migration 018: Add roster_date for date-based upsert
-- ============================================================================

-- Add roster_date column
ALTER TABLE public.baiyezhan_rosters
    ADD COLUMN IF NOT EXISTS roster_date date DEFAULT CURRENT_DATE;

-- Backfill existing rows
UPDATE public.baiyezhan_rosters
    SET roster_date = created_at::date
    WHERE roster_date IS NULL;

ALTER TABLE public.baiyezhan_rosters
    ALTER COLUMN roster_date SET NOT NULL;

-- Unique constraint: one roster per baiye per date (for upsert)
ALTER TABLE public.baiyezhan_rosters
    DROP CONSTRAINT IF EXISTS uq_rosters_baiye_date;
ALTER TABLE public.baiyezhan_rosters
    ADD CONSTRAINT uq_rosters_baiye_date UNIQUE (baiye_id, roster_date);

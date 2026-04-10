-- ============================================================================
-- Migration 011: Add Match Start/End Time
-- Date: 2026-04-11
-- Description: Adds match_start_time and match_end_time columns to
--              baiyezhan_matches. match_date is kept but auto-derived
--              from match_start_time via a trigger.
-- Dependency: Migration 010 (baiyezhan_matches table)
-- ============================================================================

-- ──────────────────────────────────────────────
-- 1. Add start/end time columns
-- ──────────────────────────────────────────────
ALTER TABLE public.baiyezhan_matches
ADD COLUMN IF NOT EXISTS match_start_time timestamptz;

ALTER TABLE public.baiyezhan_matches
ADD COLUMN IF NOT EXISTS match_end_time timestamptz;

-- ──────────────────────────────────────────────
-- 2. Backfill: set match_start_time from existing match_date
-- ──────────────────────────────────────────────
UPDATE public.baiyezhan_matches
SET match_start_time = match_date,
    match_end_time = match_date + interval '30 minutes'
WHERE match_start_time IS NULL AND match_date IS NOT NULL;

-- ──────────────────────────────────────────────
-- 3. Trigger: auto-sync match_date from match_start_time
--    So match_date always equals match_start_time (for backward compat)
-- ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sync_match_date()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.match_start_time IS NOT NULL THEN
        NEW.match_date := NEW.match_start_time;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_match_date ON public.baiyezhan_matches;

CREATE TRIGGER trg_sync_match_date
BEFORE INSERT OR UPDATE ON public.baiyezhan_matches
FOR EACH ROW
EXECUTE FUNCTION public.sync_match_date();

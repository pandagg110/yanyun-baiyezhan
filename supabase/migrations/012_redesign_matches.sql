-- ============================================================================
-- Migration 012: Redesign Matches for Symmetric Two-Team System
-- Date: 2026-04-11
-- Description:
--   1. Redesigns baiyezhan_matches: team_a/team_b/match_key/winner
--   2. Adds team_name to match_stats for team-aware player data
--   3. match_key dedup ensures one match record shared by both teams
--   4. Each team submits their own players with team_name populated
-- Dependency: Migration 010 (baiyezhan_matches + baiyezhan_match_stats)
-- ============================================================================

-- ═══════════════════════════════════════════════
-- PART A: Redesign baiyezhan_matches
-- ═══════════════════════════════════════════════

-- 1. Ensure match_start_time exists (idempotent, covers if 011 was skipped)
ALTER TABLE public.baiyezhan_matches
ADD COLUMN IF NOT EXISTS match_start_time timestamptz;

-- 2. Add new columns
ALTER TABLE public.baiyezhan_matches ADD COLUMN IF NOT EXISTS team_a text;
ALTER TABLE public.baiyezhan_matches ADD COLUMN IF NOT EXISTS team_b text;
ALTER TABLE public.baiyezhan_matches ADD COLUMN IF NOT EXISTS match_key text;
ALTER TABLE public.baiyezhan_matches ADD COLUMN IF NOT EXISTS winner text;

-- 3. Backfill existing data (opponent_name → team_b, baiye name → team_a)
UPDATE public.baiyezhan_matches m
SET
    team_a = COALESCE((SELECT b.name FROM public.baiyezhan_baiye b WHERE b.id = m.baiye_id), '未知百业'),
    team_b = COALESCE(m.opponent_name, '未知对手'),
    match_start_time = COALESCE(m.match_start_time, m.match_date, m.created_at),
    winner = CASE
        WHEN m.result = 'win' THEN (SELECT b.name FROM public.baiyezhan_baiye b WHERE b.id = m.baiye_id)
        WHEN m.result = 'lose' THEN m.opponent_name
        WHEN m.result = 'draw' THEN 'draw'
        ELSE NULL
    END
WHERE m.team_a IS NULL;

-- Backfill match_key for existing rows
UPDATE public.baiyezhan_matches
SET match_key = (
    CASE WHEN team_a < team_b
         THEN team_a || '|' || team_b
         ELSE team_b || '|' || team_a
    END
) || '|' || to_char(match_start_time AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI')
WHERE match_key IS NULL AND team_a IS NOT NULL AND match_start_time IS NOT NULL;

-- 4. Constraints
ALTER TABLE public.baiyezhan_matches ALTER COLUMN team_a SET NOT NULL;
ALTER TABLE public.baiyezhan_matches ALTER COLUMN team_b SET NOT NULL;

ALTER TABLE public.baiyezhan_matches
ADD CONSTRAINT uq_matches_match_key UNIQUE (match_key);

-- 5. Drop legacy columns
ALTER TABLE public.baiyezhan_matches DROP COLUMN IF EXISTS opponent_name;
ALTER TABLE public.baiyezhan_matches DROP COLUMN IF EXISTS match_end_time;
ALTER TABLE public.baiyezhan_matches DROP COLUMN IF EXISTS result;

-- 6. Trigger: auto-compute match_key + match_date
CREATE OR REPLACE FUNCTION public.compute_match_key()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.team_a IS NOT NULL AND NEW.team_b IS NOT NULL AND NEW.match_start_time IS NOT NULL THEN
        NEW.match_key := (
            CASE WHEN NEW.team_a < NEW.team_b
                 THEN NEW.team_a || '|' || NEW.team_b
                 ELSE NEW.team_b || '|' || NEW.team_a
            END
        ) || '|' || to_char(NEW.match_start_time AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI');
    END IF;

    IF NEW.match_start_time IS NOT NULL THEN
        NEW.match_date := NEW.match_start_time;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_match_date ON public.baiyezhan_matches;
DROP TRIGGER IF EXISTS trg_compute_match_key ON public.baiyezhan_matches;

CREATE TRIGGER trg_compute_match_key
BEFORE INSERT OR UPDATE ON public.baiyezhan_matches
FOR EACH ROW
EXECUTE FUNCTION public.compute_match_key();

-- 7. Indexes
CREATE INDEX IF NOT EXISTS idx_matches_team_a ON public.baiyezhan_matches(team_a);
CREATE INDEX IF NOT EXISTS idx_matches_team_b ON public.baiyezhan_matches(team_b);

-- ═══════════════════════════════════════════════
-- PART B: Add team_name to baiyezhan_match_stats
-- ═══════════════════════════════════════════════

-- 1. Add team_name column (which baiye/team this player belongs to)
ALTER TABLE public.baiyezhan_match_stats
ADD COLUMN IF NOT EXISTS team_name text;

-- 2. Backfill: for existing rows, derive team_name from match's team_a
--    (legacy data was always submitted by team_a side)
UPDATE public.baiyezhan_match_stats s
SET team_name = m.team_a
FROM public.baiyezhan_matches m
WHERE s.match_id = m.id AND s.team_name IS NULL;

-- 3. Set NOT NULL after backfill
-- (only if there's data; for empty tables this is safe too)
DO $$
BEGIN
    -- Only set NOT NULL if no NULL team_names remain
    IF NOT EXISTS (SELECT 1 FROM public.baiyezhan_match_stats WHERE team_name IS NULL) THEN
        ALTER TABLE public.baiyezhan_match_stats ALTER COLUMN team_name SET NOT NULL;
    END IF;
END $$;

-- 4. Indexes for multi-dimension analysis
--    By team (baiye dimension): "find all stats for a specific baiye"
CREATE INDEX IF NOT EXISTS idx_match_stats_team ON public.baiyezhan_match_stats(team_name);

--    Composite: prevent same team submitting duplicate data for one match
CREATE UNIQUE INDEX IF NOT EXISTS uq_match_stats_team_player
ON public.baiyezhan_match_stats(match_id, team_name, player_name);

--    By player + team (player dimension across baiye)
CREATE INDEX IF NOT EXISTS idx_match_stats_player_team ON public.baiyezhan_match_stats(player_name, team_name);

-- ═══════════════════════════════════════════════
-- PART C: Screenshot evidence table
-- ═══════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.baiyezhan_match_screenshots (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    match_id uuid NOT NULL REFERENCES public.baiyezhan_matches(id) ON DELETE CASCADE,
    team_name text NOT NULL,                     -- which team uploaded this image
    image_url text NOT NULL,                     -- Supabase Storage public URL
    uploaded_by uuid REFERENCES public.baiyezhan_users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_screenshots_match ON public.baiyezhan_match_screenshots(match_id);
CREATE INDEX IF NOT EXISTS idx_screenshots_team ON public.baiyezhan_match_screenshots(match_id, team_name);

-- RLS
ALTER TABLE public.baiyezhan_match_screenshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read screenshots" ON public.baiyezhan_match_screenshots
FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "VIP or admin insert screenshots" ON public.baiyezhan_match_screenshots
FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.baiyezhan_users WHERE id = auth.uid() AND role IN ('admin', 'vip'))
);

CREATE POLICY "Admin delete screenshots" ON public.baiyezhan_match_screenshots
FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.baiyezhan_users WHERE id = auth.uid() AND role = 'admin')
);

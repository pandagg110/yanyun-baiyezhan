-- ============================================================================
-- Migration 010: Add Matches Table & Refactor Match Stats
-- Date: 2026-04-11
-- Description: Introduces baiyezhan_matches (对战记录) as the parent table for
--              match-level info (opponent, result, screenshots).
--              Refactors baiyezhan_match_stats to FK into matches via uuid.
-- Dependency: Migration 009 (baiyezhan_match_stats table)
-- ============================================================================

-- ──────────────────────────────────────────────
-- 1. Create matches table (对战记录)
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.baiyezhan_matches (
    id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    baiye_id        uuid NOT NULL REFERENCES public.baiyezhan_baiye(id) ON DELETE CASCADE,
    opponent_name   text NOT NULL,                          -- 对手百业名称
    result          text NOT NULL DEFAULT 'pending',        -- 'win', 'lose', 'draw', 'pending'
    match_date      timestamptz DEFAULT now(),              -- 对战日期
    notes           text,                                   -- 备注
    screenshot_urls text[],                                 -- 原始截图 URL 数组
    created_by      uuid REFERENCES public.baiyezhan_users(id) ON DELETE SET NULL,
    created_at      timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Result check constraint
ALTER TABLE public.baiyezhan_matches
ADD CONSTRAINT baiyezhan_matches_result_check
CHECK (result IN ('win', 'lose', 'draw', 'pending'));

-- Indexes
CREATE INDEX IF NOT EXISTS idx_matches_baiye ON public.baiyezhan_matches(baiye_id);
CREATE INDEX IF NOT EXISTS idx_matches_date ON public.baiyezhan_matches(baiye_id, match_date DESC);

-- RLS
ALTER TABLE public.baiyezhan_matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access" ON public.baiyezhan_matches
FOR SELECT TO public USING (true);

CREATE POLICY "Authenticated insert access" ON public.baiyezhan_matches
FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Admin or owner delete" ON public.baiyezhan_matches
FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.baiyezhan_users WHERE id = auth.uid() AND role IN ('admin', 'vip'))
    OR
    EXISTS (SELECT 1 FROM public.baiyezhan_baiye WHERE id = baiye_id AND owner_id = auth.uid())
);

CREATE POLICY "Admin or owner update" ON public.baiyezhan_matches
FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.baiyezhan_users WHERE id = auth.uid() AND role IN ('admin', 'vip'))
    OR
    EXISTS (SELECT 1 FROM public.baiyezhan_baiye WHERE id = baiye_id AND owner_id = auth.uid())
);

-- ──────────────────────────────────────────────
-- 2. Migrate existing match_stats data (if any)
--    Group by (baiye_id, match_id) → create a matches row for each group
--    Then update match_stats to point to the new matches row
-- ──────────────────────────────────────────────

-- Add a new uuid column to hold the FK (temporary, will replace match_id)
ALTER TABLE public.baiyezhan_match_stats
ADD COLUMN IF NOT EXISTS new_match_id uuid;

-- Migrate: for each unique (baiye_id, match_id), insert into matches and link back
DO $$
DECLARE
    rec RECORD;
    new_id uuid;
BEGIN
    FOR rec IN
        SELECT DISTINCT baiye_id, match_id
        FROM public.baiyezhan_match_stats
        WHERE match_id IS NOT NULL
    LOOP
        -- Create a matches record for this group
        INSERT INTO public.baiyezhan_matches (baiye_id, opponent_name, result)
        VALUES (rec.baiye_id, '未知对手', 'pending')
        RETURNING id INTO new_id;

        -- Link all stats in this group to the new matches record
        UPDATE public.baiyezhan_match_stats
        SET new_match_id = new_id
        WHERE baiye_id = rec.baiye_id AND match_id = rec.match_id;
    END LOOP;
END $$;

-- ──────────────────────────────────────────────
-- 3. Swap columns: drop old match_id, rename new_match_id
-- ──────────────────────────────────────────────

-- Drop old indexes that reference old columns
DROP INDEX IF EXISTS idx_match_stats_match;
DROP INDEX IF EXISTS idx_match_stats_player_baiye;
DROP INDEX IF EXISTS idx_match_stats_baiye;

-- Drop old text match_id column
ALTER TABLE public.baiyezhan_match_stats DROP COLUMN IF EXISTS match_id;

-- Rename new_match_id → match_id
ALTER TABLE public.baiyezhan_match_stats RENAME COLUMN new_match_id TO match_id;

-- Make match_id NOT NULL (safe since we migrated all existing data)
-- For empty tables this is also fine
ALTER TABLE public.baiyezhan_match_stats ALTER COLUMN match_id SET NOT NULL;

-- Add FK constraint
ALTER TABLE public.baiyezhan_match_stats
ADD CONSTRAINT fk_match_stats_match
FOREIGN KEY (match_id) REFERENCES public.baiyezhan_matches(id) ON DELETE CASCADE;
-- ──────────────────────────────────────────────
-- 4. Update RLS: drop old policy BEFORE dropping baiye_id (it depends on that column)
-- ──────────────────────────────────────────────
DROP POLICY IF EXISTS "Admin or owner delete" ON public.baiyezhan_match_stats;

-- Now safe to drop baiye_id (no more dependencies)
ALTER TABLE public.baiyezhan_match_stats DROP COLUMN IF EXISTS baiye_id;

-- ──────────────────────────────────────────────
-- 5. Recreate indexes and RLS for new schema
-- ──────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_match_stats_match ON public.baiyezhan_match_stats(match_id);
CREATE INDEX IF NOT EXISTS idx_match_stats_player ON public.baiyezhan_match_stats(player_name);

CREATE POLICY "Admin or owner delete" ON public.baiyezhan_match_stats
FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.baiyezhan_users WHERE id = auth.uid() AND role IN ('admin', 'vip'))
    OR
    EXISTS (
        SELECT 1 FROM public.baiyezhan_matches m
        JOIN public.baiyezhan_baiye b ON b.id = m.baiye_id
        WHERE m.id = match_id AND b.owner_id = auth.uid()
    )
);

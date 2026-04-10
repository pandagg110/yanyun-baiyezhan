-- ============================================================================
-- Migration 009: Add Match Stats Table
-- Date: 2026-04-11
-- Description: Creates baiyezhan_match_stats table for tracking per-player
--              combat statistics within each Baiye.
-- Dependency: Migration 006 (baiyezhan_baiye table)
-- ============================================================================

-- ──────────────────────────────────────────────
-- 1. Create match_stats table
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.baiyezhan_match_stats (
    id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    baiye_id        uuid NOT NULL REFERENCES public.baiyezhan_baiye(id) ON DELETE CASCADE,
    match_id        text NOT NULL,                          -- 战斗 ID（同一局用同一个）
    player_name     text NOT NULL,                          -- 玩家名（快照，不随改名变化）
    user_id         uuid REFERENCES public.baiyezhan_users(id) ON DELETE SET NULL,

    -- 战斗数据
    kills           integer NOT NULL DEFAULT 0,
    assists         integer NOT NULL DEFAULT 0,
    deaths          integer NOT NULL DEFAULT 0,
    coins           integer NOT NULL DEFAULT 0,

    -- 详细数据
    damage          numeric NOT NULL DEFAULT 0,
    damage_taken    numeric NOT NULL DEFAULT 0,
    healing         numeric NOT NULL DEFAULT 0,
    building_damage numeric NOT NULL DEFAULT 0,

    created_at      timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ──────────────────────────────────────────────
-- 2. Indexes for common query patterns
-- ──────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_match_stats_baiye
ON public.baiyezhan_match_stats(baiye_id);

CREATE INDEX IF NOT EXISTS idx_match_stats_match
ON public.baiyezhan_match_stats(match_id);

CREATE INDEX IF NOT EXISTS idx_match_stats_player_baiye
ON public.baiyezhan_match_stats(player_name, baiye_id);

-- Partial index: only index rows that have a linked user
CREATE INDEX IF NOT EXISTS idx_match_stats_user
ON public.baiyezhan_match_stats(user_id)
WHERE user_id IS NOT NULL;

-- ──────────────────────────────────────────────
-- 3. RLS Policies
-- ──────────────────────────────────────────────
ALTER TABLE public.baiyezhan_match_stats ENABLE ROW LEVEL SECURITY;

-- Everyone can read match stats
CREATE POLICY "Public read access" ON public.baiyezhan_match_stats
FOR SELECT TO public USING (true);

-- Authenticated users can insert stats
CREATE POLICY "Authenticated insert access" ON public.baiyezhan_match_stats
FOR INSERT TO authenticated WITH CHECK (true);

-- Admin/VIP or Baiye owner can delete stats
CREATE POLICY "Admin or owner delete" ON public.baiyezhan_match_stats
FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.baiyezhan_users WHERE id = auth.uid() AND role IN ('admin', 'vip'))
    OR
    EXISTS (SELECT 1 FROM public.baiyezhan_baiye WHERE id = baiye_id AND owner_id = auth.uid())
);

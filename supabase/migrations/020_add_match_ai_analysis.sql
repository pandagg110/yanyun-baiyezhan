-- ============================================================================
-- Migration 020: Add Match AI Analysis Cache
-- Date: 2026-04-28
-- Description: 存储每场对战的 AI 战术分析结果，支持重新生成
-- Dependency: Migration 010 (baiyezhan_matches)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.baiyezhan_match_ai_analysis (
    id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    match_id        uuid NOT NULL,
    baiye_id        uuid NOT NULL REFERENCES public.baiyezhan_baiye(id) ON DELETE CASCADE,
    analysis_text   text NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE(match_id, baiye_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_match_ai_analysis_match ON public.baiyezhan_match_ai_analysis(match_id);
CREATE INDEX IF NOT EXISTS idx_match_ai_analysis_baiye ON public.baiyezhan_match_ai_analysis(baiye_id);

-- RLS
ALTER TABLE public.baiyezhan_match_ai_analysis ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read match ai analysis" ON public.baiyezhan_match_ai_analysis;
CREATE POLICY "Public read match ai analysis" ON public.baiyezhan_match_ai_analysis
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public insert match ai analysis" ON public.baiyezhan_match_ai_analysis;
CREATE POLICY "Public insert match ai analysis" ON public.baiyezhan_match_ai_analysis
    FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Public update match ai analysis" ON public.baiyezhan_match_ai_analysis;
CREATE POLICY "Public update match ai analysis" ON public.baiyezhan_match_ai_analysis
    FOR UPDATE USING (true);

-- Auto-update updated_at trigger
CREATE OR REPLACE FUNCTION update_match_ai_analysis_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_match_ai_analysis_updated_at ON public.baiyezhan_match_ai_analysis;
CREATE TRIGGER trg_match_ai_analysis_updated_at
    BEFORE UPDATE ON public.baiyezhan_match_ai_analysis
    FOR EACH ROW
    EXECUTE FUNCTION update_match_ai_analysis_updated_at();

-- ============================================================================
-- Part 2: Add Dragon Capture Fields to Matches
-- Description: 记录每场对战是否拿到大龙/小龙
-- ============================================================================

ALTER TABLE public.baiyezhan_matches
ADD COLUMN IF NOT EXISTS big_dragon_team text DEFAULT NULL;

ALTER TABLE public.baiyezhan_matches
ADD COLUMN IF NOT EXISTS small_dragon_team text DEFAULT NULL;

COMMENT ON COLUMN public.baiyezhan_matches.big_dragon_team IS '拿到大龙的百业名称，NULL 表示无人拿到';
COMMENT ON COLUMN public.baiyezhan_matches.small_dragon_team IS '拿到小龙的百业名称，NULL 表示无人拿到';

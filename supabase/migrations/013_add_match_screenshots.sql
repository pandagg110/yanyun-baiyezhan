-- ═══════════════════════════════════════════════
-- 013: Match Screenshots + Match Type Tag
-- ═══════════════════════════════════════════════

-- PART A: Add match_type tag and coin_value to matches table
ALTER TABLE public.baiyezhan_matches
ADD COLUMN IF NOT EXISTS match_type text NOT NULL DEFAULT '排位';

-- coin_value: 每局野怪价值，默认660，后续可能调整
ALTER TABLE public.baiyezhan_matches
ADD COLUMN IF NOT EXISTS coin_value integer NOT NULL DEFAULT 660;

CREATE TABLE IF NOT EXISTS public.baiyezhan_match_screenshots (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    match_id uuid NOT NULL REFERENCES public.baiyezhan_matches(id) ON DELETE CASCADE,
    team_name text NOT NULL,
    image_url text NOT NULL,
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

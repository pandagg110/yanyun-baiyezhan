-- ============================================================================
-- Migration 017: Roster Planning System (排表系统)
-- ============================================================================

-- 1. 人员池
CREATE TABLE IF NOT EXISTS public.baiyezhan_roster_members (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    baiye_id uuid NOT NULL REFERENCES public.baiyezhan_baiye(id) ON DELETE CASCADE,
    name text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(baiye_id, name)
);
CREATE INDEX IF NOT EXISTS idx_roster_members_baiye ON public.baiyezhan_roster_members(baiye_id);
ALTER TABLE public.baiyezhan_roster_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read roster members" ON public.baiyezhan_roster_members;
CREATE POLICY "Public read roster members" ON public.baiyezhan_roster_members FOR SELECT USING (true);
DROP POLICY IF EXISTS "Authenticated insert roster members" ON public.baiyezhan_roster_members;
CREATE POLICY "Authenticated insert roster members" ON public.baiyezhan_roster_members FOR INSERT WITH CHECK (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "Authenticated delete roster members" ON public.baiyezhan_roster_members;
CREATE POLICY "Authenticated delete roster members" ON public.baiyezhan_roster_members FOR DELETE USING (auth.role() = 'authenticated');

-- 2. 排表快照
CREATE TABLE IF NOT EXISTS public.baiyezhan_rosters (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    baiye_id uuid NOT NULL REFERENCES public.baiyezhan_baiye(id) ON DELETE CASCADE,
    name text NOT NULL DEFAULT '排表',
    roster_data jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_by uuid REFERENCES public.baiyezhan_users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rosters_baiye ON public.baiyezhan_rosters(baiye_id);
ALTER TABLE public.baiyezhan_rosters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read rosters" ON public.baiyezhan_rosters;
CREATE POLICY "Public read rosters" ON public.baiyezhan_rosters FOR SELECT USING (true);
DROP POLICY IF EXISTS "Authenticated insert rosters" ON public.baiyezhan_rosters;
CREATE POLICY "Authenticated insert rosters" ON public.baiyezhan_rosters FOR INSERT WITH CHECK (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "Authenticated update rosters" ON public.baiyezhan_rosters;
CREATE POLICY "Authenticated update rosters" ON public.baiyezhan_rosters FOR UPDATE USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "Authenticated delete rosters" ON public.baiyezhan_rosters;
CREATE POLICY "Authenticated delete rosters" ON public.baiyezhan_rosters FOR DELETE USING (auth.role() = 'authenticated');

CREATE OR REPLACE FUNCTION update_rosters_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_rosters_updated_at ON public.baiyezhan_rosters;
CREATE TRIGGER trg_rosters_updated_at BEFORE UPDATE ON public.baiyezhan_rosters
    FOR EACH ROW EXECUTE FUNCTION update_rosters_updated_at();

-- 3. 下拉选项表（颜色标签）
CREATE TABLE IF NOT EXISTS public.baiyezhan_roster_options (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    baiye_id uuid NOT NULL REFERENCES public.baiyezhan_baiye(id) ON DELETE CASCADE,
    category text NOT NULL DEFAULT 'general',
    label text NOT NULL,
    color text,
    sort_order int DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(baiye_id, category, label)
);
CREATE INDEX IF NOT EXISTS idx_roster_options_baiye ON public.baiyezhan_roster_options(baiye_id);
ALTER TABLE public.baiyezhan_roster_options ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read roster options" ON public.baiyezhan_roster_options;
CREATE POLICY "Public read roster options" ON public.baiyezhan_roster_options FOR SELECT USING (true);
DROP POLICY IF EXISTS "Auth manage roster options" ON public.baiyezhan_roster_options;
CREATE POLICY "Auth manage roster options" ON public.baiyezhan_roster_options FOR INSERT WITH CHECK (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "Auth update roster options" ON public.baiyezhan_roster_options;
CREATE POLICY "Auth update roster options" ON public.baiyezhan_roster_options FOR UPDATE USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "Auth delete roster options" ON public.baiyezhan_roster_options;
CREATE POLICY "Auth delete roster options" ON public.baiyezhan_roster_options FOR DELETE USING (auth.role() = 'authenticated');

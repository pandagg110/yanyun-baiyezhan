-- ============================================================================
-- Migration 015: Add Feedback & ToDo System
-- Date: 2026-04-28
-- Description: 新增玩家反馈收集表和优化计划ToDo表，构建反馈闭环系统
-- Dependency: Migration 006 (baiyezhan_baiye)
-- ============================================================================

-- ============================================================================
-- 1. 玩家反馈表 (Feedback Collection)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.baiyezhan_feedback (
    id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    baiye_id        uuid NOT NULL REFERENCES public.baiyezhan_baiye(id) ON DELETE CASCADE,
    worst_experience    text,
    improvement_suggestion text NOT NULL,
    good_parts      text,
    player_role     text CHECK (player_role IN ('防守', '进攻')),
    is_anonymous    boolean NOT NULL DEFAULT false,
    user_id         uuid REFERENCES public.baiyezhan_users(id) ON DELETE SET NULL,
    user_name       text,
    created_at      timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_feedback_baiye ON public.baiyezhan_feedback(baiye_id);
CREATE INDEX IF NOT EXISTS idx_feedback_created ON public.baiyezhan_feedback(baiye_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_user ON public.baiyezhan_feedback(user_id);

-- RLS
ALTER TABLE public.baiyezhan_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read feedback" ON public.baiyezhan_feedback;
CREATE POLICY "Public read feedback" ON public.baiyezhan_feedback
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public insert feedback" ON public.baiyezhan_feedback;
CREATE POLICY "Public insert feedback" ON public.baiyezhan_feedback
    FOR INSERT WITH CHECK (true);

-- ============================================================================
-- 2. ToDo 优化计划表 (Todo Items)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.baiyezhan_todos (
    id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    baiye_id        uuid NOT NULL REFERENCES public.baiyezhan_baiye(id) ON DELETE CASCADE,
    title           text NOT NULL,
    description     text,
    priority        text NOT NULL DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low')),
    status          text NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'doing', 'done')),
    batch_time_start timestamptz,
    batch_time_end  timestamptz,
    created_by      uuid REFERENCES public.baiyezhan_users(id) ON DELETE SET NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_todos_baiye ON public.baiyezhan_todos(baiye_id);
CREATE INDEX IF NOT EXISTS idx_todos_status ON public.baiyezhan_todos(baiye_id, status);
CREATE INDEX IF NOT EXISTS idx_todos_created ON public.baiyezhan_todos(baiye_id, created_at DESC);

-- RLS
ALTER TABLE public.baiyezhan_todos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read todos" ON public.baiyezhan_todos;
CREATE POLICY "Public read todos" ON public.baiyezhan_todos
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public insert todos" ON public.baiyezhan_todos;
CREATE POLICY "Public insert todos" ON public.baiyezhan_todos
    FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated update todos" ON public.baiyezhan_todos;
CREATE POLICY "Authenticated update todos" ON public.baiyezhan_todos
    FOR UPDATE USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated delete todos" ON public.baiyezhan_todos;
CREATE POLICY "Authenticated delete todos" ON public.baiyezhan_todos
    FOR DELETE USING (auth.role() = 'authenticated');

-- Auto-update updated_at trigger
CREATE OR REPLACE FUNCTION update_todos_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_todos_updated_at ON public.baiyezhan_todos;
CREATE TRIGGER trg_todos_updated_at
    BEFORE UPDATE ON public.baiyezhan_todos
    FOR EACH ROW
    EXECUTE FUNCTION update_todos_updated_at();

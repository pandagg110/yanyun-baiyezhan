-- ═══════════════════════════════════════════════
-- 014: Rename Audit Log + match_stats UPDATE policy
-- Track all player rename operations with undo support.
-- Undo is stack-based: only the most recent non-undone
-- operation can be reverted.
-- ═══════════════════════════════════════════════

-- PART A: Allow admin to UPDATE match_stats (needed for rename)
CREATE POLICY "Admin update match_stats" ON public.baiyezhan_match_stats
FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.baiyezhan_users WHERE id = auth.uid() AND role = 'admin')
);

-- PART B: Rename audit log table
CREATE TABLE IF NOT EXISTS public.baiyezhan_rename_log (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    old_name text NOT NULL,
    new_name text NOT NULL,
    affected_count integer NOT NULL DEFAULT 0,
    performed_by uuid REFERENCES public.baiyezhan_users(id) ON DELETE SET NULL,
    performed_at timestamptz NOT NULL DEFAULT now(),
    is_undone boolean NOT NULL DEFAULT false,
    undone_at timestamptz
);

-- Index for quick lookups of undo candidates (most recent non-undone)
CREATE INDEX IF NOT EXISTS idx_rename_log_undo
    ON public.baiyezhan_rename_log(is_undone, performed_at DESC);

-- RLS
ALTER TABLE public.baiyezhan_rename_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read rename_log" ON public.baiyezhan_rename_log
FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "Admin insert rename_log" ON public.baiyezhan_rename_log
FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.baiyezhan_users WHERE id = auth.uid() AND role = 'admin')
);

CREATE POLICY "Admin update rename_log" ON public.baiyezhan_rename_log
FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.baiyezhan_users WHERE id = auth.uid() AND role = 'admin')
);

-- ============================================================================
-- Migration 022: Add replay review dashboard records
-- Date: 2026-06-15
-- Description: Stores admin-created screen-recording review notes per baiye,
--              target player, and review week.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.baiyezhan_replay_reviews (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    baiye_id        uuid NOT NULL REFERENCES public.baiyezhan_baiye(id) ON DELETE CASCADE,
    target_name     text NOT NULL,
    reviewer_id     uuid REFERENCES public.baiyezhan_users(id) ON DELETE SET NULL,
    reviewer_name   text,
    review_title    text,
    review_points   text NOT NULL,
    image_urls      text[] NOT NULL DEFAULT '{}',
    week_start      date NOT NULL,
    review_date     date NOT NULL DEFAULT CURRENT_DATE,
    tags            text[] NOT NULL DEFAULT '{}',
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_replay_reviews_baiye_week
ON public.baiyezhan_replay_reviews(baiye_id, week_start DESC);

CREATE INDEX IF NOT EXISTS idx_replay_reviews_baiye_target
ON public.baiyezhan_replay_reviews(baiye_id, lower(target_name));

CREATE INDEX IF NOT EXISTS idx_replay_reviews_reviewer
ON public.baiyezhan_replay_reviews(reviewer_id)
WHERE reviewer_id IS NOT NULL;

ALTER TABLE public.baiyezhan_replay_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Replay reviews self or admin read" ON public.baiyezhan_replay_reviews;
CREATE POLICY "Replay reviews self or admin read"
ON public.baiyezhan_replay_reviews
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.baiyezhan_users u
        WHERE u.id = auth.uid()
          AND (
              u.role = 'admin'
              OR lower(u.character_name) = lower(target_name)
          )
    )
);

DROP POLICY IF EXISTS "Admin insert replay reviews" ON public.baiyezhan_replay_reviews;
CREATE POLICY "Admin insert replay reviews"
ON public.baiyezhan_replay_reviews
FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM public.baiyezhan_users u
        WHERE u.id = auth.uid()
          AND u.role = 'admin'
    )
);

DROP POLICY IF EXISTS "Admin update replay reviews" ON public.baiyezhan_replay_reviews;
CREATE POLICY "Admin update replay reviews"
ON public.baiyezhan_replay_reviews
FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.baiyezhan_users u
        WHERE u.id = auth.uid()
          AND u.role = 'admin'
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM public.baiyezhan_users u
        WHERE u.id = auth.uid()
          AND u.role = 'admin'
    )
);

DROP POLICY IF EXISTS "Admin delete replay reviews" ON public.baiyezhan_replay_reviews;
CREATE POLICY "Admin delete replay reviews"
ON public.baiyezhan_replay_reviews
FOR DELETE
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.baiyezhan_users u
        WHERE u.id = auth.uid()
          AND u.role = 'admin'
    )
);

CREATE OR REPLACE FUNCTION public.update_replay_reviews_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_replay_reviews_updated_at ON public.baiyezhan_replay_reviews;
CREATE TRIGGER trg_replay_reviews_updated_at
    BEFORE UPDATE ON public.baiyezhan_replay_reviews
    FOR EACH ROW
    EXECUTE FUNCTION public.update_replay_reviews_updated_at();

-- Supabase Data API no longer exposes new tables automatically on new projects.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.baiyezhan_replay_reviews TO authenticated;

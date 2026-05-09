-- Migration 021: Tactical Improvement Hub enhancements
-- Adds keyword tracking and reopen tracking to todos for match-linking

-- Add new columns to baiyezhan_todos
ALTER TABLE public.baiyezhan_todos
    ADD COLUMN IF NOT EXISTS keywords text[] DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS reopen_count integer DEFAULT 0,
    ADD COLUMN IF NOT EXISTS related_match_ids uuid[] DEFAULT '{}';

-- Comment on new columns
COMMENT ON COLUMN public.baiyezhan_todos.keywords IS 'AI-extracted keywords for matching against AI analysis text';
COMMENT ON COLUMN public.baiyezhan_todos.reopen_count IS 'Number of times this todo was reopened after being marked done';
COMMENT ON COLUMN public.baiyezhan_todos.related_match_ids IS 'Match IDs where this issue was observed in AI analysis';

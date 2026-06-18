-- ============================================================================
-- Migration 023: Add skill cooldown telemetry
-- Date: 2026-06-19
-- Description: Stores client-uploaded player skill cooldown and heartbeat data
--              for telemetry rooms.
-- Dependency: Migration 000 (baiyezhan_rooms)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.baiyezhan_skill_cooldowns (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    room_code          text NOT NULL REFERENCES public.baiyezhan_rooms(room_code) ON UPDATE CASCADE ON DELETE CASCADE,
    username           text NOT NULL,
    profession         text NOT NULL DEFAULT '',
    skill_name         text NOT NULL,
    cooldown_until     timestamptz,
    heartbeat_at       timestamptz NOT NULL DEFAULT now(),
    client_reported_at timestamptz,
    metadata           jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT baiyezhan_skill_cooldowns_username_not_blank CHECK (length(btrim(username)) > 0),
    CONSTRAINT baiyezhan_skill_cooldowns_skill_not_blank CHECK (length(btrim(skill_name)) > 0)
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'uq_skill_cooldowns_room_user_skill'
          AND conrelid = 'public.baiyezhan_skill_cooldowns'::regclass
    ) THEN
        ALTER TABLE public.baiyezhan_skill_cooldowns
        ADD CONSTRAINT uq_skill_cooldowns_room_user_skill
        UNIQUE (room_code, username, skill_name);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_skill_cooldowns_room_heartbeat
ON public.baiyezhan_skill_cooldowns(room_code, heartbeat_at DESC);

CREATE INDEX IF NOT EXISTS idx_skill_cooldowns_room_profession
ON public.baiyezhan_skill_cooldowns(room_code, profession);

CREATE INDEX IF NOT EXISTS idx_skill_cooldowns_cooldown_until
ON public.baiyezhan_skill_cooldowns(cooldown_until)
WHERE cooldown_until IS NOT NULL;

ALTER TABLE public.baiyezhan_skill_cooldowns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read skill cooldowns" ON public.baiyezhan_skill_cooldowns;
CREATE POLICY "Public read skill cooldowns"
ON public.baiyezhan_skill_cooldowns
FOR SELECT
USING (true);

DROP POLICY IF EXISTS "Public insert skill cooldowns" ON public.baiyezhan_skill_cooldowns;
CREATE POLICY "Public insert skill cooldowns"
ON public.baiyezhan_skill_cooldowns
FOR INSERT
WITH CHECK (true);

DROP POLICY IF EXISTS "Public update skill cooldowns" ON public.baiyezhan_skill_cooldowns;
CREATE POLICY "Public update skill cooldowns"
ON public.baiyezhan_skill_cooldowns
FOR UPDATE
USING (true)
WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.update_skill_cooldowns_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_skill_cooldowns_updated_at ON public.baiyezhan_skill_cooldowns;
CREATE TRIGGER trg_skill_cooldowns_updated_at
    BEFORE UPDATE ON public.baiyezhan_skill_cooldowns
    FOR EACH ROW
    EXECUTE FUNCTION public.update_skill_cooldowns_updated_at();

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
    ) AND NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'baiyezhan_skill_cooldowns'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.baiyezhan_skill_cooldowns;
    END IF;
END $$;

GRANT SELECT, INSERT, UPDATE ON TABLE public.baiyezhan_skill_cooldowns TO anon, authenticated;

COMMENT ON TABLE public.baiyezhan_skill_cooldowns IS 'Client-uploaded per-player per-skill cooldown state for telemetry rooms.';
COMMENT ON COLUMN public.baiyezhan_skill_cooldowns.cooldown_until IS 'Cooldown end time. NULL or a past timestamp means the skill is ready.';
COMMENT ON COLUMN public.baiyezhan_skill_cooldowns.heartbeat_at IS 'Latest heartbeat/upload time from the client for this player skill row.';

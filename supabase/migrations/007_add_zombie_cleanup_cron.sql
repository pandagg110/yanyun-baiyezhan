-- ============================================================================
-- Migration 007: Add Zombie Cleanup Cron
-- Date: 2026-02-01
-- Description: Creates pg_cron job to automatically remove inactive room
--              members (last_seen > 2 minutes) every 2 minutes.
-- Dependency: Migration 003 (reorder_room_members function)
-- ============================================================================

-- Enable pg_cron extension
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Cleanup function
CREATE OR REPLACE FUNCTION cleanup_inactive_room_members()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    affected_room_id uuid;
BEGIN
    FOR affected_room_id IN
        SELECT DISTINCT room_id
        FROM baiyezhan_room_members
        WHERE last_seen < NOW() - INTERVAL '2 minutes'
    LOOP
        -- Delete inactive members
        DELETE FROM baiyezhan_room_members
        WHERE room_id = affected_room_id
        AND last_seen < NOW() - INTERVAL '2 minutes';

        -- Reorder remaining members to close gaps
        PERFORM reorder_room_members(affected_room_id);
    END LOOP;
END;
$$;

-- Schedule: every 2 minutes
SELECT cron.schedule(
    'cleanup-inactive-members',
    '*/2 * * * *',
    'SELECT cleanup_inactive_room_members()'
);

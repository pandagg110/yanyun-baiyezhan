-- Zombie Cleanup Cron Job
-- Runs every 2 minutes to clean up inactive room members (last_seen > 2 minutes)

-- Enable pg_cron extension (usually already enabled on Supabase)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Create cleanup function
CREATE OR REPLACE FUNCTION cleanup_inactive_room_members()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    affected_room_id uuid;
BEGIN
    -- Get distinct room_ids that have inactive members (last_seen > 2 minutes ago)
    FOR affected_room_id IN
        SELECT DISTINCT room_id 
        FROM baiyezhan_room_members 
        WHERE last_seen < NOW() - INTERVAL '2 minutes'
    LOOP
        -- Delete inactive members from this room
        DELETE FROM baiyezhan_room_members
        WHERE room_id = affected_room_id
        AND last_seen < NOW() - INTERVAL '2 minutes';
        
        -- Reorder remaining members to close gaps in order_index
        PERFORM reorder_room_members(affected_room_id);
    END LOOP;
END;
$$;

-- Schedule cron job to run every 2 minutes
-- Note: This requires pg_cron to be enabled in Supabase Dashboard > Database > Extensions
SELECT cron.schedule(
    'cleanup-inactive-members',  -- job name (unique identifier)
    '*/2 * * * *',               -- cron expression: every 2 minutes
    'SELECT cleanup_inactive_room_members()'
);

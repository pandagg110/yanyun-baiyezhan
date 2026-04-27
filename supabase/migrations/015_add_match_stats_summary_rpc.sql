-- Migration 015: add get_match_stats_summary RPC function
--
-- Returns per-match player count and submitted teams in a single
-- aggregated query, replacing the previous approach of fetching
-- all stats rows and counting in JS (which hit Supabase's 1000-row
-- default limit when total stats exceeded that threshold).
--
-- Usage from Supabase JS client:
--   supabase.rpc('get_match_stats_summary', { match_ids: [...] })
--
-- Returns one row per match_id:
--   { match_id, stats_count, submitted_teams }

CREATE OR REPLACE FUNCTION get_match_stats_summary(match_ids uuid[])
RETURNS TABLE (
  match_id       uuid,
  stats_count    bigint,
  submitted_teams text[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    s.match_id,
    COUNT(*)::bigint                 AS stats_count,
    ARRAY_AGG(DISTINCT s.team_name)  AS submitted_teams
  FROM baiyezhan_match_stats s
  WHERE s.match_id = ANY(match_ids)
  GROUP BY s.match_id;
$$;

-- Grant execute to anon and authenticated roles (same as other tables)
GRANT EXECUTE ON FUNCTION get_match_stats_summary(uuid[]) TO anon;
GRANT EXECUTE ON FUNCTION get_match_stats_summary(uuid[]) TO authenticated;

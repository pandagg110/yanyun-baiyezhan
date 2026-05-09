-- ============================================================================
-- Migration 016: Analysis Aggregation RPC Functions
-- Date: 2026-04-28
-- Description:
--   Creates two PostgreSQL functions for server-side aggregation of match data,
--   eliminating the need to fetch all raw rows to the frontend.
--   1. fn_analysis_player_aggs: Aggregates per-player stats (KD, avg coin ratio, etc.)
--   2. fn_analysis_match_summaries: Returns match list with our-team aggregated metrics
-- Dependency: Migration 012 (baiyezhan_matches redesign + match_stats team_name)
-- ============================================================================

-- ═══════════════════════════════════════════════
-- PART A: Player Aggregation Function
-- ═══════════════════════════════════════════════
-- Returns one row per player with aggregated combat stats.
-- Only counts stats where team_name = p_baiye_name (our team).

CREATE OR REPLACE FUNCTION public.fn_analysis_player_aggs(
    p_baiye_name text,
    p_match_type text DEFAULT NULL,
    p_since timestamptz DEFAULT NULL
)
RETURNS TABLE (
    player_name text,
    matches_played bigint,
    total_kills bigint,
    total_assists bigint,
    total_deaths bigint,
    total_coins bigint,
    total_building_damage numeric,
    total_healing numeric,
    total_damage numeric,
    total_damage_taken numeric,
    avg_coin_ratio double precision,
    avg_building double precision,
    avg_healing double precision,
    kd double precision
)
LANGUAGE sql STABLE
AS $$
    SELECT
        s.player_name,
        COUNT(DISTINCT s.match_id)                                  AS matches_played,
        SUM(s.kills)::bigint                                        AS total_kills,
        SUM(s.assists)::bigint                                      AS total_assists,
        SUM(s.deaths)::bigint                                       AS total_deaths,
        SUM(s.coins)::bigint                                        AS total_coins,
        SUM(s.building_damage)                                      AS total_building_damage,
        SUM(s.healing)                                              AS total_healing,
        SUM(s.damage)                                               AS total_damage,
        SUM(s.damage_taken)                                         AS total_damage_taken,
        -- avg coin ratio = AVG(coins / coin_value) per match
        AVG(s.coins::double precision / GREATEST(COALESCE(m.coin_value, 792), 1))
                                                                    AS avg_coin_ratio,
        AVG(s.building_damage::double precision)                    AS avg_building,
        AVG(s.healing::double precision)                            AS avg_healing,
        -- KD = total_kills / max(total_deaths, 1)
        SUM(s.kills)::double precision / GREATEST(SUM(s.deaths), 1) AS kd
    FROM public.baiyezhan_match_stats s
    JOIN public.baiyezhan_matches m ON m.id = s.match_id
    WHERE s.team_name = p_baiye_name
      AND (m.team_a = p_baiye_name OR m.team_b = p_baiye_name)
      AND (p_match_type IS NULL OR p_match_type = '全部' OR m.match_type = p_match_type)
      AND (p_since IS NULL OR m.match_start_time >= p_since)
    GROUP BY s.player_name
    ORDER BY kd DESC;
$$;


-- ═══════════════════════════════════════════════
-- PART B: Match Summaries Function
-- ═══════════════════════════════════════════════
-- Returns one row per match with summary-level aggregated metrics
-- for our team (the p_baiye_name side).

CREATE OR REPLACE FUNCTION public.fn_analysis_match_summaries(
    p_baiye_name text,
    p_match_type text DEFAULT NULL,
    p_since timestamptz DEFAULT NULL
)
RETURNS TABLE (
    match_id uuid,
    team_a text,
    team_b text,
    winner text,
    match_type text,
    match_start_time timestamptz,
    coin_value integer,
    player_count bigint,
    avg_coin_ratio double precision,
    avg_building double precision,
    team_kd double precision
)
LANGUAGE sql STABLE
AS $$
    SELECT
        m.id                                                        AS match_id,
        m.team_a,
        m.team_b,
        m.winner,
        m.match_type,
        m.match_start_time,
        COALESCE(m.coin_value, 792)                                 AS coin_value,
        COUNT(s.id)                                                 AS player_count,
        AVG(s.coins::double precision / GREATEST(COALESCE(m.coin_value, 792), 1))
                                                                    AS avg_coin_ratio,
        AVG(s.building_damage::double precision)                    AS avg_building,
        SUM(s.kills)::double precision / GREATEST(SUM(s.deaths), 1) AS team_kd
    FROM public.baiyezhan_matches m
    LEFT JOIN public.baiyezhan_match_stats s
        ON s.match_id = m.id AND s.team_name = p_baiye_name
    WHERE (m.team_a = p_baiye_name OR m.team_b = p_baiye_name)
      AND (p_match_type IS NULL OR p_match_type = '全部' OR m.match_type = p_match_type)
      AND (p_since IS NULL OR m.match_start_time >= p_since)
    GROUP BY m.id, m.team_a, m.team_b, m.winner, m.match_type, m.match_start_time, m.coin_value
    ORDER BY m.match_start_time ASC;
$$;

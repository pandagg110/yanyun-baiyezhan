import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/analysis/player-trend?baiye_name=xxx&player_name=xxx&match_type=排位&period=30
 *
 * Returns per-match performance data for a single player (for trend charts).
 * Called on-demand when the user clicks a player name to view their trend chart.
 */
export async function GET(request: NextRequest) {
    try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        if (!supabaseUrl || !supabaseKey) {
            return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
        }

        const supabase = createClient(supabaseUrl, supabaseKey);
        const { searchParams } = new URL(request.url);
        const baiyeName = searchParams.get('baiye_name');
        const playerName = searchParams.get('player_name');
        const matchType = searchParams.get('match_type');
        const period = searchParams.get('period');

        if (!baiyeName || !playerName) {
            return NextResponse.json(
                { error: 'Missing required params: baiye_name, player_name' },
                { status: 400 }
            );
        }

        // Build since date
        let since: string | null = null;
        if (period) {
            const days = parseInt(period);
            if (!isNaN(days) && days > 0) {
                since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
            }
        }

        // Get all match IDs for this baiye (filtered)
        let matchQuery = supabase
            .from('baiyezhan_matches')
            .select('id, team_a, team_b, winner, match_type, match_start_time, coin_value')
            .or(`team_a.eq.${baiyeName},team_b.eq.${baiyeName}`)
            .order('match_start_time', { ascending: true });

        if (matchType && matchType !== '全部') {
            matchQuery = matchQuery.eq('match_type', matchType);
        }
        if (since) {
            matchQuery = matchQuery.gte('match_start_time', since);
        }

        const { data: matches, error: matchError } = await matchQuery;

        if (matchError) {
            console.error('Player trend match query error:', matchError);
            return NextResponse.json(
                { error: 'Match query failed: ' + matchError.message },
                { status: 500 }
            );
        }

        if (!matches || matches.length === 0) {
            return NextResponse.json({ trend: [] });
        }

        const matchIds = matches.map(m => m.id);

        // Get this player's stats for all those matches
        const { data: stats, error: statsError } = await supabase
            .from('baiyezhan_match_stats')
            .select('*')
            .in('match_id', matchIds)
            .eq('player_name', playerName)
            .eq('team_name', baiyeName);

        if (statsError) {
            console.error('Player trend stats query error:', statsError);
            return NextResponse.json(
                { error: 'Stats query failed: ' + statsError.message },
                { status: 500 }
            );
        }

        // Build trend data by joining stats with match info
        const matchMap = new Map(matches.map(m => [m.id, m]));
        const trend = (stats || [])
            .map(s => {
                const m = matchMap.get(s.match_id);
                if (!m) return null;
                const cv = m.coin_value || 720;
                return {
                    match_id: m.id,
                    team_a: m.team_a,
                    team_b: m.team_b,
                    winner: m.winner,
                    match_type: m.match_type,
                    match_start_time: m.match_start_time,
                    coin_value: cv,
                    // Player stat data
                    kills: s.kills,
                    assists: s.assists,
                    deaths: s.deaths,
                    coins: s.coins,
                    damage: s.damage,
                    damage_taken: s.damage_taken,
                    healing: s.healing,
                    building_damage: s.building_damage,
                    // Computed
                    coin_ratio: (s.coins || 0) / cv,
                    kda: (s.kills || 0) / Math.max(s.deaths || 0, 1),
                };
            })
            .filter(Boolean)
            .sort((a, b) => new Date(a!.match_start_time).getTime() - new Date(b!.match_start_time).getTime());

        return NextResponse.json({ trend });
    } catch (error: unknown) {
        console.error('Player Trend API Error:', error);
        const message = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

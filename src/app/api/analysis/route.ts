import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/analysis?baiye_name=xxx&match_type=排位&period=30
 *
 * Returns SERVER-SIDE AGGREGATED data:
 *   - player_aggs[]: per-player aggregated stats (one row per player)
 *   - match_summaries[]: per-match summary with our-team metrics
 *
 * This replaces the old approach of returning all raw matches + stats,
 * which hit the Supabase 1000-row limit and caused data loss.
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
        const matchType = searchParams.get('match_type'); // 排位|正赛|约战 or empty for all
        const period = searchParams.get('period'); // 7|30|90 days, or empty for all

        if (!baiyeName) {
            return NextResponse.json(
                { error: 'Missing required query param: baiye_name' },
                { status: 400 }
            );
        }

        // Compute "since" date from period
        let since: string | null = null;
        if (period) {
            const days = parseInt(period);
            if (!isNaN(days) && days > 0) {
                since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
            }
        }

        // Call the two RPC functions in parallel
        const rpcMatchType = (matchType && matchType !== '全部') ? matchType : null;

        const [playerAggsResult, matchSummariesResult] = await Promise.all([
            supabase.rpc('fn_analysis_player_aggs', {
                p_baiye_name: baiyeName,
                p_match_type: rpcMatchType,
                p_since: since,
            }),
            supabase.rpc('fn_analysis_match_summaries', {
                p_baiye_name: baiyeName,
                p_match_type: rpcMatchType,
                p_since: since,
            }),
        ]);

        if (playerAggsResult.error) {
            console.error('Player aggs RPC error:', playerAggsResult.error);
            // Fallback: if RPC doesn't exist yet, use the legacy approach
            return await legacyFetch(supabase, baiyeName, matchType, period);
        }

        if (matchSummariesResult.error) {
            console.error('Match summaries RPC error:', matchSummariesResult.error);
            return await legacyFetch(supabase, baiyeName, matchType, period);
        }

        const playerAggs = playerAggsResult.data || [];
        const matchSummaries = matchSummariesResult.data || [];

        return NextResponse.json({
            player_aggs: playerAggs,
            match_summaries: matchSummaries,
            total_matches: matchSummaries.length,
            total_players: playerAggs.length,
        });
    } catch (error: unknown) {
        console.error('Analysis API Error:', error);
        const message = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

/**
 * Legacy fallback: if RPC functions haven't been deployed yet,
 * fall back to the original raw-data approach.
 * This ensures the app doesn't break during the migration transition.
 */
async function legacyFetch(
    supabase: ReturnType<typeof createClient>,
    baiyeName: string,
    matchType: string | null,
    period: string | null,
) {
    console.warn('⚠️ Using legacy analysis fetch (RPC not available). Deploy migration 016 to fix.');

    let query = supabase
        .from('baiyezhan_matches')
        .select('*')
        .or(`team_a.eq.${baiyeName},team_b.eq.${baiyeName}`)
        .order('match_start_time', { ascending: true });

    if (matchType && matchType !== '全部') {
        query = query.eq('match_type', matchType);
    }

    if (period) {
        const days = parseInt(period);
        if (!isNaN(days) && days > 0) {
            const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
            query = query.gte('match_start_time', since);
        }
    }

    const { data: matches, error: matchError } = await query;

    if (matchError) {
        return NextResponse.json(
            { error: 'Query failed: ' + matchError.message },
            { status: 500 }
        );
    }

    if (!matches || matches.length === 0) {
        return NextResponse.json({
            player_aggs: [],
            match_summaries: [],
            total_matches: 0,
            total_players: 0,
            _legacy: true,
            matches: [],
            stats: [],
        });
    }

    const matchIds = matches.map(m => m.id);
    const { data: stats, error: statsError } = await supabase
        .from('baiyezhan_match_stats')
        .select('*')
        .in('match_id', matchIds)
        .order('match_id')
        .order('team_name')
        .order('kills', { ascending: false });

    if (statsError) {
        return NextResponse.json(
            { error: 'Stats query failed: ' + statsError.message },
            { status: 500 }
        );
    }

    // Return legacy format alongside new fields so front-end can handle both
    return NextResponse.json({
        _legacy: true,
        matches,
        stats: stats || [],
        player_aggs: [],
        match_summaries: [],
        total_matches: matches.length,
        total_players: 0,
    });
}

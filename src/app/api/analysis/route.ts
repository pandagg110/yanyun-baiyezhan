import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/analysis?baiye_name=xxx&match_type=排位&period=30
 * 
 * Returns all matches + all player stats for a baiye,
 * filtered by match_type and time period.
 * The frontend will compute aggregations (KDA, avg coins, etc).
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

        // Build match query
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
            console.error('Analysis match query error:', matchError);
            return NextResponse.json(
                { error: 'Query failed: ' + matchError.message },
                { status: 500 }
            );
        }

        if (!matches || matches.length === 0) {
            return NextResponse.json({ matches: [], stats: [] });
        }

        // Get all stats for these matches in one query
        const matchIds = matches.map(m => m.id);
        const { data: stats, error: statsError } = await supabase
            .from('baiyezhan_match_stats')
            .select('*')
            .in('match_id', matchIds)
            .order('match_id')
            .order('team_name')
            .order('kills', { ascending: false });

        if (statsError) {
            console.error('Analysis stats query error:', statsError);
            return NextResponse.json(
                { error: 'Stats query failed: ' + statsError.message },
                { status: 500 }
            );
        }

        return NextResponse.json({
            matches,
            stats: stats || [],
        });
    } catch (error: unknown) {
        console.error('Analysis API Error:', error);
        const message = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

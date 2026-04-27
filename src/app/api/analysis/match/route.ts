import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/analysis/match?match_id=xxx
 *
 * Returns full stats for a single match (both teams).
 * Called on-demand when the user expands a match in the UI.
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
        const matchId = searchParams.get('match_id');

        if (!matchId) {
            return NextResponse.json(
                { error: 'Missing required query param: match_id' },
                { status: 400 }
            );
        }

        // Get the match record
        const { data: match, error: matchError } = await supabase
            .from('baiyezhan_matches')
            .select('*')
            .eq('id', matchId)
            .single();

        if (matchError || !match) {
            return NextResponse.json(
                { error: 'Match not found' },
                { status: 404 }
            );
        }

        // Get all stats for this match
        const { data: stats, error: statsError } = await supabase
            .from('baiyezhan_match_stats')
            .select('*')
            .eq('match_id', matchId)
            .order('team_name')
            .order('kills', { ascending: false });

        if (statsError) {
            console.error('Match detail stats query error:', statsError);
            return NextResponse.json(
                { error: 'Stats query failed: ' + statsError.message },
                { status: 500 }
            );
        }

        return NextResponse.json({
            match,
            stats: stats || [],
        });
    } catch (error: unknown) {
        console.error('Match Detail API Error:', error);
        const message = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

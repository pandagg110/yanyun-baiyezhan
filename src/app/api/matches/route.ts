import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Match Key Algorithm:
 * sorted(team_a, team_b) joined by '|', then '|' + time truncated to minute
 */
function computeMatchKey(teamA: string, teamB: string, startTime: string): string {
    const sorted = [teamA, teamB].sort();
    const timePart = new Date(startTime).toISOString().slice(0, 16);
    return `${sorted[0]}|${sorted[1]}|${timePart}`;
}

function getSupabase(authHeader: string | null) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    return createClient(supabaseUrl, supabaseKey, {
        global: { headers: authHeader ? { Authorization: authHeader } : {} },
    });
}

/**
 * POST /api/matches
 *
 * Two modes of operation:
 * 1. Create/find a match — body has team_a, team_b, match_start_time (no players)
 * 2. Submit team stats   — body has match_id, team_name, players[]
 */
export async function POST(request: NextRequest) {
    try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        if (!supabaseUrl || !supabaseKey) {
            return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
        }

        const authHeader = request.headers.get('authorization');
        const supabase = getSupabase(authHeader);
        const body = await request.json();

        // ─── Mode 2: Submit team stats ───
        if (body.match_id && body.team_name && body.players) {
            const { match_id, team_name, players, screenshot_urls } = body;

            if (!players || players.length === 0) {
                return NextResponse.json(
                    { error: 'No player data to submit' },
                    { status: 400 }
                );
            }

            // Check if this team already submitted
            const { count: existingCount } = await supabase
                .from('baiyezhan_match_stats')
                .select('*', { count: 'exact', head: true })
                .eq('match_id', match_id)
                .eq('team_name', team_name);

            if (existingCount && existingCount > 0) {
                return NextResponse.json(
                    { error: `${team_name} 的数据已提交过，不可重复提交` },
                    { status: 409 }
                );
            }

            // Insert player stats with team_name
            const statsRows = players.map((p: {
                player_name: string;
                kills?: number;
                assists?: number;
                deaths?: number;
                coins?: number;
                damage?: number;
                damage_taken?: number;
                healing?: number;
                building_damage?: number;
            }) => ({
                match_id,
                team_name,
                player_name: p.player_name,
                kills: p.kills || 0,
                assists: p.assists || 0,
                deaths: p.deaths || 0,
                coins: p.coins || 0,
                damage: p.damage || 0,
                damage_taken: p.damage_taken || 0,
                healing: p.healing || 0,
                building_damage: p.building_damage || 0,
            }));

            const { error: statsError } = await supabase
                .from('baiyezhan_match_stats')
                .insert(statsRows);

            if (statsError) {
                console.error('Stats insert error:', statsError);
                return NextResponse.json(
                    { error: 'Failed to insert stats: ' + statsError.message },
                    { status: 500 }
                );
            }

            // Save screenshot evidence records
            if (screenshot_urls && screenshot_urls.length > 0) {
                // Get current user for uploaded_by
                const { data: { user: authUser } } = await supabase.auth.getUser();

                const screenshotRows = screenshot_urls.map((url: string) => ({
                    match_id,
                    team_name,
                    image_url: url,
                    uploaded_by: authUser?.id || null,
                }));

                const { error: ssError } = await supabase
                    .from('baiyezhan_match_screenshots')
                    .insert(screenshotRows);

                if (ssError) {
                    console.error('Screenshot insert error:', ssError);
                    // Non-fatal: stats already saved, just log the error
                }
            }

            return NextResponse.json({
                status: 'stats_submitted',
                team_name,
                players_count: statsRows.length,
            });
        }

        // ─── Mode 1: Create or find match ───
        const {
            team_a, team_b, match_start_time, match_type, coin_value,
            winner, baiye_id, notes, created_by,
        } = body;

        if (!team_a || !team_b || !match_start_time) {
            return NextResponse.json(
                { error: 'Missing required fields: team_a, team_b, match_start_time' },
                { status: 400 }
            );
        }

        const matchKey = computeMatchKey(team_a, team_b, match_start_time);

        // Check existing
        const { data: existing } = await supabase
            .from('baiyezhan_matches')
            .select('*')
            .eq('match_key', matchKey)
            .single();

        if (existing) {
            // Get per-team submission status
            const { data: teamStats } = await supabase
                .from('baiyezhan_match_stats')
                .select('team_name')
                .eq('match_id', existing.id);

            const submittedTeams = [...new Set((teamStats || []).map(s => s.team_name))];

            return NextResponse.json({
                status: 'exists',
                match: existing,
                submitted_teams: submittedTeams,
            });
        }

        // Create new match
        const { data: match, error: matchError } = await supabase
            .from('baiyezhan_matches')
            .insert({
                baiye_id: baiye_id || null,
                team_a,
                team_b,
                match_start_time: new Date(match_start_time).toISOString(),
                match_type: match_type || '排位',
                coin_value: coin_value ?? 720,
                winner: winner || null,
                notes: notes || null,
                created_by: created_by || null,
            })
            .select()
            .single();

        if (matchError) {
            console.error('Match insert error:', matchError);
            return NextResponse.json(
                { error: 'Failed to create match: ' + matchError.message },
                { status: 500 }
            );
        }

        return NextResponse.json({
            status: 'created',
            match,
            submitted_teams: [],
        });
    } catch (error: unknown) {
        console.error('Match API Error:', error);
        const message = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

/**
 * GET /api/matches?baiye_name=xxx
 * Query all matches involving a baiye (as team_a or team_b).
 */
export async function GET(request: NextRequest) {
    try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        if (!supabaseUrl || !supabaseKey) {
            return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
        }

        const supabase = getSupabase(null);
        const { searchParams } = new URL(request.url);
        const baiyeName = searchParams.get('baiye_name');

        if (!baiyeName) {
            return NextResponse.json(
                { error: 'Missing required query param: baiye_name' },
                { status: 400 }
            );
        }

        const { data: matches, error } = await supabase
            .from('baiyezhan_matches')
            .select('*')
            .or(`team_a.eq.${baiyeName},team_b.eq.${baiyeName}`)
            .order('match_start_time', { ascending: false });

        if (error) {
            console.error('Match query error:', error);
            return NextResponse.json(
                { error: 'Query failed: ' + error.message },
                { status: 500 }
            );
        }

        // Batch-fetch all stats in ONE query (fixes N+1 performance issue)
        // NOTE: Supabase default row limit is 1000. For large datasets (e.g. 60 players × many matches),
        // we must explicitly set a high enough limit to avoid silently truncating results.
        const matchIds = (matches || []).map(m => m.id);
        const { data: allStats } = matchIds.length > 0
            ? await supabase
                .from('baiyezhan_match_stats')
                .select('match_id, team_name')
                .in('match_id', matchIds)
                .limit(10000)
            : { data: [] };

        // Group stats by match_id in memory
        const statsMap = new Map<string, Set<string>>();
        const countMap = new Map<string, number>();
        for (const s of (allStats || [])) {
            if (!statsMap.has(s.match_id)) statsMap.set(s.match_id, new Set());
            statsMap.get(s.match_id)!.add(s.team_name);
            countMap.set(s.match_id, (countMap.get(s.match_id) || 0) + 1);
        }

        const matchesWithInfo = (matches || []).map(m => ({
            ...m,
            stats_count: countMap.get(m.id) || 0,
            submitted_teams: [...(statsMap.get(m.id) || [])],
        }));

        return NextResponse.json({ matches: matchesWithInfo });
    } catch (error: unknown) {
        console.error('Match GET Error:', error);
        const message = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

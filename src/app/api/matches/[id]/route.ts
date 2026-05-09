import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/matches/[id]
 * Get a single match with player stats grouped by team.
 */
export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        if (!supabaseUrl || !supabaseKey) {
            return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
        }

        const supabase = createClient(supabaseUrl, supabaseKey);

        // Get match
        const { data: match, error: matchError } = await supabase
            .from('baiyezhan_matches')
            .select('*')
            .eq('id', id)
            .single();

        if (matchError || !match) {
            return NextResponse.json(
                { error: 'Match not found' },
                { status: 404 }
            );
        }

        // Get player stats (ordered by team, then kills desc)
        const { data: stats, error: statsError } = await supabase
            .from('baiyezhan_match_stats')
            .select('*')
            .eq('match_id', id)
            .order('team_name', { ascending: true })
            .order('kills', { ascending: false });

        if (statsError) {
            console.error('Stats query error:', statsError);
        }

        // Group stats by team
        const allStats = stats || [];
        const teamAStats = allStats.filter(s => s.team_name === match.team_a);
        const teamBStats = allStats.filter(s => s.team_name === match.team_b);
        const submittedTeams = [...new Set(allStats.map(s => s.team_name))];

        // Get screenshots
        const { data: screenshots } = await supabase
            .from('baiyezhan_match_screenshots')
            .select('*')
            .eq('match_id', id)
            .order('created_at', { ascending: true });

        return NextResponse.json({
            match,
            stats: allStats,
            team_a_stats: teamAStats,
            team_b_stats: teamBStats,
            submitted_teams: submittedTeams,
            screenshots: screenshots || [],
        });
    } catch (error: unknown) {
        console.error('Match detail error:', error);
        const message = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

/**
 * DELETE /api/matches/[id]
 * Admin-only: delete a match and all its stats (cascading).
 */
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        if (!supabaseUrl || !supabaseKey) {
            return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
        }

        const authHeader = request.headers.get('authorization');
        const supabase = createClient(supabaseUrl, supabaseKey, {
            global: { headers: authHeader ? { Authorization: authHeader } : {} },
        });

        // Verify the caller is admin
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: '未登录' }, { status: 401 });
        }

        const { data: dbUser } = await supabase
            .from('baiyezhan_users')
            .select('role')
            .eq('id', user.id)
            .single();

        if (!dbUser || dbUser.role !== 'admin') {
            return NextResponse.json({ error: '仅管理员可删除对局' }, { status: 403 });
        }

        // Delete match (stats cascade via FK)
        const { error: delError } = await supabase
            .from('baiyezhan_matches')
            .delete()
            .eq('id', id);

        if (delError) {
            console.error('Delete match error:', delError);
            return NextResponse.json(
                { error: '删除失败: ' + delError.message },
                { status: 500 }
            );
        }

        return NextResponse.json({ status: 'deleted' });
    } catch (error: unknown) {
        console.error('Match delete error:', error);
        const message = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

/**
 * PATCH /api/matches/[id]
 * Update match fields (currently supports roster_id binding).
 */
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        if (!supabaseUrl || !supabaseKey) {
            return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
        }

        const authHeader = request.headers.get('authorization');
        const supabase = createClient(supabaseUrl, supabaseKey, {
            global: { headers: authHeader ? { Authorization: authHeader } : {} },
        });

        // Verify the caller is admin or vip
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: '未登录' }, { status: 401 });
        }

        const body = await request.json();
        const updates: Record<string, unknown> = {};

        if ('roster_id' in body) {
            updates.roster_id = body.roster_id || null;
        }
        if ('big_dragon_team' in body) {
            updates.big_dragon_team = body.big_dragon_team || null;
        }
        if ('small_dragon_team' in body) {
            updates.small_dragon_team = body.small_dragon_team || null;
        }

        if (Object.keys(updates).length === 0) {
            return NextResponse.json({ error: '无更新字段' }, { status: 400 });
        }

        const { data: match, error: updateError } = await supabase
            .from('baiyezhan_matches')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (updateError) {
            console.error('Match update error:', updateError);
            return NextResponse.json(
                { error: '更新失败: ' + updateError.message },
                { status: 500 }
            );
        }

        return NextResponse.json({ status: 'updated', match });
    } catch (error: unknown) {
        console.error('Match PATCH error:', error);
        const message = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

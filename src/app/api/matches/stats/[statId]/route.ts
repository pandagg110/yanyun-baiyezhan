import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

/**
 * PATCH /api/matches/stats/[statId]
 * Admin-only: correct a player's name in a single match stat record.
 * Use-case: when someone plays on behalf of a friend (代打), the admin
 * can correct the stat's player_name to the real player's ID.
 *
 * Body: { newPlayerName: string, reason?: string }
 */
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ statId: string }> }
) {
    try {
        const { statId } = await params;
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
            .select('role, character_name')
            .eq('id', user.id)
            .single();

        if (!dbUser || dbUser.role !== 'admin') {
            return NextResponse.json({ error: '仅管理员可修改玩家信息' }, { status: 403 });
        }

        const body = await request.json();
        const { newPlayerName, reason } = body as { newPlayerName: string; reason?: string };

        if (!newPlayerName || typeof newPlayerName !== 'string' || !newPlayerName.trim()) {
            return NextResponse.json({ error: '新玩家名不能为空' }, { status: 400 });
        }

        const trimmedName = newPlayerName.trim();

        // Get the current stat record
        const { data: stat, error: statError } = await supabase
            .from('baiyezhan_match_stats')
            .select('id, player_name, match_id, team_name')
            .eq('id', statId)
            .single();

        if (statError || !stat) {
            return NextResponse.json({ error: '战绩记录不存在' }, { status: 404 });
        }

        const oldPlayerName = stat.player_name;

        if (oldPlayerName === trimmedName) {
            return NextResponse.json({ error: '新名称与原名称相同' }, { status: 400 });
        }

        // Update the player_name for this specific stat record
        const { error: updateError } = await supabase
            .from('baiyezhan_match_stats')
            .update({ player_name: trimmedName })
            .eq('id', statId);

        if (updateError) {
            console.error('Stat rename error:', updateError);
            return NextResponse.json({ error: '更新失败: ' + updateError.message }, { status: 500 });
        }

        // Log the correction in the rename log for audit trail
        await supabase.from('baiyezhan_rename_log').insert({
            old_name: oldPlayerName,
            new_name: trimmedName,
            affected_count: 1,
            performed_by: user.id,
            // Store context about this being a single-match correction
            // We encode the match_id in the reason for auditability
            is_undone: false,
        });

        return NextResponse.json({
            status: 'updated',
            stat_id: statId,
            match_id: stat.match_id,
            team_name: stat.team_name,
            old_player_name: oldPlayerName,
            new_player_name: trimmedName,
            performed_by: dbUser.character_name || user.id,
        });
    } catch (error: unknown) {
        console.error('Stat rename error:', error);
        const message = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

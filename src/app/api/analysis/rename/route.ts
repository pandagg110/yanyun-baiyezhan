import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Helper: Create authenticated supabase client + verify admin.
 * Returns { supabase, userId } or a NextResponse error.
 */
async function getAdminClient(request: NextRequest) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseKey) {
        return { error: NextResponse.json({ error: 'Supabase not configured' }, { status: 500 }) };
    }

    const authHeader = request.headers.get('authorization');
    const supabase = createClient(supabaseUrl, supabaseKey, {
        global: { headers: authHeader ? { Authorization: authHeader } : {} },
    });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return { error: NextResponse.json({ error: '未登录' }, { status: 401 }) };
    }

    const { data: dbUser } = await supabase
        .from('baiyezhan_users')
        .select('role')
        .eq('id', user.id)
        .single();

    if (!dbUser || dbUser.role !== 'admin') {
        return { error: NextResponse.json({ error: '仅管理员可执行此操作' }, { status: 403 }) };
    }

    return { supabase, userId: user.id };
}


/**
 * GET /api/analysis/rename
 * Get rename history log (recent 50, newest first).
 */
export async function GET(request: NextRequest) {
    try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        if (!supabaseUrl || !supabaseKey) {
            return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
        }

        const supabase = createClient(supabaseUrl, supabaseKey);

        const { data: logs, error } = await supabase
            .from('baiyezhan_rename_log')
            .select('*, performer:baiyezhan_users!performed_by(character_name)')
            .order('performed_at', { ascending: false })
            .limit(50);

        if (error) {
            console.error('Rename log query error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ logs: logs || [] });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}


/**
 * POST /api/analysis/rename
 * Admin-only: Rename a player across all match_stats records.
 * Body: { oldName: string, newName: string }
 * 
 * Also logs the operation to baiyezhan_rename_log.
 */
export async function POST(request: NextRequest) {
    try {
        const result = await getAdminClient(request);
        if ('error' in result) return result.error;
        const { supabase, userId } = result;

        const body = await request.json();
        const { oldName, newName } = body;

        if (!oldName || !newName || oldName.trim() === '' || newName.trim() === '') {
            return NextResponse.json({ error: '旧名和新名不能为空' }, { status: 400 });
        }

        if (oldName.trim() === newName.trim()) {
            return NextResponse.json({ error: '新旧名字相同' }, { status: 400 });
        }

        // 1. Perform the rename
        const { data, error: updateError } = await supabase
            .from('baiyezhan_match_stats')
            .update({ player_name: newName.trim() })
            .eq('player_name', oldName.trim())
            .select('id');

        if (updateError) {
            console.error('Rename update error:', updateError);
            return NextResponse.json(
                { error: '更新失败: ' + updateError.message },
                { status: 500 }
            );
        }

        const count = data?.length || 0;

        // 2. Log the operation
        const { error: logError } = await supabase
            .from('baiyezhan_rename_log')
            .insert({
                old_name: oldName.trim(),
                new_name: newName.trim(),
                affected_count: count,
                performed_by: userId,
            });

        if (logError) {
            console.error('Rename log insert error:', logError);
            // Non-fatal: the rename succeeded, just logging failed
        }

        return NextResponse.json({
            status: 'ok',
            updated: count,
            message: `已将 "${oldName}" 重命名为 "${newName}"，共更新 ${count} 条记录`,
        });
    } catch (error: unknown) {
        console.error('Rename API Error:', error);
        const message = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}


/**
 * PUT /api/analysis/rename
 * Admin-only: Undo the most recent non-undone rename operation.
 * Stack-based: only the latest non-undone entry can be reverted.
 * Body: { logId: string }  — must match the most recent non-undone entry.
 */
export async function PUT(request: NextRequest) {
    try {
        const result = await getAdminClient(request);
        if ('error' in result) return result.error;
        const { supabase } = result;

        const body = await request.json();
        const { logId } = body;

        if (!logId) {
            return NextResponse.json({ error: '缺少 logId' }, { status: 400 });
        }

        // 1. Find the most recent non-undone entry
        const { data: latest, error: queryErr } = await supabase
            .from('baiyezhan_rename_log')
            .select('*')
            .eq('is_undone', false)
            .order('performed_at', { ascending: false })
            .limit(1)
            .single();

        if (queryErr || !latest) {
            return NextResponse.json({ error: '没有可撤销的操作' }, { status: 400 });
        }

        // 2. Verify it's the one the user wants to undo (stack order)
        if (latest.id !== logId) {
            return NextResponse.json(
                { error: '只能撤销最近一条操作，请按顺序撤销' },
                { status: 400 }
            );
        }

        // 3. Reverse the rename: new_name → old_name
        const { data: reversed, error: reverseErr } = await supabase
            .from('baiyezhan_match_stats')
            .update({ player_name: latest.old_name })
            .eq('player_name', latest.new_name)
            .select('id');

        if (reverseErr) {
            console.error('Undo rename error:', reverseErr);
            return NextResponse.json(
                { error: '撤销失败: ' + reverseErr.message },
                { status: 500 }
            );
        }

        // 4. Mark entry as undone
        const { error: markErr } = await supabase
            .from('baiyezhan_rename_log')
            .update({ is_undone: true, undone_at: new Date().toISOString() })
            .eq('id', logId);

        if (markErr) {
            console.error('Mark undo error:', markErr);
        }

        const undoneCount = reversed?.length || 0;
        return NextResponse.json({
            status: 'undone',
            updated: undoneCount,
            message: `已撤销: "${latest.new_name}" → "${latest.old_name}"，共还原 ${undoneCount} 条记录`,
        });
    } catch (error: unknown) {
        console.error('Undo rename error:', error);
        const message = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

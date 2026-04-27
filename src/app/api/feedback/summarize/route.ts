import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const DOUBAO_API_URL = 'https://ark.cn-beijing.volces.com/api/v3/responses';
const DOUBAO_MODEL = 'doubao-seed-2-0-pro-260215';

const SYSTEM_PROMPT = `你是一个游戏运营分析专家。你的任务是分析玩家对《燕云十六声》百业战的反馈数据，并生成结构化的优化ToDo列表。

每条反馈包含：
- worst_experience: 最不好的体验
- improvement_suggestion: 最需要优化的建议
- good_parts: 做得好的地方（可能为空）
- player_role: 玩家身份（指挥/打手/后勤/其他，可能为空）

请分析所有反馈，合并相似问题，输出以下 JSON 格式：

{
  "todos": [
    {
      "title": "简短的优化标题（10字以内）",
      "description": "问题描述和建议的解决方向",
      "priority": "high|medium|low"
    }
  ]
}

关键规则：
1. 合并相似的反馈为一条ToDo，不要重复
2. 根据提及频率和影响程度判断优先级
3. 多人提到的问题优先级应该更高
4. 标题要简洁明了，描述要具体有用
5. 最多生成10条ToDo
6. 只返回 JSON，不要返回其他文字
7. priority 只能是 "high", "medium", "low" 三种
8. 如果有做得好的地方也可以生成 "维持/加强" 类型的低优先级 ToDo`;

/**
 * POST /api/feedback/summarize
 * 
 * 管理员触发 AI 批量总结反馈，生成 ToDo 列表
 * Body: { baiye_id, time_range: 'today' | 'recent_n' | 'custom', days?, start?, end? }
 */
export async function POST(request: NextRequest) {
    try {
        const apiKey = process.env.DOUBAO_API_KEY;
        if (!apiKey) {
            return NextResponse.json(
                { error: 'DOUBAO_API_KEY not configured' },
                { status: 500 }
            );
        }

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        if (!supabaseUrl || !supabaseKey) {
            return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
        }

        const supabase = createClient(supabaseUrl, supabaseKey);
        const body = await request.json();
        const { baiye_id, time_range, days, start, end } = body;

        if (!baiye_id) {
            return NextResponse.json(
                { error: 'Missing required field: baiye_id' },
                { status: 400 }
            );
        }

        // Build time range filter
        let startTime: string | undefined;
        let endTime: string | undefined;

        if (time_range === 'today') {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            startTime = today.toISOString();
        } else if (time_range === 'recent_n' && days) {
            const since = new Date(Date.now() - parseInt(days) * 24 * 60 * 60 * 1000);
            startTime = since.toISOString();
        } else if (time_range === 'custom') {
            startTime = start;
            endTime = end;
        }

        // Fetch feedbacks
        let query = supabase
            .from('baiyezhan_feedback')
            .select('*')
            .eq('baiye_id', baiye_id)
            .order('created_at', { ascending: true });

        if (startTime) {
            query = query.gte('created_at', startTime);
        }
        if (endTime) {
            query = query.lte('created_at', endTime);
        }

        const { data: feedbacks, error: feedbackError } = await query;

        if (feedbackError) {
            console.error('Feedback query error:', feedbackError);
            return NextResponse.json(
                { error: 'Failed to fetch feedbacks: ' + feedbackError.message },
                { status: 500 }
            );
        }

        if (!feedbacks || feedbacks.length === 0) {
            return NextResponse.json(
                { error: '该时间范围内没有反馈数据', count: 0 },
                { status: 400 }
            );
        }

        // Format feedbacks for AI
        const feedbackText = feedbacks.map((f, i) => {
            const parts = [
                `--- 反馈 #${i + 1} ---`,
                `最差体验: ${f.worst_experience}`,
                `优化建议: ${f.improvement_suggestion}`,
            ];
            if (f.good_parts) parts.push(`做得好的: ${f.good_parts}`);
            if (f.player_role) parts.push(`身份: ${f.player_role}`);
            return parts.join('\n');
        }).join('\n\n');

        // Call Doubao AI
        const res = await fetch(DOUBAO_API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: DOUBAO_MODEL,
                input: [
                    {
                        role: 'user',
                        content: [
                            {
                                type: 'input_text',
                                text: `${SYSTEM_PROMPT}\n\n以下是 ${feedbacks.length} 条玩家反馈数据，请分析并生成 ToDo 列表：\n\n${feedbackText}`,
                            },
                        ],
                    },
                ],
            }),
        });

        if (!res.ok) {
            const errText = await res.text();
            console.error('Doubao API error:', res.status, errText);
            return NextResponse.json(
                { error: `AI API error: ${res.status}` },
                { status: 502 }
            );
        }

        const result = await res.json();

        // Extract text from Doubao response
        let text = '';
        if (Array.isArray(result.output)) {
            for (const item of result.output) {
                if (item.type === 'message' && Array.isArray(item.content)) {
                    for (const part of item.content) {
                        if (part.type === 'output_text' && part.text) {
                            text += part.text;
                        }
                    }
                }
            }
        } else if (typeof result.output === 'string') {
            text = result.output;
        }

        if (!text) {
            console.error('Doubao returned empty response:', JSON.stringify(result));
            return NextResponse.json(
                { error: 'AI returned empty response' },
                { status: 502 }
            );
        }

        // Parse JSON from response
        let jsonStr = text;
        const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) {
            jsonStr = jsonMatch[1].trim();
        }

        const parsed = JSON.parse(jsonStr);

        if (!parsed.todos || !Array.isArray(parsed.todos)) {
            return NextResponse.json(
                { error: 'AI returned invalid format' },
                { status: 502 }
            );
        }

        // Write todos to database
        const todosToInsert = parsed.todos.map((todo: any) => ({
            baiye_id,
            title: todo.title,
            description: todo.description || null,
            priority: ['high', 'medium', 'low'].includes(todo.priority) ? todo.priority : 'medium',
            status: 'todo',
            batch_time_start: startTime || null,
            batch_time_end: endTime || new Date().toISOString(),
        }));

        const { data: insertedTodos, error: insertError } = await supabase
            .from('baiyezhan_todos')
            .insert(todosToInsert)
            .select();

        if (insertError) {
            console.error('Todo insert error:', insertError);
            return NextResponse.json(
                { error: 'Failed to save todos: ' + insertError.message },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            feedback_count: feedbacks.length,
            todos: insertedTodos,
        });
    } catch (error: unknown) {
        console.error('Summarize Error:', error);
        const message = error instanceof Error ? error.message : 'Summarize failed';
        return NextResponse.json(
            { error: message },
            { status: 500 }
        );
    }
}

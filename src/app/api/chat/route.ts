import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const DOUBAO_API_URL = 'https://ark.cn-beijing.volces.com/api/v3/responses';
const DOUBAO_MODEL = 'doubao-seed-2-0-pro-260215';

// ═══════════════════════════════════════
// SKILL DEFINITIONS
// ═══════════════════════════════════════

interface SkillCall {
    skill: string;
    args: Record<string, any>;
}

interface ReasoningStep {
    type: 'thinking' | 'skill_call' | 'skill_result' | 'answer';
    content: string;
    skill_name?: string;
    skill_args?: Record<string, any>;
    duration_ms?: number;
}

const SKILL_DEFINITIONS = `
你可以使用以下技能来查询数据。当你需要数据时，返回一个 JSON 格式的技能调用：

\`\`\`json
{"skill": "技能名", "args": {参数}}
\`\`\`

可用技能：

1. **list_matches** - 列出最近的对战记录
   参数: {"limit": 数字(默认5, 最大20)}
   返回: 最近N场对战的概要（对手、胜负、类型、时间）

2. **query_match** - 查询某场对战的详细数据
   参数: {"match_id": "对战ID"} 或 {"opponent": "对手名称"} (按对手名模糊查找最近一场)
   返回: 双方所有玩家的击败/助攻/重伤/逗币/输出/承伤/治疗/塔伤

3. **get_player_stats** - 查询某个玩家的聚合统计
   参数: {"player_name": "玩家名"}
   返回: 场次、KD、平均拿野、平均塔伤、平均治疗等

4. **get_kanban_summary** - 获取改进看板数据
   参数: {} (无参数)
   返回: 待处理/处理中/已完成的任务列表

5. **get_roster** - 获取最新排表
   参数: {} (无参数)
   返回: 最新的排表阵型和人员分配

6. **get_feedback_summary** - 获取近期反馈汇总
   参数: {"days": 数字(默认7)}
   返回: 近期玩家反馈的汇总

重要规则：
- 如果需要查数据，先返回一个技能调用JSON，系统会执行后把结果给你
- 一次只能调用一个技能
- 如果不需要查数据（比如普通对话），直接回答即可
- 回答要简洁、用具体数字说话
- 用中文回答
- 当你准备调用技能时，先简短说明你要做什么（如"让我查一下最近的战绩..."），然后在新行输出JSON
`;

function buildSystemPrompt(baiyeName: string): string {
    return `你是「${baiyeName}」的 AI 指挥官助手，一个专业的《燕云十六声》百业战（30v30）战术分析AI。
你的身份是团队的智能参谋，帮助指挥官分析战绩、跟踪改进计划、查看反馈和排表。

${SKILL_DEFINITIONS}

关于百业战的知识：
- 百业战是30v30的大型团战模式
- 核心数据维度：击败(kills)、助攻(assists)、重伤(deaths)、逗币(coins,经济)、输出(damage)、承伤(damage_taken)、治疗(healing)、塔伤(building_damage)
- 拿野效率 = 逗币 / 逗币基数（通常792），越高说明打野效率越好
- KD = 击败 / max(重伤, 1)，衡量战斗贡献
- 大龙：提供50%伤害提升持续5分钟
- 小龙：提供经济优势，约5个野怪单位的收益

回答风格：
- 简洁有力，像一个专业的战术分析师
- 用具体数字和数据说话
- 适当使用 emoji 增加可读性
- 给出有建设性的建议`;
}

// ═══════════════════════════════════════
// SKILL EXECUTION
// ═══════════════════════════════════════

function getSupabase() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    return createClient(url, key);
}

async function executeSkill(skill: string, args: Record<string, any>, baiyeId: string, baiyeName: string): Promise<string> {
    const supabase = getSupabase();

    switch (skill) {
        case 'list_matches': {
            const limit = Math.min(args.limit || 5, 20);
            const { data: matches, error } = await supabase
                .from('baiyezhan_matches')
                .select('id, team_a, team_b, winner, match_type, match_start_time, coin_value, big_dragon_team, small_dragon_team, notes')
                .eq('baiye_id', baiyeId)
                .order('match_start_time', { ascending: false })
                .limit(limit);

            if (error) return `查询失败: ${error.message}`;
            if (!matches || matches.length === 0) return '暂无对战记录';

            const lines = matches.map((m: any, i: number) => {
                const date = m.match_start_time ? new Date(m.match_start_time).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '未知';
                const result = !m.winner ? '未定' : m.winner === 'draw' ? '平局' : m.winner === baiyeName ? '胜' : '负';
                const opp = m.team_a === baiyeName ? m.team_b : m.team_a;
                return `${i + 1}. [${date}] vs ${opp} | ${m.match_type || '排位'} | 结果: ${result} | ID: ${m.id}`;
            });
            return `最近 ${matches.length} 场对战:\n${lines.join('\n')}`;
        }

        case 'query_match': {
            let matchId = args.match_id;

            // If searching by opponent name, find the latest match
            if (!matchId && args.opponent) {
                const oppName = args.opponent;
                const { data: found } = await supabase
                    .from('baiyezhan_matches')
                    .select('id')
                    .eq('baiye_id', baiyeId)
                    .or(`team_a.ilike.%${oppName}%,team_b.ilike.%${oppName}%`)
                    .order('match_start_time', { ascending: false })
                    .limit(1)
                    .single();
                if (!found) return `未找到与 "${oppName}" 的对战记录`;
                matchId = found.id;
            }

            if (!matchId) return '需要提供 match_id 或 opponent 参数';

            // Get match info
            const { data: match } = await supabase
                .from('baiyezhan_matches')
                .select('*')
                .eq('id', matchId)
                .single();

            if (!match) return '未找到该对战';

            // Get all player stats
            const { data: stats } = await supabase
                .from('baiyezhan_match_stats')
                .select('*')
                .eq('match_id', matchId)
                .order('team_name', { ascending: true });

            const coinValue = match.coin_value || 792;
            const date = match.match_start_time ? new Date(match.match_start_time).toLocaleString('zh-CN') : '未知';
            const result = !match.winner ? '未定' : match.winner === 'draw' ? '平局' : `胜方: ${match.winner}`;

            let output = `对战详情:\n${match.team_a} vs ${match.team_b}\n时间: ${date}\n类型: ${match.match_type || '排位'}\n结果: ${result}\n逗币基数: ${coinValue}\n`;

            if (match.big_dragon_team) output += `大龙: ${match.big_dragon_team}\n`;
            if (match.small_dragon_team) output += `小龙: ${match.small_dragon_team}\n`;

            if (stats && stats.length > 0) {
                // Group by team
                const teams = new Map<string, any[]>();
                for (const s of stats) {
                    const arr = teams.get(s.team_name) || [];
                    arr.push(s);
                    teams.set(s.team_name, arr);
                }

                for (const [teamName, players] of teams) {
                    output += `\n=== ${teamName} (${players.length}人) ===\n`;
                    const totalK = players.reduce((s: number, p: any) => s + (p.kills || 0), 0);
                    const totalD = players.reduce((s: number, p: any) => s + (p.deaths || 0), 0);
                    const totalBd = players.reduce((s: number, p: any) => s + (p.building_damage || 0), 0);
                    output += `团队: 总击败${totalK} 总重伤${totalD} 总塔伤${totalBd}\n`;
                    for (const p of players) {
                        const cr = ((p.coins || 0) / coinValue).toFixed(2);
                        const kd = ((p.kills || 0) / Math.max(p.deaths || 0, 1)).toFixed(2);
                        output += `  ${p.player_name}: K${p.kills}/A${p.assists}/D${p.deaths} 拿野${cr} KD${kd} 塔伤${p.building_damage || 0} 治疗${p.healing || 0}\n`;
                    }
                }
            } else {
                output += '\n暂无详细战绩数据';
            }

            return output;
        }

        case 'get_player_stats': {
            const playerName = args.player_name;
            if (!playerName) return '需要提供 player_name 参数';

            // Get all matches for this baiye
            const { data: matches } = await supabase
                .from('baiyezhan_matches')
                .select('id, coin_value')
                .eq('baiye_id', baiyeId);

            if (!matches || matches.length === 0) return '暂无对战数据';

            const matchIds = matches.map((m: any) => m.id);
            const coinMap = new Map(matches.map((m: any) => [m.id, m.coin_value || 792]));

            // Get all stats for this player
            const { data: stats } = await supabase
                .from('baiyezhan_match_stats')
                .select('*')
                .in('match_id', matchIds)
                .ilike('player_name', playerName);

            if (!stats || stats.length === 0) return `未找到玩家 "${playerName}" 的数据`;

            const count = stats.length;
            const totalK = stats.reduce((s: number, p: any) => s + (p.kills || 0), 0);
            const totalA = stats.reduce((s: number, p: any) => s + (p.assists || 0), 0);
            const totalD = stats.reduce((s: number, p: any) => s + (p.deaths || 0), 0);
            const totalCoins = stats.reduce((s: number, p: any) => s + (p.coins || 0), 0);
            const totalBd = stats.reduce((s: number, p: any) => s + (p.building_damage || 0), 0);
            const totalHeal = stats.reduce((s: number, p: any) => s + (p.healing || 0), 0);
            const totalDmg = stats.reduce((s: number, p: any) => s + (p.damage || 0), 0);

            const avgCr = stats.reduce((s: number, p: any) => s + (p.coins || 0) / (coinMap.get(p.match_id) || 792), 0) / count;
            const kd = totalK / Math.max(totalD, 1);

            return `玩家「${playerName}」的统计:
参战场次: ${count}
总击败/助攻/重伤: ${totalK}/${totalA}/${totalD}
KD: ${kd.toFixed(2)}
平均拿野效率: ${avgCr.toFixed(2)}
平均塔伤: ${(totalBd / count).toFixed(0)}
平均治疗: ${(totalHeal / count).toFixed(0)}
平均输出: ${(totalDmg / count).toFixed(0)}
总逗币: ${totalCoins.toLocaleString()}`;
        }

        case 'get_kanban_summary': {
            const { data: todos, error } = await supabase
                .from('baiyezhan_todos')
                .select('id, title, description, priority, status, keywords, reopen_count')
                .eq('baiye_id', baiyeId)
                .order('created_at', { ascending: false });

            if (error) return `查询失败: ${error.message}`;
            if (!todos || todos.length === 0) return '看板暂无任务';

            const byStatus = { todo: [] as any[], doing: [] as any[], done: [] as any[] };
            for (const t of todos) {
                (byStatus[t.status as keyof typeof byStatus] || byStatus.todo).push(t);
            }

            const priorityIcon: Record<string, string> = { high: '🔴', medium: '🟡', low: '🟢' };
            const formatItems = (items: any[]) => items.map((t: any) =>
                `  ${priorityIcon[t.priority] || '⚪'} ${t.title}${t.description ? ` - ${t.description}` : ''}${(t.reopen_count || 0) > 0 ? ` [重开×${t.reopen_count}]` : ''}`
            ).join('\n');

            return `📋 改进看板汇总:
⬜ 待处理 (${byStatus.todo.length}):
${byStatus.todo.length > 0 ? formatItems(byStatus.todo) : '  (无)'}

🔧 处理中 (${byStatus.doing.length}):
${byStatus.doing.length > 0 ? formatItems(byStatus.doing) : '  (无)'}

✅ 已完成 (${byStatus.done.length}):
${byStatus.done.length > 0 ? formatItems(byStatus.done) : '  (无)'}

共 ${todos.length} 条任务`;
        }

        case 'get_roster': {
            const { data: roster } = await supabase
                .from('baiyezhan_rosters')
                .select('*')
                .eq('baiye_id', baiyeId)
                .order('roster_date', { ascending: false })
                .limit(1)
                .single();

            if (!roster) return '暂无排表数据';

            const rd = roster.roster_data as any;
            if (!rd) return '排表数据为空';

            let output = `📋 最新排表 (${roster.name || roster.roster_date}):\n`;

            const formatSquads = (squads: any[], prefix: string) => {
                if (!Array.isArray(squads)) return '';
                let text = '';
                squads.forEach((sq: any, i: number) => {
                    const members = sq.members?.map((m: any) => m.name).filter(Boolean) || [];
                    if (members.length > 0) {
                        const leader = sq.members?.find((m: any) => m.isLeader)?.name;
                        text += `  ${prefix}${i + 1}队${leader ? `(队长:${leader})` : ''}: ${members.join(', ')}\n`;
                    }
                });
                return text;
            };

            const attackText = formatSquads(rd.attack, '进攻');
            if (attackText) output += `\n⚔️ 进攻方:\n${attackText}`;

            const defenseText = formatSquads(rd.defense, '防守');
            if (defenseText) output += `\n🛡️ 防守方:\n${defenseText}`;

            if (Array.isArray(rd.wall) && rd.wall.length > 0) {
                output += `\n🏰 人墙:\n`;
                for (const w of rd.wall) {
                    if (w.members?.length > 0) {
                        output += `  ${w.name}: ${w.members.join(', ')}\n`;
                    }
                }
            }

            return output;
        }

        case 'get_feedback_summary': {
            const days = args.days || 7;
            const since = new Date(Date.now() - days * 86400000).toISOString();

            const { data: feedbacks } = await supabase
                .from('baiyezhan_feedback')
                .select('improvement_suggestion, worst_experience, good_parts, player_role, created_at')
                .eq('baiye_id', baiyeId)
                .gte('created_at', since)
                .order('created_at', { ascending: false });

            if (!feedbacks || feedbacks.length === 0) return `近 ${days} 天暂无反馈`;

            let output = `📝 近 ${days} 天反馈汇总 (共 ${feedbacks.length} 条):\n\n`;

            const suggestions = feedbacks.map((f: any) => f.improvement_suggestion).filter(Boolean);
            const complaints = feedbacks.map((f: any) => f.worst_experience).filter(Boolean);
            const goods = feedbacks.map((f: any) => f.good_parts).filter(Boolean);

            if (complaints.length > 0) {
                output += `❌ 不好的体验 (${complaints.length}条):\n`;
                complaints.slice(0, 5).forEach((c: string, i: number) => { output += `  ${i + 1}. ${c}\n`; });
                if (complaints.length > 5) output += `  ...还有 ${complaints.length - 5} 条\n`;
            }

            if (suggestions.length > 0) {
                output += `\n💡 优化建议 (${suggestions.length}条):\n`;
                suggestions.slice(0, 5).forEach((s: string, i: number) => { output += `  ${i + 1}. ${s}\n`; });
                if (suggestions.length > 5) output += `  ...还有 ${suggestions.length - 5} 条\n`;
            }

            if (goods.length > 0) {
                output += `\n✨ 做得好的 (${goods.length}条):\n`;
                goods.slice(0, 3).forEach((g: string, i: number) => { output += `  ${i + 1}. ${g}\n`; });
            }

            return output;
        }

        default:
            return `未知技能: ${skill}`;
    }
}

// ═══════════════════════════════════════
// DOUBAO API HELPERS
// ═══════════════════════════════════════

function extractTextFromDoubaoResponse(result: any): string {
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
    return text.trim();
}

async function callDoubao(apiKey: string, messages: { role: string; content: string }[]): Promise<string> {
    // Convert messages to Doubao's input format: combine system + history into a single user message
    const combined = messages.map(m => {
        if (m.role === 'system') return `[系统指令]\n${m.content}`;
        if (m.role === 'assistant') return `[AI回复]\n${m.content}`;
        return `[用户]\n${m.content}`;
    }).join('\n\n');

    const res = await fetch(DOUBAO_API_URL, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: DOUBAO_MODEL,
            input: [{
                role: 'user',
                content: [{ type: 'input_text', text: combined }],
            }],
        }),
    });

    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Doubao API error ${res.status}: ${err}`);
    }

    const result = await res.json();
    return extractTextFromDoubaoResponse(result);
}

// ═══════════════════════════════════════
// SKILL CALL DETECTION
// ═══════════════════════════════════════

function parseSkillCall(text: string): { thinking: string; skillCall: SkillCall | null; answer: string } {
    // Try to find a JSON skill call in the response
    const jsonMatch = text.match(/```(?:json)?\s*(\{[\s\S]*?"skill"[\s\S]*?\})\s*```/);
    if (jsonMatch) {
        try {
            const parsed = JSON.parse(jsonMatch[1]);
            if (parsed.skill) {
                // Everything before the JSON block is "thinking"
                const thinkingEnd = text.indexOf('```');
                const thinking = text.substring(0, thinkingEnd).trim();
                return {
                    thinking,
                    skillCall: { skill: parsed.skill, args: parsed.args || {} },
                    answer: '',
                };
            }
        } catch { /* not valid JSON */ }
    }

    // Try to find inline JSON (without code fences)
    const inlineMatch = text.match(/(\{[^{}]*"skill"\s*:\s*"[^"]+?"[^{}]*\})/);
    if (inlineMatch) {
        try {
            const parsed = JSON.parse(inlineMatch[1]);
            if (parsed.skill) {
                const idx = text.indexOf(inlineMatch[0]);
                const thinking = text.substring(0, idx).trim();
                return {
                    thinking,
                    skillCall: { skill: parsed.skill, args: parsed.args || {} },
                    answer: '',
                };
            }
        } catch { /* not valid JSON */ }
    }

    // No skill call detected, this is a direct answer
    return { thinking: '', skillCall: null, answer: text };
}

// ═══════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════

export async function POST(request: NextRequest) {
    try {
        const apiKey = process.env.DOUBAO_API_KEY;
        if (!apiKey) {
            return NextResponse.json({ error: 'DOUBAO_API_KEY not configured' }, { status: 500 });
        }

        const body = await request.json();
        const { baiye_id, baiye_name, messages } = body;

        if (!baiye_id || !baiye_name || !Array.isArray(messages) || messages.length === 0) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const systemPrompt = buildSystemPrompt(baiye_name);
        const reasoningSteps: ReasoningStep[] = [];

        // Build conversation for Doubao
        const conversation = [
            { role: 'system', content: systemPrompt },
            ...messages,
        ];

        // Round 1: Ask Doubao
        reasoningSteps.push({ type: 'thinking', content: '正在理解你的问题...' });
        const startTime = Date.now();

        let round1Text: string;
        try {
            round1Text = await callDoubao(apiKey, conversation);
        } catch (e: any) {
            return NextResponse.json({
                reply: `AI 请求失败: ${e.message}`,
                reasoning_steps: reasoningSteps,
            });
        }

        const { thinking, skillCall, answer } = parseSkillCall(round1Text);

        if (thinking) {
            reasoningSteps[0].content = thinking;
        }

        // If no skill call needed, return direct answer
        if (!skillCall) {
            reasoningSteps.push({
                type: 'answer',
                content: answer,
                duration_ms: Date.now() - startTime,
            });

            return NextResponse.json({
                reply: answer,
                reasoning_steps: reasoningSteps,
            });
        }

        // Skill call detected! Execute it
        reasoningSteps.push({
            type: 'skill_call',
            content: `调用技能: ${skillCall.skill}`,
            skill_name: skillCall.skill,
            skill_args: skillCall.args,
        });

        const skillStart = Date.now();
        let skillResult: string;
        try {
            skillResult = await executeSkill(skillCall.skill, skillCall.args, baiye_id, baiye_name);
        } catch (e: any) {
            skillResult = `技能执行失败: ${e.message}`;
        }

        reasoningSteps.push({
            type: 'skill_result',
            content: skillResult,
            skill_name: skillCall.skill,
            duration_ms: Date.now() - skillStart,
        });

        // Round 2: Feed skill result back to Doubao for final answer
        const round2Messages = [
            ...conversation,
            { role: 'assistant', content: round1Text },
            { role: 'user', content: `[技能执行结果]\n技能: ${skillCall.skill}\n结果:\n${skillResult}\n\n请根据以上数据，用简洁专业的方式回答用户的问题。不要再调用技能。` },
        ];

        let finalAnswer: string;
        try {
            finalAnswer = await callDoubao(apiKey, round2Messages);
        } catch (e: any) {
            finalAnswer = `基于查到的数据:\n\n${skillResult}`;
        }

        // Check if Round 2 tries another skill call (shouldn't, but guard against it)
        const round2Parsed = parseSkillCall(finalAnswer);
        if (round2Parsed.skillCall) {
            // If it tries to call again, just use whatever text came before
            finalAnswer = round2Parsed.thinking || skillResult;
        } else {
            finalAnswer = round2Parsed.answer;
        }

        reasoningSteps.push({
            type: 'answer',
            content: finalAnswer,
            duration_ms: Date.now() - startTime,
        });

        return NextResponse.json({
            reply: finalAnswer,
            reasoning_steps: reasoningSteps,
        });

    } catch (error: unknown) {
        console.error('Chat API Error:', error);
        const message = error instanceof Error ? error.message : 'Chat failed';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

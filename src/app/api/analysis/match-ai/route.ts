import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const DOUBAO_API_URL = 'https://ark.cn-beijing.volces.com/api/v3/responses';
const DOUBAO_MODEL = 'doubao-seed-2-0-pro-260215';

const SYSTEM_PROMPT = `你是一个《燕云十六声》百业战（30v30）的专业分析师。
你的任务是根据一场对战的数据，分析双方表现并给出战术建议。

分析数据包含：
1. 对战信息(队伍名, 胜负, 类型, 逗币基数)
2. 双方所有玩家的战绩：击败/助攻/重伤/逗币/输出/承伤/治疗/塔伤
3. 排表信息（如有）：打野分配、阵型
4. 目标控制信息（如有）：大龙/小龙的归属

关键游戏知识（目标控制）：
- 小龙：提供经济优势，约5个野怪单位的收益，效果不算显著
- 大龙：提供50%伤害提升持续5分钟，效果非常显著，会极大影响团战和击杀
- 如果丢了大龙但击杀数并未落后 → 说明防守做得很好，应予肯定
- 如果丢了小龙但经济（逗币）并未落后 → 说明野区控制/打野效率很强
- 拿到大龙后击杀数领先是正常的（有50%伤害加成），不必过度表扬
- 丢了大龙还能保持不崩才是真正值得分析的防守能力

分析维度：
- 整体表现评估（拿野效率、团队KD、塔伤输出）
- 目标控制评估（大龙/小龙控制情况及其对战局的影响）
- 关键球员亮点（表现突出的2-3人）
- 短板识别（数据异常低的维度）
- 战术建议（基于数据的改进方向）

输出格式：
1. 简短的一句话整体评价
2. 🏆 亮点（2-3条，每条一行）
3. ⚠️ 问题（2-3条，每条一行）
4. 🐉 目标控制（1-2条，分析大小龙对战局的影响）
5. 💡 建议（1-2条简短建议）

关键规则：
- 保持简洁，每条不超过20字
- 用具体数字说话
- 不要废话和客套
- 总字数不要超过250字
- 用中文回答`;

/**
 * POST /api/analysis/match-ai
 * 
 * AI-powered match analysis for a single expanded match.
 * Body: { match, ourTeamStats, opponentStats, rosterSummary?, baiyeId?, regenerate? }
 * 
 * - On first call: generates AI analysis, saves to DB, returns it.
 * - On subsequent calls (without regenerate): returns saved analysis from DB.
 * - With regenerate=true: re-generates and overwrites saved analysis.
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

        const body = await request.json();
        const { match, ourTeamStats, opponentStats, rosterSummary, baiyeId, regenerate, dragonInfo, loadOnly } = body;

        if (!match?.id) {
            return NextResponse.json(
                { error: 'Missing required data (match.id)' },
                { status: 400 }
            );
        }

        // ── Try to load saved analysis from DB (unless regenerating) ──
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        let supabase: ReturnType<typeof createClient> | null = null;

        if (supabaseUrl && supabaseKey) {
            supabase = createClient(supabaseUrl, supabaseKey);

            if (!regenerate && baiyeId) {
                const { data: saved } = await supabase
                    .from('baiyezhan_match_ai_analysis' as any)
                    .select('analysis_text, updated_at')
                    .eq('match_id', match.id)
                    .eq('baiye_id', baiyeId)
                    .maybeSingle() as { data: { analysis_text: string; updated_at: string } | null };

                if (saved?.analysis_text) {
                    return NextResponse.json({
                        analysis: saved.analysis_text,
                        saved: true,
                        savedAt: saved.updated_at,
                    });
                }
            }
        }

        // ── loadOnly mode: only return saved data, don't generate ──
        if (loadOnly) {
            return NextResponse.json({ analysis: null, saved: false });
        }

        // ── Generate AI analysis (requires full stats) ──
        if (!ourTeamStats) {
            return NextResponse.json(
                { error: 'Missing required data for generation' },
                { status: 400 }
            );
        }
        const coinValue = match.coin_value || 720;
        const ourStats = ourTeamStats.map((s: any) => {
            const cr = (s.coins || 0) / coinValue;
            const kd = (s.kills || 0) / Math.max(s.deaths || 0, 1);
            return `${s.player_name}: K${s.kills}/A${s.assists}/D${s.deaths} 拿野${cr.toFixed(2)} 塔伤${s.building_damage || 0} 治疗${s.healing || 0} KD${kd.toFixed(2)}`;
        }).join('\n');

        const oppStats = opponentStats?.map((s: any) => {
            const cr = (s.coins || 0) / coinValue;
            return `${s.player_name}: K${s.kills}/A${s.assists}/D${s.deaths} 拿野${cr.toFixed(2)}`;
        }).join('\n') || '无数据';

        const resultStr = match.winner
            ? (match.winner === 'draw' ? '平局' : `胜方: ${match.winner}`)
            : '未知';

        let prompt = `对战: ${match.team_a} vs ${match.team_b}\n结果: ${resultStr}\n类型: ${match.match_type || '排位'}\n逗币基数: ${coinValue}\n\n`;
        prompt += `=== ${match.team_a} 数据 ===\n${ourStats}\n\n`;
        prompt += `=== ${match.team_b} 数据 ===\n${oppStats}\n`;

        if (rosterSummary) {
            prompt += `\n=== 排表打野分配 ===\n${rosterSummary}\n`;
        }

        // Add dragon objective info if available
        const bigDragon = dragonInfo?.big_dragon_team || match.big_dragon_team;
        const smallDragon = dragonInfo?.small_dragon_team || match.small_dragon_team;
        if (bigDragon || smallDragon) {
            prompt += `\n=== 目标控制 ===\n`;
            if (bigDragon) {
                prompt += `大龙: ${bigDragon} 拿到（+50%伤害5分钟）\n`;
            } else {
                prompt += `大龙: 未被击杀\n`;
            }
            if (smallDragon) {
                prompt += `小龙: ${smallDragon} 拿到（经济优势约5个野怪）\n`;
            } else {
                prompt += `小龙: 未被击杀\n`;
            }
        }

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
                                text: `${SYSTEM_PROMPT}\n\n${prompt}`,
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

        const analysisText = text.trim();

        // ── Save to DB ──
        if (supabase && baiyeId) {
            try {
                await (supabase as any)
                    .from('baiyezhan_match_ai_analysis')
                    .upsert(
                        {
                            match_id: match.id,
                            baiye_id: baiyeId,
                            analysis_text: analysisText,
                        },
                        { onConflict: 'match_id,baiye_id' }
                    );
            } catch (saveErr) {
                console.error('Failed to save AI analysis:', saveErr);
                // Don't fail the request if save fails — still return the analysis
            }
        }

        return NextResponse.json({
            analysis: analysisText,
            saved: true,
        });
    } catch (error: unknown) {
        console.error('Match AI Analysis Error:', error);
        const message = error instanceof Error ? error.message : 'Analysis failed';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

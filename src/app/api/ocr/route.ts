import { NextRequest, NextResponse } from 'next/server';

const SYSTEM_PROMPT = `你是一个游戏战绩OCR识别专家。用户会上传《燕云十六声》游戏的战斗结算截图。

请从图片中提取以下结构化数据，返回严格的 JSON 格式：

{
  "players": [
    {
      "player_name": "玩家角色名",
      "kills": 0,
      "assists": 0,
      "deaths": 0,
      "coins": 0,
      "damage": 0,
      "damage_taken": 0,
      "healing": 0,
      "building_damage": 0
    }
  ]
}

关键规则：
1. 所有数值字段必须是数字，不是字符串
2. 如果某个字段在截图中找不到，默认为 0
3. 尽可能多地提取玩家数据
4. player_name 保持原始角色名，不要修改
5. 如果有多张图片，合并所有玩家数据到一个 players 数组中，相同玩家名不要重复
6. 只返回 JSON，不要返回其他文字
7. 击败对应 kills，助攻对应 assists，重伤/死亡对应 deaths
8. 逗币对应 coins，输出对应 damage，承伤对应 damage_taken
9. 治疗量对应 healing，建筑伤害对应 building_damage`;

const DOUBAO_API_URL = 'https://ark.cn-beijing.volces.com/api/v3/responses';
const DOUBAO_MODEL = 'doubao-seed-2-0-pro-260215';

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
        const { imageUrls } = body as { imageUrls: string[] }; // public URLs from Supabase Storage

        if (!imageUrls || imageUrls.length === 0) {
            return NextResponse.json(
                { error: 'No image URLs provided' },
                { status: 400 }
            );
        }

        // Build content parts for Doubao Responses API
        const contentParts: Array<{ type: string; image_url?: string; text?: string }> = [];

        for (const url of imageUrls) {
            contentParts.push({
                type: 'input_image',
                image_url: url,
            });
        }

        contentParts.push({
            type: 'input_text',
            text: `${SYSTEM_PROMPT}\n\n以上是 ${imageUrls.length} 张战斗结算截图，请提取数据并返回 JSON：`,
        });

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
                        content: contentParts,
                    },
                ],
            }),
        });

        if (!res.ok) {
            const errText = await res.text();
            console.error('Doubao API error:', res.status, errText);
            return NextResponse.json(
                { error: `Doubao API error: ${res.status} - ${errText}` },
                { status: 502 }
            );
        }

        const result = await res.json();

        // Extract text from Doubao response
        // Structure: { output: [ { type: "reasoning", ... }, { type: "message", content: [{ type: "output_text", text: "..." }] } ] }
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
                { error: 'Doubao returned empty response' },
                { status: 502 }
            );
        }

        // Extract JSON from response (handle markdown code blocks)
        let jsonStr = text;
        const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) {
            jsonStr = jsonMatch[1].trim();
        }

        const parsed = JSON.parse(jsonStr);

        return NextResponse.json({ data: parsed });
    } catch (error: unknown) {
        console.error('OCR Error:', error);
        const message = error instanceof Error ? error.message : 'OCR processing failed';
        return NextResponse.json(
            { error: message },
            { status: 500 }
        );
    }
}

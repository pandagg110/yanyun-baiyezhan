/**
 * Client-side OCR Service
 * 
 * Calls Doubao AI directly from the browser to bypass AWS Lambda timeout.
 * Falls back to the server-side /api/ocr route if direct call fails (e.g. CORS).
 */

export interface OcrPlayer {
    player_name: string;
    kills: number;
    assists: number;
    deaths: number;
    coins: number;
    damage: number;
    damage_taken: number;
    healing: number;
    building_damage: number;
}

export interface OcrResult {
    players: OcrPlayer[];
}

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

/**
 * Parse Doubao API response to extract structured player data
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseDoubaoResponse(result: any): OcrResult {
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
        throw new Error('AI 返回了空响应');
    }

    // Extract JSON from response (handle markdown code blocks)
    let jsonStr = text;
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
        jsonStr = jsonMatch[1].trim();
    }

    return JSON.parse(jsonStr);
}

/**
 * Call Doubao API directly from the browser.
 * Bypasses Lambda timeout — the browser has no such limit.
 */
async function callDoubaoDirectly(apiKey: string, imageUrls: string[]): Promise<OcrResult> {
    const contentParts: Array<{ type: string; image_url?: string; text?: string }> = [];

    for (const url of imageUrls) {
        contentParts.push({ type: 'input_image', image_url: url });
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
            input: [{ role: 'user', content: contentParts }],
        }),
    });

    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Doubao API error: ${res.status} - ${errText}`);
    }

    const result = await res.json();
    return parseDoubaoResponse(result);
}

/**
 * Call Doubao via server-side API route (may timeout on Lambda/Amplify)
 */
async function callViaApiRoute(imageUrls: string[]): Promise<OcrResult> {
    const res = await fetch('/api/ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrls }),
    });

    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || `HTTP ${res.status}`);
    }

    const { data } = await res.json();
    return data;
}

/**
 * Main OCR entry point.
 * Strategy: Try direct browser → Doubao call first (no timeout limit).
 * If direct call fails (e.g. CORS), automatically fall back to /api/ocr.
 */
export async function recognizeScreenshots(imageUrls: string[]): Promise<OcrResult> {
    const apiKey = process.env.NEXT_PUBLIC_DOUBAO_API_KEY;

    if (apiKey) {
        try {
            console.log('[OCR] 尝试前端直连豆包 API（绕过 Lambda 超时）...');
            const result = await callDoubaoDirectly(apiKey, imageUrls);
            console.log('[OCR] 前端直连成功 ✅');
            return result;
        } catch (err) {
            console.warn('[OCR] 前端直连失败，回退到服务端路由:', err);
            // Fall through to API route fallback
        }
    } else {
        console.log('[OCR] 未配置 NEXT_PUBLIC_DOUBAO_API_KEY，使用服务端路由');
    }

    // Fallback: server-side route (subject to Lambda timeout)
    console.log('[OCR] 使用 /api/ocr 服务端路由...');
    return await callViaApiRoute(imageUrls);
}

export type Json =
    | string
    | number
    | boolean
    | null
    | { [key: string]: Json | undefined }
    | Json[]

export type UserRole = 'user' | 'vip' | 'admin';

export interface User {
    id: string;
    email: string;
    character_name: string;
    avatar_url?: string;
    role: UserRole;
}

export interface GuestbookMessage {
    id: string;
    content: string;
    author_id: string;
    author?: User; // Joined user data
    target_type: 'global' | 'baiye' | 'room';
    target_id?: string;
    created_at: string;
}

// 百业 (大房间)
export interface Baiye {
    id: string;
    name: string;
    description?: string;
    cover_image?: string;
    password?: string;
    owner_id: string;
    created_at?: string;
}

export interface Room {
    id: string;
    room_code: string;
    name: string;
    room_type: string;
    owner_id: string;
    baiye_id?: string; // 所属百业
    round_duration: number; // default 80
    broadcast_interval: number; // default 10
    bgm_track?: string;
    cover_image?: string;
    password?: string; // Optional room password
    created_at?: string;
}

export interface RoomState {
    room_id: string;
    round_start_time: number | null; // stored as bigint/timestamp in DB, here number for JS
    is_running: boolean;
}

export interface RoomMember {
    room_id: string;
    user_id: string;
    order_index: number;
    user?: User; // Joined data
}

// Helper type for full Room Data
export interface RoomData {
    room: Room;
    state: RoomState;
    members: RoomMember[];
}

// ──────────────────────────────────────
// Match System (对战记录 + 个人战绩)
// ──────────────────────────────────────

/** 对战记录（Match 级别，对称设计） */
export interface Match {
    id: string;
    baiye_id: string;           // 提交方百业 ID
    team_a: string;             // 百业A名称
    team_b: string;             // 百业B名称
    match_key: string;          // 去重唯一键 (sorted names + time)
    winner: string | null;      // 胜利方百业名 | 'draw' | null(待定)
    match_start_time?: string;  // 对战开始时间
    match_date?: string;        // auto-synced from match_start_time
    notes?: string;
    screenshot_urls?: string[];
    created_by?: string;
    created_at: string;
}

/** 个人战绩（Player 级别） */
export interface MatchStat {
    id: string;
    match_id: string;
    team_name: string;          // 所属队伍名称（对应 match 的 team_a 或 team_b）
    player_name: string;
    user_id?: string;

    // 战斗数据
    kills: number;
    assists: number;
    deaths: number;
    coins: number;

    // 详细数据
    damage: number;
    damage_taken: number;
    healing: number;
    building_damage: number;

    created_at: string;
}

/** OCR 识别结果 (豆包返回的结构) */
export interface OcrMatchResult {
    players: Array<{
        player_name: string;
        kills: number;
        assists: number;
        deaths: number;
        coins: number;
        damage: number;
        damage_taken: number;
        healing: number;
        building_damage: number;
    }>;
}

/** 对战截图证据 */
export interface MatchScreenshot {
    id: string;
    match_id: string;
    team_name: string;
    image_url: string;
    uploaded_by?: string;
    created_at: string;
}

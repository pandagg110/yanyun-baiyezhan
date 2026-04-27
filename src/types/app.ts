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
    match_type?: string;        // 约战 | 正赛 | 排位 (default)
    coin_value?: number;         // 逗币基数，默认720
    big_dragon_team?: string | null;    // 拿到大龙的百业名称
    small_dragon_team?: string | null;  // 拿到小龙的百业名称
    notes?: string;
    roster_id?: string;             // 关联排表 ID
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

// ──────────────────────────────────────
// Feedback & ToDo System (反馈闭环系统)
// ──────────────────────────────────────

/** 玩家反馈 */
export interface Feedback {
    id: string;
    baiye_id: string;
    worst_experience?: string;
    improvement_suggestion: string;
    good_parts?: string;
    player_role?: '防守' | '进攻';
    is_anonymous: boolean;
    user_id?: string;
    user_name?: string;
    created_at: string;
}

/** ToDo 优化计划 */
export interface Todo {
    id: string;
    baiye_id: string;
    title: string;
    description?: string;
    priority: 'high' | 'medium' | 'low';
    status: 'todo' | 'doing' | 'done';
    batch_time_start?: string;
    batch_time_end?: string;
    created_by?: string;
    created_at: string;
    updated_at?: string;
}

// ──────────────────────────────────────
// Roster System (排表系统)
// ──────────────────────────────────────

/** 人员池成员 */
export interface RosterMember {
    id: string;
    baiye_id: string;
    name: string;
    created_at: string;
}

/** 下拉选项 */
export interface RosterOption {
    id: string;
    baiye_id: string;
    category: string;
    label: string;
    color?: string | null;
    sort_order: number;
}

/** 单元格 */
export interface RosterCell {
    text: string;
    color?: string | null;
}

/** 小队成员行 */
export interface RosterSquadMember {
    name: string;
    isLeader?: boolean;
    cells: RosterCell[];
}

/** 小队 */
export interface RosterSquad {
    members: RosterSquadMember[];
    colorNote?: string;
    timeNote?: string;
}

/** 人墙塔位 */
export interface WallTower {
    name: string;       // 上塔 / 中塔 / 下塔
    members: string[];  // max 3 names
}

/** 排表数据（JSONB 结构） — 行=成员，列=阶段，格=战术指令 */
export interface RosterData {
    columns: string[];              // 防守列 (backward compat)
    attackColumns?: string[];       // 进攻列 (新增，独立于防守)
    attack: RosterSquad[];
    defense: RosterSquad[];
    wall: WallTower[];
}

/** 排表记录 */
export interface Roster {
    id: string;
    baiye_id: string;
    name: string;
    roster_date: string;
    roster_data: RosterData;
    created_by?: string;
    created_at: string;
    updated_at?: string;
}

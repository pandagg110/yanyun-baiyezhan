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
    role: UserRole;
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

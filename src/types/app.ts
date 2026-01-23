export type Json =
    | string
    | number
    | boolean
    | null
    | { [key: string]: Json | undefined }
    | Json[]

export interface User {
    id: string;
    email: string;
    character_name: string;
}

export interface Room {
    id: string;
    room_code: string;
    owner_id: string;
    round_duration: number; // default 80
    broadcast_interval: number; // default 10
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

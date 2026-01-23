import { Room, RoomData, RoomMember, RoomState, User } from "@/types/app";

// In-memory storage for development
const MOCK_STORAGE_KEY = 'yanyun_mock_db';

interface MockDB {
    rooms: Room[];
    states: RoomState[];
    users: User[];
    members: RoomMember[];
}

function loadDB(): MockDB {
    if (typeof window === 'undefined') return { rooms: [], states: [], users: [], members: [] };
    const stored = localStorage.getItem(MOCK_STORAGE_KEY);
    if (stored) return JSON.parse(stored);
    return { rooms: [], states: [], users: [], members: [] };
}

function saveDB(db: MockDB) {
    if (typeof window === 'undefined') return;
    localStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify(db));
}

export const MockService = {
    // Auth
    login: async (email: string, characterName: string): Promise<User> => {
        const db = loadDB();
        let user = db.users.find(u => u.email === email);
        if (!user) {
            user = {
                id: crypto.randomUUID(),
                email,
                character_name: characterName,
            };
            db.users.push(user);
            saveDB(db);
        }
        return user;
    },

    // Rooms
    createRoom: async (ownerId: string, name: string): Promise<RoomData> => {
        const db = loadDB();
        const roomId = crypto.randomUUID();
        const roomCode = Math.floor(1000 + Math.random() * 9000).toString(); // 4 digit code

        const room: Room = {
            id: roomId,
            room_code: roomCode,
            owner_id: ownerId,
            round_duration: 80,
            broadcast_interval: 10,
        };

        const state: RoomState = {
            room_id: roomId,
            round_start_time: null,
            is_running: false,
        };

        // Add owner as member 0
        const member: RoomMember = {
            room_id: roomId,
            user_id: ownerId,
            order_index: 0
        };

        db.rooms.push(room);
        db.states.push(state);
        db.members.push(member);
        saveDB(db);

        return { room, state, members: [member] };
    },

    joinRoom: async (userId: string, roomCode: string): Promise<RoomData | null> => {
        const db = loadDB();
        const room = db.rooms.find(r => r.room_code === roomCode);
        if (!room) throw new Error("Room not found");

        const existingMember = db.members.find(m => m.room_id === room.id && m.user_id === userId);
        if (!existingMember) {
            // Auto-assign next order index
            const count = db.members.filter(m => m.room_id === room.id).length;
            db.members.push({
                room_id: room.id,
                user_id: userId,
                order_index: count
            });
            saveDB(db);
        }

        const state = db.states.find(s => s.room_id === room.id)!;
        const members = db.members.filter(m => m.room_id === room.id);

        // Enrich members with user data
        const enrichedMembers = members.map(m => ({
            ...m,
            user: db.users.find(u => u.id === m.user_id)
        }));

        return { room, state, members: enrichedMembers };
    },

    getRoomState: async (roomId: string): Promise<RoomData | null> => {
        const db = loadDB();
        const room = db.rooms.find(r => r.id === roomId);
        if (!room) return null;
        const state = db.states.find(s => s.room_id === roomId)!;
        const members = db.members.filter(m => m.room_id === roomId);
        const enrichedMembers = members.map(m => ({
            ...m,
            user: db.users.find(u => u.id === m.user_id)
        }));
        return { room, state, members: enrichedMembers };
    },

    // Actions
    startRound: async (roomId: string): Promise<void> => {
        const db = loadDB();
        const state = db.states.find(s => s.room_id === roomId);
        if (state) {
            state.is_running = true;
            state.round_start_time = Date.now();
            saveDB(db);
        }
    },

    resetRound: async (roomId: string): Promise<void> => {
        const db = loadDB();
        const state = db.states.find(s => s.room_id === roomId);
        if (state) {
            state.is_running = false;
            state.round_start_time = null;
            saveDB(db);
        }
    }
};

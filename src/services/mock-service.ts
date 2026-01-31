import { Room, RoomData, RoomMember, RoomState, User } from "@/types/app";

/**
 * Mock Service for UI Development without Backend
 */
export const MockService = {
    // Auth
    login: async (email: string, characterName: string): Promise<User> => {
        // Simulate API delay
        await new Promise(resolve => setTimeout(resolve, 500));
        return {
            id: "mock-user-" + Math.random().toString(36).substr(2, 9),
            email,
            character_name: characterName,
            role: 'user'
        };
    },

    // Rooms
    createRoom: async (ownerId: string, name: string): Promise<RoomData> => {
        await new Promise(resolve => setTimeout(resolve, 800));
        const roomId = "mock-room-" + Math.random().toString(36).substr(2, 9);
        const roomCode = Math.floor(1000 + Math.random() * 9000).toString(); // 4 digit code

        const room: Room = {
            id: roomId,
            room_code: roomCode,
            name: name || "Mock Room",
            room_type: "general",
            owner_id: ownerId,
            round_duration: 80,
            broadcast_interval: 10,
            created_at: new Date().toISOString()
        };

        const state: RoomState = {
            room_id: roomId,
            round_start_time: null,
            is_running: false
        };

        const members: RoomMember[] = [{
            room_id: roomId,
            user_id: ownerId,
            order_index: 0,
            user: { id: ownerId, email: "owner@test.com", character_name: "MockOwner", role: 'user' }
        }];

        // Store in local storage to simulate "server" state for join
        const mockDb = JSON.parse(localStorage.getItem('mock_db') || '{}');
        mockDb[roomCode] = { room, state, members };
        localStorage.setItem('mock_db', JSON.stringify(mockDb));

        return { room, state, members };
    },

    joinRoom: async (userId: string, roomCode: string): Promise<RoomData | null> => {
        await new Promise(resolve => setTimeout(resolve, 600));
        const mockDb = JSON.parse(localStorage.getItem('mock_db') || '{}');
        const roomData = mockDb[roomCode] as RoomData;

        if (!roomData) return null;

        // Add member if not exists
        if (!roomData.members.find(m => m.user_id === userId)) {
            roomData.members.push({
                room_id: roomData.room.id,
                user_id: userId,
                order_index: roomData.members.length,
                user: { id: userId, email: "joiner@test.com", character_name: "MockJoiner", role: 'user' }
            });
            localStorage.setItem('mock_db', JSON.stringify(mockDb));
        }

        return roomData;
    },

    getRoomState: async (roomId: string): Promise<RoomData | null> => {
        const mockDb = JSON.parse(localStorage.getItem('mock_db') || '{}');
        // Find by room ID (inefficient but mock)
        const roomCode = Object.keys(mockDb).find(code => mockDb[code].room.id === roomId);
        if (!roomCode) return null;
        return mockDb[roomCode];
    },

    // Actions
    startRound: async (roomId: string): Promise<void> => {
        const mockDb = JSON.parse(localStorage.getItem('mock_db') || '{}');
        const roomCode = Object.keys(mockDb).find(code => mockDb[code].room.id === roomId);
        if (!roomCode) return;

        mockDb[roomCode].state.is_running = true;
        mockDb[roomCode].state.round_start_time = Date.now();
        localStorage.setItem('mock_db', JSON.stringify(mockDb));
    },

    resetRound: async (roomId: string): Promise<void> => {
        const mockDb = JSON.parse(localStorage.getItem('mock_db') || '{}');
        const roomCode = Object.keys(mockDb).find(code => mockDb[code].room.id === roomId);
        if (!roomCode) return;

        mockDb[roomCode].state.is_running = false;
        mockDb[roomCode].state.round_start_time = null;
        localStorage.setItem('mock_db', JSON.stringify(mockDb));
    }
};

import { supabase } from "@/lib/supabase";
import { Room, RoomData, RoomMember, RoomState, User } from "@/types/app";

/**
 * Real Supabase Service
 * Uses 'baiyezhan_' prefixed tables.
 */
export const SupabaseService = {
    // Auth
    getSession: async () => {
        return await supabase.auth.getSession();
    },

    getUser: async () => {
        const { data: { user } } = await supabase.auth.getUser();
        return user;
    },

    register: async (email: string, password: string, charName: string) => {
        // 1. SignUp
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: { character_name: charName } // Store in metadata
            }
        });
        if (error) throw error;

        // 2. Create Profile in our table
        if (data.user) {
            const { error: profileError } = await supabase
                .from('baiyezhan_users')
                .insert({
                    id: data.user.id,
                    email: email,
                    character_name: charName
                });

            if (profileError) {
                // Profile creation failed, but user exists. 
                // In strict mode we might want to cleanup, but for now just warn.
                console.error("Profile creation failed", profileError);
            }
        }
        return data;
    },

    login: async (email: string, password: string) => {
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password
        });
        if (error) throw error;
        return data;
    },

    logout: async () => {
        await supabase.auth.signOut();
    },

    // Rooms
    createRoom: async (ownerId: string, name: string): Promise<RoomData> => {
        const roomCode = Math.floor(1000 + Math.random() * 9000).toString();

        // 1. Create Room
        const { data: room, error: roomError } = await supabase
            .from('baiyezhan_rooms')
            .insert({
                owner_id: ownerId,
                room_code: roomCode,
                round_duration: 80,
                broadcast_interval: 10
            })
            .select()
            .single();

        if (roomError) throw roomError;

        // 2. Create State
        const { data: state, error: stateError } = await supabase
            .from('baiyezhan_room_state')
            .insert({
                room_id: room.id,
                round_start_time: null,
                is_running: false
            })
            .select()
            .single();

        if (stateError) throw stateError;

        // 3. Add Owner as Member
        const { data: member, error: memberError } = await supabase
            .from('baiyezhan_room_members')
            .insert({
                room_id: room.id,
                user_id: ownerId,
                order_index: 0
            })
            .select()
            .single();

        if (memberError) throw memberError;

        return { room, state, members: [member] } as unknown as RoomData;
    },

    joinRoom: async (userId: string, roomCode: string): Promise<RoomData | null> => {
        // 1. Find Room
        const { data: room, error: roomError } = await supabase
            .from('baiyezhan_rooms')
            .select('*')
            .eq('room_code', roomCode)
            .single();

        if (roomError || !room) return null;

        // 2. Check/Add Member
        const { data: existingMember } = await supabase
            .from('baiyezhan_room_members')
            .select('*')
            .eq('room_id', room.id)
            .eq('user_id', userId)
            .single();

        if (!existingMember) {
            // Get count for order index
            const { count } = await supabase
                .from('baiyezhan_room_members')
                .select('*', { count: 'exact', head: true })
                .eq('room_id', room.id);

            await supabase
                .from('baiyezhan_room_members')
                .insert({
                    room_id: room.id,
                    user_id: userId,
                    order_index: count || 0
                });
        }

        return SupabaseService.getRoomState(room.id);
    },

    getRoomState: async (roomId: string): Promise<RoomData | null> => {
        const { data: room } = await supabase.from('baiyezhan_rooms').select('*').eq('id', roomId).single();
        if (!room) return null;

        const { data: state } = await supabase.from('baiyezhan_room_state').select('*').eq('room_id', roomId).single();
        const { data: members } = await supabase
            .from('baiyezhan_room_members')
            .select('*, user:baiyezhan_users(*)') // Join with users
            .eq('room_id', roomId);

        return {
            room,
            state,
            members: members?.map(m => ({
                ...m,
                user: m.user // Flatten if needed depending on exact return shape
            })) || []
        } as unknown as RoomData;
    },

    // Actions
    startRound: async (roomId: string): Promise<void> => {
        await supabase.from('baiyezhan_room_state').update({
            is_running: true,
            round_start_time: Date.now()
        }).eq('room_id', roomId);
    },

    resetRound: async (roomId: string): Promise<void> => {
        await supabase.from('baiyezhan_room_state').update({
            is_running: false,
            round_start_time: null
        }).eq('room_id', roomId);
    }
};

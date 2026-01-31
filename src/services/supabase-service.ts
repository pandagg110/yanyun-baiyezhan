import { supabase } from "@/lib/supabase";
import { Baiye, Room, RoomData, RoomMember, RoomState, User, UserRole } from "@/types/app";

/**
 * Real Supabase Service
 * Uses 'baiyezhan_' prefixed tables.
 */
export const SupabaseService = {
    // Auth
    getSession: async () => {
        return await supabase.auth.getSession();
    },

    getUser: async (): Promise<User | null> => {
        const { data: { user: authUser } } = await supabase.auth.getSession().then(({ data }) => ({ data: { user: data.session?.user || null } }));
        if (!authUser) return null;

        // 1. Try to get existing profile
        const { data: profile } = await supabase
            .from('baiyezhan_users')
            .select('*')
            .eq('id', authUser.id)
            .single();

        if (profile) return profile as User;

        // 2. Self-Healing: Profile missing (likely DB reset), recreate it from Auth Metadata
        console.log("Profile missing for authenticated user. Attempting self-healing...");
        const charName = authUser.user_metadata?.character_name || 'Commander';

        const { data: newProfile, error } = await supabase
            .from('baiyezhan_users')
            .insert({
                id: authUser.id,
                email: authUser.email!,
                character_name: charName
            })
            .select()
            .single();

        if (error) {
            console.error("Self-healing failed:", error);
            // Even if DB insert fails (e.g. duplicate key race condition), 
            // the user might actually exist now. Use the auth metadata to return a usable object.
            return {
                id: authUser.id,
                email: authUser.email!,
                character_name: charName,
                role: 'user' as const
            };
        }

        return newProfile as User;
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

    // ============ BAIYE (大房间) ============

    /**
     * Get all baiye (public list)
     */
    getBaiyeList: async (): Promise<Baiye[]> => {
        const { data, error } = await supabase
            .from('baiyezhan_baiye')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;
        return (data as Baiye[]) || [];
    },

    /**
     * Get a single baiye by ID
     */
    getBaiye: async (baiyeId: string): Promise<Baiye | null> => {
        const { data, error } = await supabase
            .from('baiyezhan_baiye')
            .select('*')
            .eq('id', baiyeId)
            .single();

        if (error) return null;
        return data as Baiye;
    },

    /**
     * Create a new baiye (VIP: max 1, Admin: unlimited)
     */
    createBaiye: async (ownerId: string, name: string, description?: string, coverImage?: string): Promise<Baiye> => {
        const { data, error } = await supabase
            .from('baiyezhan_baiye')
            .insert({
                name,
                description: description || null,
                cover_image: coverImage || null,
                owner_id: ownerId
            })
            .select()
            .single();

        if (error) throw error;
        return data as Baiye;
    },

    /**
     * Delete a baiye (Admin only, cascade deletes rooms)
     */
    deleteBaiye: async (baiyeId: string): Promise<void> => {
        const user = await SupabaseService.getUser();
        if (!user || user.role !== 'admin') {
            throw new Error('Permission denied');
        }

        const { error } = await supabase
            .from('baiyezhan_baiye')
            .delete()
            .eq('id', baiyeId);

        if (error) throw error;
    },

    /**
     * Get count of baiye owned by a user
     */
    getUserBaiyeCount: async (userId: string): Promise<number> => {
        const { count, error } = await supabase
            .from('baiyezhan_baiye')
            .select('*', { count: 'exact', head: true })
            .eq('owner_id', userId);

        if (error) return 0;
        return count || 0;
    },

    /**
     * Get count of rooms owned by a user (across all baiye)
     */
    getUserRoomCount: async (userId: string): Promise<number> => {
        const { count, error } = await supabase
            .from('baiyezhan_rooms')
            .select('*', { count: 'exact', head: true })
            .eq('owner_id', userId);

        if (error) return 0;
        return count || 0;
    },

    /**
     * Check if user can create a baiye
     */
    canCreateBaiye: async (role: UserRole, userId: string): Promise<boolean> => {
        if (role === 'admin') return true;
        if (role === 'vip') {
            const count = await SupabaseService.getUserBaiyeCount(userId);
            return count < 1;
        }
        return false;
    },

    /**
     * Check if user can create a room (VIP: max 4 total)
     */
    canCreateRoomAsync: async (role: UserRole, userId: string): Promise<boolean> => {
        if (role === 'admin') return true;
        if (role === 'vip') {
            const count = await SupabaseService.getUserRoomCount(userId);
            return count < 4;
        }
        return false;
    },

    /**
     * Get rooms by baiye ID
     */
    getRoomsByBaiye: async (baiyeId: string): Promise<Room[]> => {
        const { data } = await supabase
            .from('baiyezhan_rooms')
            .select('*')
            .eq('baiye_id', baiyeId)
            .order('created_at', { ascending: false });

        return (data as Room[]) || [];
    },

    // ============ ROOMS (小房间) ============

    getRooms: async (): Promise<Room[]> => {
        const { data } = await supabase
            .from('baiyezhan_rooms')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(20);
        return (data as unknown as Room[]) || [];
    },

    createRoom: async (ownerId: string, name: string, roomType: string, config: { roundDuration: number, broadcastInterval: number, bgmTrack?: string, coverImage?: string, password?: string, baiyeId?: string }): Promise<RoomData> => {
        const roomCode = Math.floor(1000 + Math.random() * 9000).toString();

        // 1. Create Room
        const { data: room, error: roomError } = await supabase
            .from('baiyezhan_rooms')
            .insert({
                owner_id: ownerId,
                room_code: roomCode,
                name: name,
                room_type: roomType,
                round_duration: config.roundDuration,
                broadcast_interval: config.broadcastInterval,
                bgm_track: config.bgmTrack || 'default',
                cover_image: config.coverImage || 'default',
                password: config.password || null,
                baiye_id: config.baiyeId || null
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

    joinRoom: async (userId: string, roomCode: string, password?: string): Promise<RoomData | null> => {
        // 1. Find Room
        const { data: room, error: roomError } = await supabase
            .from('baiyezhan_rooms')
            .select('*')
            .eq('room_code', roomCode)
            .single();

        if (roomError || !room) return null;

        // 2. Validate password if room has one
        if (room.password && room.password !== password) {
            throw new Error('INVALID_PASSWORD');
        }

        // 2. Check/Add Member
        const { data: existingMember } = await supabase
            .from('baiyezhan_room_members')
            .select('*')
            .eq('room_id', room.id)
            .eq('user_id', userId)
            .single();

        if (!existingMember) {
            // Get max order index to safely append
            const { data: maxMember } = await supabase
                .from('baiyezhan_room_members')
                .select('order_index')
                .eq('room_id', room.id)
                .order('order_index', { ascending: false })
                .limit(1)
                .single();

            const nextIndex = maxMember ? maxMember.order_index + 1 : 0;

            await supabase
                .from('baiyezhan_room_members')
                .insert({
                    room_id: room.id,
                    user_id: userId,
                    order_index: nextIndex
                });
        }

        return SupabaseService.getRoomState(room.id);
    },

    leaveRoom: async (roomId: string, userId: string): Promise<void> => {
        // 1. Delete member
        await supabase
            .from('baiyezhan_room_members')
            .delete()
            .eq('room_id', roomId)
            .eq('user_id', userId);

        // 2. Atomic reorder via RPC (replaces client-side loop)
        await supabase.rpc('reorder_room_members', { p_room_id: roomId });
    },

    /**
     * Kick a member from a room (VIP/Admin only)
     */
    kickMember: async (roomId: string, targetUserId: string): Promise<void> => {
        const user = await SupabaseService.getUser();
        if (!user) throw new Error('Not authenticated');

        // Only VIP and Admin can kick
        if (user.role !== 'vip' && user.role !== 'admin') {
            throw new Error('Permission denied');
        }

        // Cannot kick yourself
        if (user.id === targetUserId) {
            throw new Error('Cannot kick yourself');
        }

        // Delete the member
        await supabase
            .from('baiyezhan_room_members')
            .delete()
            .eq('room_id', roomId)
            .eq('user_id', targetUserId);

        // Reorder remaining members
        await supabase.rpc('reorder_room_members', { p_room_id: roomId });
    },

    /**
     * Check if a user is still a member of a room
     */
    isInRoom: async (roomId: string, userId: string): Promise<boolean> => {
        const { data, error } = await supabase
            .from('baiyezhan_room_members')
            .select('user_id')
            .eq('room_id', roomId)
            .eq('user_id', userId)
            .single();

        return !!data && !error;
    },

    getRoomState: async (roomId: string): Promise<RoomData | null> => {
        const { data: room } = await supabase.from('baiyezhan_rooms').select('*').eq('id', roomId).single();
        if (!room) return null;

        const { data: state, error: stateError } = await supabase
            .from('baiyezhan_room_state')
            .select('*')
            .eq('room_id', roomId)
            .single();

        if (stateError) {
            console.error("Failed to fetch room state:", stateError);
            // Self-healing: If state is missing (PGRST116), create it.
            if (stateError.code === 'PGRST116') {
                console.log("State missing for room, attempting self-healing...");
                const { data: newState, error: createError } = await supabase
                    .from('baiyezhan_room_state')
                    .insert({
                        room_id: roomId,
                        round_start_time: null,
                        is_running: false
                    })
                    .select()
                    .single();

                if (createError) {
                    console.error("Self-healing failed:", createError);
                    return null;
                }
                // Use the newly created state
                // We need to re-assign 'state' but it's const, so we handle it by returning early with new data?
                // Or we can just let the flow continue if we can assign it.
                // Since 'state' is const, we can't reassign. 
                // Let's refactor to let 'state' be mutable or handle it differently.

                // Actually, simpler to just return here?
                // We still need 'members'. 
                const { data: members } = await supabase
                    .from('baiyezhan_room_members')
                    .select('*, user:baiyezhan_users(*)')
                    .eq('room_id', roomId);

                return {
                    room,
                    state: newState,
                    members: members?.map(m => ({
                        ...m,
                        user: m.user
                    })) || []
                } as unknown as RoomData;
            }
            return null;
        }
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
    },

    nextTurn: async (roomId: string, nextTick: number): Promise<void> => {
        // In Manual Mode, we reuse 'round_start_time' to store the integer TICK
        // This avoids adding a new column to the DBSchema.
        const { error } = await supabase.from('baiyezhan_room_state').update({
            round_start_time: nextTick,
            is_running: true // Ensure it's marked accurate
        }).eq('room_id', roomId);

        if (error) throw error;
    },
    uploadFile: async (file: File, folder: 'sounds' | 'image'): Promise<string> => {
        const fileExt = file.name.split('.').pop();
        const fileName = `${Math.random()}.${fileExt}`;
        const filePath = `${folder}/${fileName}`; // Use folder structure

        const { error: uploadError } = await supabase.storage
            .from('baiyezhan') // Hardcoded single bucket
            .upload(filePath, file);

        if (uploadError) {
            throw uploadError;
        }

        const { data } = supabase.storage.from('baiyezhan').getPublicUrl(filePath);
        return data.publicUrl;
    },

    // HEARTBEAT SYSTEM
    sendHeartbeat: async (roomId: string, userId: string): Promise<void> => {
        await supabase
            .from('baiyezhan_room_members')
            .update({ last_seen: new Date().toISOString() })
            .eq('room_id', roomId)
            .eq('user_id', userId);
    },

    cleanupInactiveMembers: async (roomId: string, timeoutIds: string[] = []): Promise<void> => {
        // We delete members who haven't updated last_seen in > 120 seconds (2 minutes)
        // Increased from 30s to handle network fluctuations better

        // Calculate cutoff time (120 seconds ago)
        const cutoff = new Date(Date.now() - 120 * 1000).toISOString();

        const { data: deleted, error } = await supabase
            .from('baiyezhan_room_members')
            .delete()
            .eq('room_id', roomId)
            .lt('last_seen', cutoff)
            .select('user_id');  // Return deleted rows to check if any were removed

        if (error) {
            console.error("Cleanup failed:", error);
            return;
        }

        // Only reorder if we actually deleted someone
        if (deleted && deleted.length > 0) {
            console.log(`Cleaned up ${deleted.length} inactive member(s), reordering...`);
            await supabase.rpc('reorder_room_members', { p_room_id: roomId });
        }
    },

    updateRoomConfig: async (roomId: string, config: { roundDuration?: number, broadcastInterval?: number, bgmTrack?: string, coverImage?: string, name?: string, password?: string | null }) => {
        const updatePayload: any = {};
        if (config.roundDuration !== undefined) updatePayload.round_duration = config.roundDuration;
        if (config.broadcastInterval !== undefined) updatePayload.broadcast_interval = config.broadcastInterval;
        if (config.bgmTrack !== undefined) updatePayload.bgm_track = config.bgmTrack;
        if (config.coverImage !== undefined) updatePayload.cover_image = config.coverImage;
        if (config.name !== undefined) updatePayload.name = config.name;
        if (config.password !== undefined) updatePayload.password = config.password;

        const { error } = await supabase
            .from('baiyezhan_rooms')
            .update(updatePayload)
            .eq('id', roomId);

        if (error) throw error;
    },

    // ============ ROLE-BASED METHODS ============

    /**
     * Check if a user can create rooms based on their role
     */
    canCreateRoom: (role: UserRole): boolean => {
        return role === 'admin' || role === 'vip';
    },

    /**
     * Check if a user can delete a room
     * Admin can delete any room, others cannot delete
     */
    canDeleteRoom: (role: UserRole, isOwner: boolean): boolean => {
        return role === 'admin';
    },

    /**
     * Check if a user can modify a room
     * Admin can modify any, VIP can modify own rooms
     */
    canModifyRoom: (role: UserRole, isOwner: boolean): boolean => {
        if (role === 'admin') return true;
        if (role === 'vip' && isOwner) return true;
        return false;
    },

    /**
     * Delete a room and all related data
     * Only admin can delete rooms
     */
    deleteRoom: async (roomId: string, userId: string): Promise<void> => {
        // Get user role
        const user = await SupabaseService.getUser();
        if (!user) throw new Error('Not authenticated');

        // Get room to check ownership
        const { data: room } = await supabase
            .from('baiyezhan_rooms')
            .select('owner_id')
            .eq('id', roomId)
            .single();

        if (!room) throw new Error('Room not found');

        const isOwner = room.owner_id === userId;
        if (!SupabaseService.canDeleteRoom(user.role, isOwner)) {
            throw new Error('Permission denied');
        }

        // Delete in order: members -> state -> room
        await supabase.from('baiyezhan_room_members').delete().eq('room_id', roomId);
        await supabase.from('baiyezhan_room_state').delete().eq('room_id', roomId);
        const { error } = await supabase.from('baiyezhan_rooms').delete().eq('id', roomId);

        if (error) throw error;
    },

    // ============ ADMIN METHODS ============

    /**
     * Get all users (admin only)
     */
    getAllUsers: async (): Promise<User[]> => {
        const { data, error } = await supabase
            .from('baiyezhan_users')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;
        return (data as User[]) || [];
    },

    /**
     * Update a user's role (admin only)
     */
    updateUserRole: async (targetUserId: string, newRole: UserRole): Promise<void> => {
        const { error } = await supabase
            .from('baiyezhan_users')
            .update({ role: newRole })
            .eq('id', targetUserId);

        if (error) throw error;
    },

    /**
     * Check if current user is admin
     */
    isAdmin: async (): Promise<boolean> => {
        const user = await SupabaseService.getUser();
        return user?.role === 'admin';
    }
};

"use client";

import { PixelButton } from "@/components/pixel/pixel-button";
import { PixelCard } from "@/components/pixel/pixel-card";
import { PixelInput } from "@/components/pixel/pixel-input";
import { SupabaseService } from "@/services/supabase-service";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function HallPage() {
    const router = useRouter();
    const [userId, setUserId] = useState<string | null>(null);

    // Create Config
    const [roomName, setRoomName] = useState("");
    const [roomType, setRoomType] = useState("wuming");
    const [isCreating, setIsCreating] = useState(false);

    // Join Config
    const [roomCode, setRoomCode] = useState("");
    const [isJoining, setIsJoining] = useState(false);

    // Room List
    const [rooms, setRooms] = useState<any[]>([]);
    const [lastRefreshed, setLastRefreshed] = useState(new Date());

    useEffect(() => {
        const checkUser = async () => {
            const user = await SupabaseService.getUser();
            if (!user) {
                router.push("/login");
            } else {
                setUserId(user.id);
            }
        };
        checkUser();
    }, [router]);

    // Fetch Rooms
    const fetchRooms = async () => {
        const list = await SupabaseService.getRooms();
        setRooms(list);
        setLastRefreshed(new Date());
    };

    // Auto Refresh
    useEffect(() => {
        fetchRooms();
        const interval = setInterval(fetchRooms, 5000);
        return () => clearInterval(interval);
    }, []);

    const handleCreate = async () => {
        if (!userId) return;
        if (!roomName) return alert("请输入房间名");

        setIsCreating(true);
        try {
            const { room } = await SupabaseService.createRoom(userId, roomName, roomType);
            router.push(`/room/${room.id}`);
        } catch (e: any) {
            console.error("Create Room Error:", e);
            alert("创建房间失败: " + (e.message || JSON.stringify(e)));
        } finally {
            setIsCreating(false);
        }
    };

    const handleJoin = async (e: React.FormEvent | null, code: string) => {
        if (e) e.preventDefault();
        if (!userId || !code) return;
        setIsJoining(true);
        try {
            const data = await SupabaseService.joinRoom(userId, code);
            if (data) {
                router.push(`/room/${data.room.id}`);
            }
        } catch (e) {
            console.error(e);
            alert("Room not found or error joining");
        } finally {
            setIsJoining(false);
        }
    };

    if (!userId) return null;

    return (
        <main className="flex min-h-screen flex-col bg-neutral-900 p-4 pb-20">
            {/* Header */}
            <div className="mb-8 flex justify-between items-center max-w-6xl mx-auto w-full border-b-4 border-white/10 pb-4">
                <div>
                    <h1 className="text-3xl font-bold text-white uppercase tracking-wider text-shadow-pixel">
                        百业大厅
                    </h1>
                    <p className="text-neutral-500 text-xs">潘荙荙是世界上最帅的开发</p>
                </div>
                <button
                    onClick={async () => {
                        await SupabaseService.logout();
                        router.push("/login");
                    }}
                    className="text-red-400 hover:text-red-300 font-bold uppercase text-sm"
                >
                    [ 退出系统 ]
                </button>
            </div>

            <div className="flex w-full max-w-6xl mx-auto flex-col gap-8 lg:flex-row items-start">

                {/* Left Column: Actions */}
                <div className="flex flex-col gap-6 w-full lg:w-1/3 shrink-0">
                    {/* Create Room */}
                    <PixelCard className="space-y-4 bg-neutral-800">
                        <div className="text-xl font-bold text-yellow-500 uppercase border-b-2 border-yellow-500/20 pb-2">
                            创建房间
                        </div>

                        <div className="space-y-4">
                            <PixelInput
                                label="房间名称"
                                placeholder="例如：进攻无名一队"
                                value={roomName}
                                onChange={(e) => setRoomName(e.target.value)}
                            />

                            <div className="space-y-2">
                                <label className="text-sm font-bold uppercase tracking-wider text-neutral-400">作战类型</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {['wuming', 'healer'].map(type => (
                                        <button
                                            key={type}
                                            onClick={() => setRoomType(type)}
                                            className={`p-2 text-xs font-bold uppercase border-2 transition-all ${roomType === type
                                                ? 'bg-yellow-500 border-black text-black'
                                                : 'bg-neutral-900 border-neutral-700 text-neutral-400 hover:border-white'
                                                }`}
                                        >
                                            {type === 'wuming' && '无名小弟'}
                                            {type === 'healer' && '霖霖大王'}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <PixelButton
                                className="w-full"
                                onClick={handleCreate}
                                isLoading={isCreating}
                            >
                                确认创建
                            </PixelButton>
                        </div>
                    </PixelCard>

                    {/* Join by Code */}
                    <PixelCard className="space-y-4 bg-neutral-800">
                        <div className="text-xl font-bold text-blue-400 uppercase border-b-2 border-blue-400/20 pb-2">
                            加入房间
                        </div>
                        <form onSubmit={(e) => handleJoin(e, roomCode)} className="space-y-4">
                            <PixelInput
                                placeholder="输入4位房间码"
                                value={roomCode}
                                onChange={(e) => setRoomCode(e.target.value)}
                                className="text-center text-lg tracking-[0.5em] font-mono"
                                maxLength={4}
                            />
                            <PixelButton
                                variant="secondary"
                                className="w-full"
                                type="submit"
                                isLoading={isJoining}
                                disabled={!roomCode}
                            >
                                加入房间
                            </PixelButton>
                        </form>
                    </PixelCard>
                </div>

                {/* Right Column: Room List */}
                <div className="flex-1 w-full">
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-xl font-bold text-white uppercase">
                            活跃频道 ({rooms.length})
                        </h2>
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-neutral-500 font-mono">
                                UPDATED: {lastRefreshed.toLocaleTimeString()}
                            </span>
                            <button
                                onClick={fetchRooms}
                                className="p-2 border-2 border-neutral-600 bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-bold uppercase"
                            >
                                刷新
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {rooms.map(room => (
                            <div
                                key={room.id}
                                className="relative group border-4 border-black bg-neutral-800 p-4 transition-all hover:-translate-y-1 hover:shadow-[4px_4px_0_0_#facc15]"
                            >
                                <div className="flex justify-between items-start mb-2">
                                    <div className="font-bold text-white truncate pr-2">{room.name}</div>
                                    <div className="bg-neutral-900 border border-neutral-700 px-2 py-0.5 text-[10px] text-neutral-400 uppercase">
                                        {room.room_type}
                                    </div>
                                </div>
                                <div className="flex justify-between items-end mt-4">
                                    <div className="text-2xl font-mono text-yellow-500 tracking-widest">
                                        {room.room_code}
                                    </div>
                                    <button
                                        onClick={() => handleJoin(null, room.room_code)}
                                        className="bg-white text-black px-4 py-1 text-xs font-bold border-2 border-black hover:bg-yellow-400"
                                    >
                                        JOIN &gt;
                                    </button>
                                </div>
                            </div>
                        ))}

                        {rooms.length === 0 && (
                            <div className="col-span-full py-12 text-center border-2 border-dashed border-neutral-700 text-neutral-500">
                                暂无活跃房间，请创建...
                            </div>
                        )}
                    </div>
                </div>

            </div>
        </main>
    );
}

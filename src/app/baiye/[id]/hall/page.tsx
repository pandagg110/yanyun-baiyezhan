"use client";

import { AdminBatchPanel } from "@/components/feature/admin-batch-panel";
import { Guestbook } from "@/components/feature/guestbook";
import { TodoPanel } from "@/components/feature/todo-panel";
import { PixelButton } from "@/components/pixel/pixel-button";
import { PixelCard } from "@/components/pixel/pixel-card";
import { PixelInput } from "@/components/pixel/pixel-input";
import { SupabaseService } from "@/services/supabase-service";
import { Baiye, Room, User } from "@/types/app";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, useRef } from "react";

// Helper to unlock audio before entering room
// This must be called from a user interaction (click) context
function unlockAudioContext() {
    try {
        // Method 1: Play and pause a silent audio
        const audio = new Audio("data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA");
        audio.volume = 0;
        audio.play().then(() => {
            audio.pause();
            console.log("Audio context unlocked successfully");
        }).catch(() => {
            // Ignore errors, we tried our best
        });

        // Method 2: Resume AudioContext if available
        if (typeof AudioContext !== 'undefined') {
            const ctx = new AudioContext();
            if (ctx.state === 'suspended') {
                ctx.resume();
            }
        }
    } catch (e) {
        console.warn("Audio unlock attempt failed:", e);
    }
}

export default function BaiyeHallPage() {
    const params = useParams();
    const baiyeId = params.id as string;
    const router = useRouter();

    const [user, setUser] = useState<User | null>(null);
    const [baiye, setBaiye] = useState<Baiye | null>(null);
    const [rooms, setRooms] = useState<Room[]>([]);
    const [loading, setLoading] = useState(true);
    const [lastRefreshed, setLastRefreshed] = useState(new Date());

    // Create Config
    const [roomName, setRoomName] = useState("");
    const [roomType, setRoomType] = useState("wuming");
    const [roundDuration, setRoundDuration] = useState(80);
    const [broadcastInterval, setBroadcastInterval] = useState(10);
    const [bgmTrack, setBgmTrack] = useState("default");
    const [coverImage, setCoverImage] = useState("default");
    const [roomPassword, setRoomPassword] = useState("");
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [canCreateRoom, setCanCreateRoom] = useState(false);

    // Join Config
    const [roomCode, setRoomCode] = useState("");
    const [joinPassword, setJoinPassword] = useState("");
    const [isJoining, setIsJoining] = useState(false);

    // Todo refresh
    const [todoRefreshKey, setTodoRefreshKey] = useState(0);

    useEffect(() => {
        const init = async () => {
            const u = await SupabaseService.getUser();
            if (!u) {
                router.push("/login");
                return;
            }
            setUser(u);

            // Fetch baiye info
            const b = await SupabaseService.getBaiye(baiyeId);
            if (!b) {
                router.push("/baiye");
                return;
            }
            setBaiye(b);

            // Check room create permission
            const can = await SupabaseService.canCreateRoomAsync(u.role, u.id);
            setCanCreateRoom(can);

            setLoading(false);
        };
        init();
    }, [router, baiyeId]);

    // Fetch Rooms
    const fetchRooms = async () => {
        const list = await SupabaseService.getRoomsByBaiye(baiyeId);
        setRooms(list);
        setLastRefreshed(new Date());
    };

    // Auto Refresh
    useEffect(() => {
        if (!baiyeId) return;
        fetchRooms();
        const interval = setInterval(fetchRooms, 5000);
        return () => clearInterval(interval);
    }, [baiyeId]);

    const handleCreate = async () => {
        // Unlock audio context on user click - this allows audio to play later in the room
        unlockAudioContext();

        if (!user || !baiye) return;
        if (!roomName) return alert("请输入房间名");
        if (!canCreateRoom) {
            return alert("你没有创建房间的权限或已达上限");
        }

        setIsCreating(true);
        try {
            const { room } = await SupabaseService.createRoom(
                user.id,
                roomName,
                roomType,
                {
                    roundDuration,
                    broadcastInterval,
                    bgmTrack,
                    coverImage,
                    password: roomPassword || undefined,
                    baiyeId: baiyeId
                }
            );
            router.push(`/room/${room.id}`);
        } catch (e: any) {
            console.error("Create Room Error:", e);
            alert("创建房间失败: " + (e.message || JSON.stringify(e)));
        } finally {
            setIsCreating(false);
        }
    };

    const handleJoin = async (e: React.FormEvent | null, code: string, password?: string) => {
        // Unlock audio context on user click - this allows audio to play later in the room
        unlockAudioContext();

        if (e) e.preventDefault();
        if (!user) return;
        if (!code) return alert("请输入房间码");

        setIsJoining(true);
        try {
            const data = await SupabaseService.joinRoom(user.id, code, password);
            if (!data) {
                throw new Error("Room not found");
            }
            router.push(`/room/${data.room.id}`);
        } catch (e: any) {
            console.error(e);
            if (e.message === 'INVALID_PASSWORD') {
                alert("密码错误，请输入正确的房间密码");
            } else {
                alert("房间不存在或加入失败");
            }
        } finally {
            setIsJoining(false);
        }
    };

    if (loading) {
        return <div className="min-h-screen bg-neutral-900 flex items-center justify-center text-white">正在加载...</div>;
    }

    return (
        <main className="min-h-screen bg-neutral-900 text-white p-4 md:p-8">
            {/* Header */}
            <header className="max-w-6xl mx-auto flex justify-between items-center mb-8 border-b-4 border-black pb-4">
                <div>
                    <button
                        onClick={() => router.push("/baiye")}
                        className="text-xs text-neutral-500 hover:text-white mb-1"
                    >
                        ← 返回百业列表
                    </button>
                    <h1 className="text-2xl font-bold text-yellow-500 uppercase">{baiye?.name}</h1>
                    {baiye?.description && (
                        <p className="text-xs text-neutral-500">{baiye.description}</p>
                    )}
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => router.push(`/baiye/${baiyeId}/card`)}
                        className="text-xs text-green-400 hover:text-green-300 font-bold uppercase transition-colors"
                    >
                        [ 🎴 战场明信片 ]
                    </button>
                    <button
                        onClick={() => router.push("/profile")}
                        className="text-xs text-neutral-500 hover:text-white font-bold uppercase transition-colors"
                    >
                        [ {user?.character_name} ]
                    </button>
                </div>
            </header>

            <div className="max-w-6xl mx-auto flex flex-col lg:flex-row gap-6">
                {/* Left Column: Actions */}
                <div className="flex flex-col gap-6 w-full lg:w-1/3 shrink-0">
                    {/* Match Navigation */}
                    <PixelCard className="bg-neutral-800 space-y-3">
                        <div className="text-xl font-bold text-yellow-500 uppercase border-b-2 border-yellow-500/20 pb-2">
                            百业战
                        </div>
                        <div className="flex flex-col gap-2">
                            {(user?.role === 'admin' || user?.role === 'vip') && (
                                <button
                                    onClick={() => router.push(`/baiye/${baiyeId}/stats`)}
                                    className="w-full py-3 bg-gradient-to-r from-yellow-500 to-yellow-600 text-black font-bold text-sm border-2 border-yellow-700 hover:from-yellow-400 hover:to-yellow-500 transition-all shadow-[2px_2px_0_0_#000] active:shadow-none active:translate-x-[2px] active:translate-y-[2px]"
                                >
                                    📊 战绩录入
                                </button>
                            )}
                            <button
                                onClick={() => router.push(`/baiye/${baiyeId}/matches`)}
                                className="w-full py-3 bg-neutral-700 text-white font-bold text-sm border-2 border-neutral-600 hover:bg-neutral-600 transition-all shadow-[2px_2px_0_0_#000] active:shadow-none active:translate-x-[2px] active:translate-y-[2px]"
                            >
                                📋 对战记录
                            </button>
                            <button
                                onClick={() => router.push(`/baiye/${baiyeId}/analysis`)}
                                className="w-full py-3 bg-gradient-to-r from-cyan-600 to-blue-600 text-white font-bold text-sm border-2 border-cyan-700 hover:from-cyan-500 hover:to-blue-500 transition-all shadow-[2px_2px_0_0_#000] active:shadow-none active:translate-x-[2px] active:translate-y-[2px]"
                            >
                                📈 对战分析
                            </button>
                        </div>
                    </PixelCard>

                    {/* Todo Panel - visible to all */}
                    <TodoPanel
                        key={todoRefreshKey}
                        baiyeId={baiyeId}
                        isAdmin={user?.role === 'admin'}
                    />

                    {/* Feedback Button - links to standalone page (supports unauthenticated users) */}
                    <button
                        onClick={() => router.push(`/baiye/${baiyeId}/feedback`)}
                        className="w-full py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold text-sm border-4 border-black hover:from-purple-500 hover:to-pink-500 transition-all shadow-[4px_4px_0_0_#000] active:shadow-none active:translate-x-[2px] active:translate-y-[2px]"
                    >
                        📝 战后反馈
                    </button>

                    {/* Admin Batch Panel */}
                    {user?.role === 'admin' && (
                        <AdminBatchPanel
                            baiyeId={baiyeId}
                            onTodosGenerated={() => setTodoRefreshKey(k => k + 1)}
                        />
                    )}

                    {/* Create Room - Only for VIP/Admin */}
                    {canCreateRoom && (
                        <PixelCard className="space-y-4 bg-neutral-800">
                            <div className="text-xl font-bold text-yellow-500 uppercase border-b-2 border-yellow-500/20 pb-2">
                                创建房间
                            </div>
                            <PixelInput
                                label="房间名"
                                placeholder="输入房间名"
                                value={roomName}
                                onChange={(e) => setRoomName(e.target.value)}
                            />
                            <div className="space-y-2">
                                <label className="text-sm font-bold uppercase tracking-wider text-neutral-400">房间类型</label>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setRoomType("wuming")}
                                        className={`flex-1 py-2 text-sm font-bold border-2 transition-colors ${roomType === 'wuming' ? 'bg-yellow-500 text-black border-yellow-600' : 'bg-neutral-700 text-white border-neutral-600 hover:border-neutral-500'}`}
                                    >
                                        轮询轴
                                    </button>
                                    <button
                                        disabled
                                        className="flex-1 py-2 text-sm font-bold border-2 bg-neutral-800 text-neutral-500 border-neutral-700 cursor-not-allowed"
                                        title="传递轴模式暂时关闭维护中"
                                    >
                                        传递轴 (维护中)
                                    </button>
                                </div>
                            </div>

                            {/* Advanced Toggle */}
                            <button
                                onClick={() => setShowAdvanced(!showAdvanced)}
                                className="text-xs text-neutral-500 hover:text-white underline"
                            >
                                {showAdvanced ? "▼ 收起高级选项" : "▶ 展开高级选项"}
                            </button>

                            {showAdvanced && (
                                <div className="space-y-4 pt-2 border-t border-neutral-700">
                                    {/* Room Password */}
                                    <div className="space-y-2">
                                        <label className="text-sm font-bold uppercase tracking-wider text-neutral-400">房间密码 (可选)</label>
                                        <input
                                            type="password"
                                            placeholder="留空则无密码"
                                            value={roomPassword}
                                            onChange={(e) => setRoomPassword(e.target.value)}
                                            className="w-full bg-neutral-900 border-2 border-neutral-700 rounded p-2 text-sm text-white focus:border-yellow-500 outline-none"
                                        />
                                    </div>
                                </div>
                            )}

                            <PixelButton
                                className="w-full"
                                onClick={handleCreate}
                                isLoading={isCreating}
                                disabled={!roomName}
                            >
                                创建房间
                            </PixelButton>
                        </PixelCard>
                    )}

                    {/* Join by Code */}
                    <PixelCard className="space-y-4 bg-neutral-800">
                        <div className="text-xl font-bold text-blue-400 uppercase border-b-2 border-blue-400/20 pb-2">
                            加入房间
                        </div>
                        <form onSubmit={(e) => handleJoin(e, roomCode, joinPassword)} className="space-y-4">
                            <PixelInput
                                placeholder="输入4位房间码"
                                value={roomCode}
                                onChange={(e) => setRoomCode(e.target.value)}
                                className="text-center text-lg tracking-[0.5em] font-mono"
                                maxLength={4}
                            />
                            <input
                                type="password"
                                placeholder="房间密码 (如有)"
                                value={joinPassword}
                                onChange={(e) => setJoinPassword(e.target.value)}
                                className="w-full bg-neutral-900 border-2 border-neutral-700 rounded p-2 text-sm text-white focus:border-blue-500 outline-none text-center"
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
                            房间列表 ({rooms.length})
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
                        {rooms.map(room => {
                            const hasCustomImage = room.cover_image && room.cover_image !== 'default';
                            const hue = parseInt(room.id.slice(0, 2), 16) * 10;
                            const bgGradient = `linear-gradient(135deg, hsl(${hue}, 20%, 15%), hsl(${hue + 40}, 20%, 10%))`;

                            return (
                                <div
                                    key={room.id}
                                    className="relative group border-4 border-black bg-neutral-800 transition-all hover:-translate-y-1 hover:shadow-[4px_4px_0_0_#facc15] overflow-hidden"
                                >
                                    {/* Cover Image Area */}
                                    <div className="h-32 w-full relative border-b-4 border-black">
                                        {hasCustomImage ? (
                                            <img src={room.cover_image} alt="Room" className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-500" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center select-none" style={{ background: bgGradient }}>
                                                <div className="font-bold text-5xl text-white/5 uppercase tracking-tighter transform -rotate-12">
                                                    {room.room_type}
                                                </div>
                                            </div>
                                        )}
                                        {/* Admin Delete Button */}
                                        {user?.role === 'admin' && (
                                            <button
                                                onClick={async (e) => {
                                                    e.stopPropagation();
                                                    if (!confirm(`确定要删除房间 "${room.name}" 吗？`)) return;
                                                    try {
                                                        await SupabaseService.deleteRoom(room.id, user.id);
                                                        await fetchRooms();
                                                    } catch (err: any) {
                                                        alert("删除失败: " + (err.message || JSON.stringify(err)));
                                                    }
                                                }}
                                                className="absolute top-2 left-2 w-6 h-6 bg-red-600 hover:bg-red-500 text-white font-bold text-sm border-2 border-black flex items-center justify-center transition-colors z-10"
                                                title="删除房间"
                                            >
                                                ✕
                                            </button>
                                        )}
                                        {/* Badge */}
                                        <div className="absolute top-2 right-2 bg-black/80 px-2 py-0.5 text-[10px] text-yellow-500 font-bold border border-yellow-500/50 backdrop-blur-sm">
                                            {room.room_type === 'healer' ? '传递轴' : '轮询轴'}
                                        </div>
                                    </div>

                                    {/* Content Area */}
                                    <div className="p-3">
                                        <div className="font-bold text-white truncate text-lg mb-1 shadow-black drop-shadow-md">{room.name}</div>

                                        <div className="flex justify-between items-end mt-2">
                                            <div className="flex items-center gap-2">
                                                <div className="text-xl font-mono text-neutral-500 group-hover:text-yellow-500 transition-colors tracking-widest">
                                                    {room.room_code}
                                                </div>
                                                {room.password && (
                                                    <span className="text-yellow-500" title="需要密码">
                                                        🔒
                                                    </span>
                                                )}
                                            </div>
                                            <button
                                                onClick={() => {
                                                    if (room.password) {
                                                        const pwd = prompt("请输入房间密码:");
                                                        if (pwd !== null) {
                                                            handleJoin(null, room.room_code, pwd);
                                                        }
                                                    } else {
                                                        handleJoin(null, room.room_code);
                                                    }
                                                }}
                                                className="bg-white text-black px-4 py-1 text-xs font-bold border-2 border-black hover:bg-yellow-400 transition-colors"
                                            >
                                                JOIN &gt;
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}

                        {rooms.length === 0 && (
                            <div className="col-span-full py-12 text-center border-2 border-dashed border-neutral-700 text-neutral-500 bg-neutral-900/50">
                                此百业下暂无房间，{canCreateRoom ? "点击左侧创建一个" : "等待创建..."}
                            </div>
                        )}
                    </div>
                </div>
            </div>


            {/* Guestbook Section */}
            <div className="w-full max-w-6xl mx-auto mt-12 mb-8">
                <Guestbook type="baiye" targetId={baiyeId} />
            </div>

        </main >
    );
}

"use client";

import { Guestbook } from "@/components/feature/guestbook";
import { PixelButton } from "@/components/pixel/pixel-button";
import { PixelCard } from "@/components/pixel/pixel-card";
import { PixelInput } from "@/components/pixel/pixel-input";
import { SupabaseService } from "@/services/supabase-service";
import { User } from "@/types/app";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function HallPage() {
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);

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

    // Join Config
    const [roomCode, setRoomCode] = useState("");
    const [joinPassword, setJoinPassword] = useState("");
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
                setUser(user);
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
        if (!user) return;
        if (!roomName) return alert("请输入房间名");
        if (!SupabaseService.canCreateRoom(user.role)) {
            return alert("你没有创建房间的权限");
        }

        setIsCreating(true);
        try {
            const { room } = await SupabaseService.createRoom(
                user.id,
                roomName,
                roomType,
                { roundDuration, broadcastInterval, bgmTrack, coverImage, password: roomPassword || undefined }
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
        if (e) e.preventDefault();
        if (!user || !code) return;
        setIsJoining(true);
        try {
            const data = await SupabaseService.joinRoom(user.id, code, password);
            if (data) {
                router.push(`/room/${data.room.id}`);
            }
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

    if (!user) return null;

    return (
        <main className="flex min-h-screen flex-col bg-neutral-900 p-4 pb-20">
            {/* Header */}
            <div className="mb-8 flex justify-between items-center max-w-6xl mx-auto w-full border-b-4 border-white/10 pb-4">
                <div>
                    <h1 className="text-3xl font-bold text-white uppercase tracking-wider text-shadow-pixel">
                        百业大厅
                    </h1>
                    <div className="flex items-center gap-2 mt-1">
                        <span className="text-neutral-500 text-xs">指挥官:</span>
                        <span className="text-yellow-500 font-bold font-mono terminal-text">
                            {user.character_name}
                        </span>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    {user.role === 'admin' && (
                        <button
                            onClick={() => router.push("/admin")}
                            className="text-red-400 hover:text-red-300 font-bold uppercase text-sm"
                        >
                            [ 用户管理 ]
                        </button>
                    )}
                    <button
                        onClick={() => router.push("/profile")}
                        className="text-neutral-500 hover:text-white font-bold uppercase text-sm"
                    >
                        [ 个人档案 ]
                    </button>
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
            </div>

            <div className="flex w-full max-w-6xl mx-auto flex-col gap-8 lg:flex-row items-start">

                {/* Left Column: Actions */}
                <div className="flex flex-col gap-6 w-full lg:w-1/3 shrink-0">
                    {/* Create Room - Only for VIP/Admin */}
                    {SupabaseService.canCreateRoom(user.role) && (
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
                                        <button
                                            onClick={() => setRoomType("wuming")}
                                            className={`p-2 text-xs font-bold uppercase border-2 transition-all ${roomType === 'wuming'
                                                ? 'bg-yellow-500 border-black text-black'
                                                : 'bg-neutral-900 border-neutral-700 text-neutral-400 hover:border-white'
                                                }`}
                                        >
                                            轮询轴
                                        </button>
                                        <button
                                            disabled
                                            className="p-2 text-xs font-bold uppercase border-2 bg-neutral-800 border-neutral-700 text-neutral-500 cursor-not-allowed"
                                            title="传递轴模式暂时关闭维护中"
                                        >
                                            传递轴 (维护中)
                                        </button>
                                    </div>
                                </div>

                                {/* Advanced Config Section */}
                                <div className="pt-4 border-t border-neutral-700">
                                    <button
                                        className="w-full flex justify-between items-center text-xs uppercase font-bold text-neutral-500 hover:text-white mb-4 transition-colors"
                                        onClick={() => setShowAdvanced(!showAdvanced)}
                                    >
                                        <span>高级配置 (Advanced)</span>
                                        <span>{showAdvanced ? '[-]' : '[+]'}</span>
                                    </button>

                                    {showAdvanced && (
                                        <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                                            {/* Sliders */}
                                            <div className="space-y-2">
                                                <label className="text-sm flex justify-between text-neutral-400 font-bold uppercase tracking-wider">
                                                    <span>一轮时长</span>
                                                    <span className="text-yellow-500">{roundDuration}s</span>
                                                </label>
                                                <input
                                                    type="range"
                                                    min="50" max="90" step="1"
                                                    value={roundDuration}
                                                    onChange={(e) => setRoundDuration(Number(e.target.value))}
                                                    className="w-full h-2 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-yellow-500"
                                                />
                                            </div>

                                            <div className="space-y-2">
                                                <label className="text-sm flex justify-between text-neutral-400 font-bold uppercase tracking-wider">
                                                    <span>播报间隔</span>
                                                    <span className="text-yellow-500">{broadcastInterval}s</span>
                                                </label>
                                                <input
                                                    type="range"
                                                    min="6" max="14" step="0.5"
                                                    value={broadcastInterval}
                                                    onChange={(e) => setBroadcastInterval(Number(e.target.value))}
                                                    className="w-full h-2 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-yellow-500"
                                                />
                                            </div>

                                            {/* Customization */}
                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="space-y-2">
                                                    <label className="text-sm font-bold uppercase tracking-wider text-neutral-400">播报音乐</label>
                                                    <div className="flex flex-col gap-2">
                                                        <select
                                                            value={bgmTrack.startsWith('http') ? 'custom' : bgmTrack}
                                                            onChange={(e) => {
                                                                const val = e.target.value;
                                                                if (val !== 'custom') setBgmTrack(val);
                                                            }}
                                                            className="w-full bg-neutral-900 border-2 border-neutral-700 rounded p-2 text-sm text-white focus:border-yellow-500 outline-none"
                                                        >
                                                            <option value="default">默认</option>
                                                            <option value="battle_1">战斗 I</option>
                                                            <option value="battle_2">战斗 II</option>
                                                            <option value="custom" disabled={!bgmTrack.startsWith('http')}>自定义上传</option>
                                                        </select>
                                                        <div className="relative border-2 border-dashed border-neutral-700 rounded hover:border-yellow-500 transition-colors group">
                                                            <input
                                                                type="file"
                                                                accept="audio/*"
                                                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                                                onChange={async (e) => {
                                                                    const file = e.target.files?.[0];
                                                                    if (!file) return;
                                                                    try {
                                                                        const url = await SupabaseService.uploadFile(file, 'sounds');
                                                                        setBgmTrack(url);
                                                                        alert("上传成功！已自动选中。");
                                                                    } catch (err: any) {
                                                                        alert("Upload failed: " + (err.message || JSON.stringify(err)));
                                                                    }
                                                                }}
                                                            />
                                                            <div className="p-2 text-center text-xs text-neutral-500 group-hover:text-yellow-500 whitespace-nowrap overflow-hidden text-ellipsis">
                                                                {bgmTrack.startsWith('http') ? '更换文件' : '+ 上传MP3/WAV'}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="space-y-2">
                                                    <label className="text-sm font-bold uppercase tracking-wider text-neutral-400">封面图片</label>
                                                    <div className="flex flex-col gap-2">
                                                        <select
                                                            value={coverImage.startsWith('http') ? 'custom' : coverImage}
                                                            onChange={(e) => {
                                                                const val = e.target.value;
                                                                if (val !== 'custom') setCoverImage(val);
                                                            }}
                                                            className="w-full bg-neutral-900 border-2 border-neutral-700 rounded p-2 text-sm text-white focus:border-yellow-500 outline-none"
                                                        >
                                                            <option value="default">默认</option>
                                                            <option value="map_ruins">废墟</option>
                                                            <option value="map_forest">森林</option>
                                                            <option value="custom" disabled={!coverImage.startsWith('http')}>自定义上传</option>
                                                        </select>
                                                        <div className="relative border-2 border-dashed border-neutral-700 rounded hover:border-yellow-500 transition-colors group">
                                                            <input
                                                                type="file"
                                                                accept="image/*"
                                                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                                                onChange={async (e) => {
                                                                    const file = e.target.files?.[0];
                                                                    if (!file) return;
                                                                    try {
                                                                        const url = await SupabaseService.uploadFile(file, 'image');
                                                                        setCoverImage(url);
                                                                        alert("上传成功！已自动选中。");
                                                                    } catch (err: any) {
                                                                        alert("Upload failed: " + (err.message || JSON.stringify(err)));
                                                                    }
                                                                }}
                                                            />
                                                            <div className="p-2 text-center text-xs text-neutral-500 group-hover:text-yellow-500 whitespace-nowrap overflow-hidden text-ellipsis">
                                                                {coverImage.startsWith('http') ? '更换图片' : '+ 上传图片'}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
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
                                </div>

                                <div className="mt-4">
                                    <PixelButton
                                        className="w-full"
                                        onClick={handleCreate}
                                        isLoading={isCreating}
                                        disabled={!roomName || isCreating}
                                    >
                                        确认创建
                                    </PixelButton>
                                </div>
                            </div>
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
                        {rooms.map(room => {
                            // Image Handling
                            const hasCustomImage = room.cover_image && room.cover_image !== 'default';
                            // Deterministic random gradient based on room ID
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
                                        {user.role === 'admin' && (
                                            <button
                                                onClick={async (e) => {
                                                    e.stopPropagation();
                                                    if (!confirm(`确定要删除房间 "${room.name}" 吗？此操作不可撤销。`)) return;
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
                                暂无活跃房间，请创建...
                            </div>
                        )}
                    </div>
                </div>

                {/* Guestbook Section */}
                <div className="w-full max-w-6xl mx-auto mt-12 mb-8">
                    <Guestbook type="global" />
                </div>
            </div>
        </main>
    );
}

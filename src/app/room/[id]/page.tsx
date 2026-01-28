"use client";

import { PixelButton } from "@/components/pixel/pixel-button";
import { PixelCard } from "@/components/pixel/pixel-card";
import { useBroadcastEngine } from "@/hooks/use-broadcast-engine";
import { SupabaseService } from "@/services/supabase-service";
import { supabase } from "@/lib/supabase";
import { RoomData } from "@/types/app"; // Assuming RoomData is exported
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useRef } from "react";
import { cn } from "@/lib/utils";
import { Settings, X, VolumeX, Play, Square } from "lucide-react";

export default function RoomPage() {
    const params = useParams();
    const roomId = params.id as string;
    const router = useRouter();

    const [userId, setUserId] = useState<string | null>(null);
    const [data, setData] = useState<RoomData | null>(null);
    const [showSettings, setShowSettings] = useState(false);
    const [lastPoll, setLastPoll] = useState(Date.now());
    const [hotkey, setHotkey] = useState("Control");
    const [isRebinding, setIsRebinding] = useState(false);
    const [audioBlocked, setAudioBlocked] = useState(false);
    const [previewAudio, setPreviewAudio] = useState<HTMLAudioElement | null>(null);

    // Load Hotkey
    useEffect(() => {
        const saved = localStorage.getItem("baiye_hotkey");
        if (saved) setHotkey(saved);
    }, []);

    // Restore User
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

    // Polling Logic
    const fetchData = useCallback(async () => {
        if (!roomId) return;
        try {
            const result = await SupabaseService.getRoomState(roomId);
            if (result) setData(result);
        } catch (e) {
            console.error(e);
        }
    }, [roomId]);

    useEffect(() => {
        fetchData(); // Initial load

        // Realtime Subscription
        if (!roomId) return;

        const channel = supabase
            .channel('room-updates')
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'baiyezhan_room_state',
                    filter: `room_id=eq.${roomId}`,
                },
                (payload) => {
                    // console.log('Realtime Update:', payload);
                    fetchData();
                }
            )
            .subscribe();

        // Backup polling (slower)
        const interval = setInterval(fetchData, 5000);

        // Heartbeat Loop (5s)
        const heartbeatInterval = setInterval(() => {
            if (userId) {
                SupabaseService.sendHeartbeat(roomId, userId).catch(console.error);
            }
        }, 5000);

        // Owner Cleanup Loop (10s)
        const cleanupInterval = setInterval(() => {
            if (data?.room.owner_id === userId) {
                SupabaseService.cleanupInactiveMembers(roomId).then(() => {
                    // refetch to see updated list
                    fetchData();
                }).catch(console.error);
            }
        }, 10000);

        return () => {
            clearInterval(interval);
            clearInterval(heartbeatInterval);
            clearInterval(cleanupInterval);
            supabase.removeChannel(channel);
        };
    }, [roomId, userId, fetchData, data?.room.owner_id]);

    // Derived State
    const myMember = data?.members.find((m) => m.user_id === userId);
    const amIOwner = data?.room.owner_id === userId;

    // Broadcast Engine
    const isManualMode = data?.room.room_type === 'healer'; // Linlin King is Manual
    console.log("RoomPage Debug:", { isManualMode, state: data?.state, round_start_time: data?.state?.round_start_time });
    const engine = useBroadcastEngine(
        data?.state?.round_start_time ?? null,
        {
            roundDuration: data?.room.round_duration ?? 80,
            broadcastInterval: data?.room.broadcast_interval ?? 10,
            memberCount: data?.members.length ?? 0,
        },
        myMember?.order_index,
        isManualMode ? 'manual' : 'auto'
    );

    // Audio Logic
    const audioInstanceRef = useRef<HTMLAudioElement | null>(null);
    const wasMyTurnRef = useRef(false);
    const DEFAULT_AUDIO_SRC = '/sounds/default-alert.mp3';

    // Initialize Audio Object with default source
    useEffect(() => {
        // Create detached audio element
        const audio = new Audio();
        audio.preload = 'auto';
        // Set default source immediately to ensure audio is always ready
        audio.src = DEFAULT_AUDIO_SRC;
        audioInstanceRef.current = audio;

        return () => {
            if (audioInstanceRef.current) {
                audioInstanceRef.current.pause();
                audioInstanceRef.current = null;
            }
        };
    }, []);

    // Helper for safe playback with retry mechanism
    const playAudioSafe = async (audio: HTMLAudioElement, retries = 3) => {
        for (let attempt = 0; attempt < retries; attempt++) {
            try {
                // Ensure audio source is set
                if (!audio.src || audio.src === window.location.href) {
                    console.warn("Audio source not set, using default");
                    audio.src = DEFAULT_AUDIO_SRC;
                    audio.load();
                }

                await audio.play();
                setAudioBlocked(false);
                console.log("Audio playing successfully");
                return true;
            } catch (e: any) {
                if (e.name === 'AbortError') {
                    // Expected interruption, ignore
                    console.log("Audio play aborted (harmless)");
                    return false;
                } else if (e.name === 'NotAllowedError') {
                    console.error("Audio blocked by browser policy");
                    setAudioBlocked(true);
                    return false;
                } else {
                    console.error(`Audio playback error (attempt ${attempt + 1}/${retries}):`, e);
                    // Wait a bit before retry
                    if (attempt < retries - 1) {
                        await new Promise(r => setTimeout(r, 100));
                    }
                }
            }
        }
        console.error("Audio playback failed after all retries");
        return false;
    };

    // Handle Playback
    useEffect(() => {
        const audio = audioInstanceRef.current;
        if (!audio) return;

        // Detect rising edge of isMyTurn
        if (engine.isMyTurn && !wasMyTurnRef.current) {
            console.log("Turn started! Playing audio...");
            audio.currentTime = 0;
            audio.loop = isManualMode;
            playAudioSafe(audio);
        }

        // Detect falling edge (turn ended)
        if (!engine.isMyTurn && wasMyTurnRef.current) {
            // We only pause if we are NOT in the middle of a play promise (hard to track exact promise state reliably)
            // But usually just calling pause() is what causes AbortError if pending.
            // Since we catch AbortError in playAudioSafe, it's safe to call pause() here.
            audio.pause();
            audio.currentTime = 0;
        }

        wasMyTurnRef.current = engine.isMyTurn;
    }, [engine.isMyTurn, isManualMode]);

    // Update Audio Source when config changes (with fallback to default)
    useEffect(() => {
        const audio = audioInstanceRef.current;
        if (!audio) return;

        // Determine the source to use
        const newSrc = (data?.room.bgm_track && data.room.bgm_track !== 'default')
            ? data.room.bgm_track
            : DEFAULT_AUDIO_SRC;

        // Only update if actually changed
        if (audio.src !== newSrc) {
            console.log("Updating audio source to:", newSrc);
            audio.src = newSrc;
            audio.load();
        }
    }, [data?.room.bgm_track]);

    // Handlers
    const handleStart = async () => {
        try {
            if (isManualMode) {
                // For manual mode, 'Start' just means setting tick to 0
                await SupabaseService.nextTurn(roomId, 0);
            } else {
                // For auto mode, 'Start' sets the timestamp
                await SupabaseService.startRound(roomId);
            }
            fetchData();
        } catch (e: any) {
            alert("Start failed: " + (e.message || JSON.stringify(e)));
            console.error(e);
        }
    };

    const handleReset = async () => {
        await SupabaseService.resetRound(roomId);
        fetchData();
    };

    const handleCopyCode = () => {
        if (data?.room.room_code) {
            navigator.clipboard.writeText(data.room.room_code);
            alert("房间码已复制！");
        }
    };

    const handleExit = async () => {
        if (!userId) return;
        if (confirm("确定要退出房间吗？")) {
            await SupabaseService.leaveRoom(roomId, userId);
            router.push("/hall");
        }
    };

    const enableAudio = () => {
        if (audioInstanceRef.current) {
            // Play and immediately pause to unlock AudioContext
            audioInstanceRef.current.play().then(() => {
                audioInstanceRef.current?.pause();
                if (audioInstanceRef.current) audioInstanceRef.current.currentTime = 0;
                setAudioBlocked(false);
            }).catch(console.error);
        }
    };



    const handlePassTurn = useCallback(async () => {
        if (!roomId || !data) return;
        // Optimization: Optimistically update local state? 
        // For now just call API. The engine will update on next poll.
        // Actually for better UX we might want immediate feedback, but let's stick to MVVM.
        // In Manual mode, round_start_time IS the tick count.
        const currentTick = data.state?.round_start_time ?? 0;
        const nextTick = currentTick + 1;

        // Stop audio immediately for better feel
        if (audioInstanceRef.current) {
            audioInstanceRef.current.pause();
        }

        await SupabaseService.nextTurn(roomId, nextTick);
        // fetchData(); // START_REMOVED: Realtime will trigger update
    }, [roomId, data]); // REMOVED fetchData from dependency too if not needed, but keep it for safety

    // Global Hotkey Listener
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (isRebinding) return;
            if (isManualMode && engine.isMyTurn && e.key.toLowerCase() === hotkey.toLowerCase()) {
                e.preventDefault();
                handlePassTurn();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isManualMode, engine.isMyTurn, hotkey, handlePassTurn, isRebinding]);

    // Background Control (Media Session API)
    useEffect(() => {
        if ('mediaSession' in navigator && isManualMode && engine.isMyTurn) {
            const handleMediaKey = () => {
                console.log("Media Key Pressed");
                handlePassTurn();
            };

            navigator.mediaSession.setActionHandler('nexttrack', handleMediaKey);
            navigator.mediaSession.setActionHandler('previoustrack', handleMediaKey);
            // We also need play/pause handlers to keep the session active?
            navigator.mediaSession.setActionHandler('play', () => { });
            navigator.mediaSession.setActionHandler('pause', () => { });

            return () => {
                navigator.mediaSession.setActionHandler('nexttrack', null);
                navigator.mediaSession.setActionHandler('previoustrack', null);
            };
        }
    }, [isManualMode, engine.isMyTurn, handlePassTurn]);

    // Preview Logic
    const togglePreview = async (url: string) => {
        if (previewAudio) {
            previewAudio.pause();
            setPreviewAudio(null);
            return;
        }

        if (url === 'default') return;

        const audio = new Audio(url);
        audio.onended = () => setPreviewAudio(null);
        setPreviewAudio(audio); // Update UI immediately

        try {
            await audio.play();
        } catch (e: any) {
            if (e.name === 'AbortError') {
                // User likely clicked stop immediately
                return;
            }
            if (e.name === 'NotAllowedError') {
                alert("无法自动播放，请检查浏览器权限");
            }
            console.error("Preview failed:", e);
            setPreviewAudio(null); // Revert UI on error
        }
    };

    // Stop preview on unmount or modal close
    useEffect(() => {
        return () => {
            // Cleanup function
            if (previewAudio) {
                previewAudio.pause();
            }
        };
    }, [previewAudio]);



    if (!data || !userId) return <div className="p-10 text-center text-white font-pixel">正在获取信号频率...</div>;

    // Current Assignee
    const currentAssignee =
        engine.currentAssigneeIndex !== null
            ? data.members.find(m => m.order_index === engine.currentTick)
            : null;




    return (
        <main className="flex min-h-screen flex-col bg-neutral-900 text-white pb-20">
            {/* Header */}
            <header className="border-b-4 border-black bg-neutral-800 p-4 shadow-lg sticky top-0 z-10 flex justify-between items-center">
                <div>
                    <div className="flex items-center gap-2">
                        <h1 className="text-xl font-bold text-yellow-500 uppercase">房间 {data.room.room_code}</h1>
                        <div className="bg-black/80 px-2 py-0.5 text-[10px] text-yellow-500 font-bold border border-yellow-500/50 backdrop-blur-sm">
                            {data.room.room_type === 'healer' ? '霖霖大王' : '无名小弟'} (Beta)
                        </div>
                    </div>
                    {!isManualMode && (
                        <div className="text-xs text-neutral-500">
                            一轮时长: {data.room.round_duration}秒 | 播报间隔: {data.room.broadcast_interval}秒
                        </div>
                    )}
                </div>
                <div className="flex gap-2 min-w-40 justify-end">
                    {data.room.bgm_track && data.room.bgm_track !== 'default' && (
                        <PixelButton
                            variant="primary"
                            className={cn("px-3 py-1 text-xs flex items-center gap-2", previewAudio ? "animate-pulse border-green-500 text-green-400" : "")}
                            onClick={() => togglePreview(data.room.bgm_track!)}
                        >
                            {previewAudio ? <Square className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                            {previewAudio ? "停止试听" : "试听声音"}
                        </PixelButton>
                    )}
                    <PixelButton variant="secondary" className="px-3 py-1 text-xs" onClick={handleCopyCode}>
                        复制房间码
                    </PixelButton>
                    {amIOwner && (
                        <button
                            onClick={() => setShowSettings(true)}
                            className="bg-neutral-700 hover:bg-neutral-600 border-2 border-black p-1 active:translate-y-[2px]"
                        >
                            <Settings className="w-4 h-4 text-white" />
                        </button>
                    )}
                    <PixelButton variant="danger" className="px-3 py-1 text-xs bg-red-600 hover:bg-red-700 text-white" onClick={handleExit}>
                        退出房间
                    </PixelButton>
                </div>
            </header>

            {/* Audio Blocked Warning */}
            {audioBlocked && (
                <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 animate-bounce">
                    <PixelButton
                        variant="danger"
                        onClick={enableAudio}
                        className="flex items-center gap-2 bg-red-500 text-white shadow-[4px_4px_0_0_#000]"
                    >
                        <VolumeX className="w-4 h-4" />
                        <span>点击开启声音 (AUTOPLAY BLOCKED)</span>
                    </PixelButton>
                </div>
            )}

            {/* Settings Modal */}
            {showSettings && data && (
                <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
                    <PixelCard className="w-full max-w-md bg-neutral-900 border-yellow-500 relative">
                        <button
                            onClick={() => setShowSettings(false)}
                            className="absolute top-2 right-2 text-neutral-500 hover:text-white"
                        >
                            <X className="w-5 h-5" />
                        </button>

                        <h2 className="text-xl font-bold text-yellow-500 mb-6 uppercase border-b border-neutral-700 pb-2">
                            终端配置
                        </h2>

                        <div className="space-y-6">
                            {/* Sliders */}
                            <div className="space-y-4">
                                {/* Removed Hotkey Config from here, moved to Header */}

                                <div className="space-y-2">
                                    <label className="text-sm flex justify-between text-neutral-400 font-bold uppercase tracking-wider">
                                        <span>一轮时长</span>
                                        <span className="text-yellow-500">{data.room.round_duration}s</span>
                                    </label>
                                    <input
                                        type="range"
                                        min="50" max="90" step="1"
                                        defaultValue={data.room.round_duration}
                                        onChange={(e) => SupabaseService.updateRoomConfig(roomId, { roundDuration: Number(e.target.value) })}
                                        className="w-full h-2 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-yellow-500"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-sm flex justify-between text-neutral-400 font-bold uppercase tracking-wider">
                                        <span>播报间隔</span>
                                        <span className="text-yellow-500">{data.room.broadcast_interval}s</span>
                                    </label>
                                    <input
                                        type="range"
                                        min="6" max="14" step="0.5"
                                        defaultValue={data.room.broadcast_interval}
                                        onChange={(e) => SupabaseService.updateRoomConfig(roomId, { broadcastInterval: Number(e.target.value) })}
                                        className="w-full h-2 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-yellow-500"
                                    />
                                </div>
                            </div>

                            {/* Files */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-bold uppercase tracking-wider text-neutral-400">播报音乐</label>
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
                                                    SupabaseService.updateRoomConfig(roomId, { bgmTrack: url });
                                                    alert("音乐已更新");
                                                } catch (err: any) {
                                                    alert("上传失败: " + (err.message || JSON.stringify(err)));
                                                }
                                            }}
                                        />
                                        <div className="p-3 text-center text-xs text-neutral-500 group-hover:text-yellow-500">
                                            点击上传
                                        </div>
                                    </div>
                                    <div className="text-[10px] text-neutral-600 truncate px-1 flex items-center justify-between">
                                        <span>当前: {data.room.bgm_track === 'default' ? '默认' : '自定义'}</span>
                                        {data.room.bgm_track && data.room.bgm_track !== 'default' && (
                                            <button
                                                onClick={() => togglePreview(data.room.bgm_track!)}
                                                className="text-yellow-500 hover:text-white"
                                                title="试听"
                                            >
                                                {previewAudio ? <Square className="w-3 h-3 fill-current" /> : <Play className="w-3 h-3 fill-current" />}
                                            </button>
                                        )}
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-sm font-bold uppercase tracking-wider text-neutral-400">封面图片</label>
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
                                                    SupabaseService.updateRoomConfig(roomId, { coverImage: url });
                                                    alert("封面已更新");
                                                } catch (err: any) {
                                                    alert("上传失败: " + (err.message || JSON.stringify(err)));
                                                }
                                            }}
                                        />
                                        <div className="p-3 text-center text-xs text-neutral-500 group-hover:text-yellow-500">
                                            点击上传
                                        </div>
                                    </div>
                                    <div className="text-[10px] text-neutral-600 truncate px-1">
                                        当前: {data.room.cover_image === 'default' ? '默认' : '自定义'}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </PixelCard>
                </div>
            )}

            <div className="flex-1 p-4 flex flex-col gap-6 max-w-2xl mx-auto w-full">

                {/* Main Status Card */}
                <PixelCard className={cn(
                    "flex flex-col items-center justify-center py-10 transition-colors duration-500",
                    engine.isMyTurn ? "bg-green-500 border-green-900" : "bg-neutral-800"
                )}>
                    {engine.roundStatus === 'WAITING' && (
                        <div className="text-center">
                            <div className="text-2xl text-neutral-400 mb-4">
                                {isManualMode ? "准备就绪" : "等待信号"}
                            </div>
                            {amIOwner && (
                                <PixelButton onClick={handleStart} className="animate-pulse">
                                    {isManualMode ? "开始传递 (START)" : "开始播报"}
                                </PixelButton>
                            )}
                            {!amIOwner && <div className="text-sm animate-pulse">等待指挥官...</div>}
                        </div>
                    )}

                    {engine.roundStatus === 'ACTIVE' && (
                        <div className="text-center w-full">
                            <div className="text-sm uppercase tracking-widest mb-2 text-neutral-400">当前顺位</div>

                            {/* Big Text Display */}
                            {currentAssignee ? (
                                <>
                                    <div className={cn(
                                        "text-4xl md:text-5xl font-bold mb-2 break-all px-4",
                                        engine.isMyTurn ? "text-white drop-shadow-md" : "text-yellow-400"
                                    )}>
                                        {engine.isMyTurn ? "轮到你了！" : currentAssignee.user?.character_name || "未知"}
                                    </div>
                                    <div className="text-sm font-mono text-neutral-500 mb-4">
                                        [ 第 {engine.currentTick + 1} 位 ]
                                    </div>
                                </>
                            ) : (
                                <div className="text-3xl text-neutral-500 mb-4">冷却中</div>
                            )}

                            {/* Manual Mode Pass Button */}
                            {isManualMode && engine.isMyTurn && (
                                <div className="mb-4 animate-bounce">
                                    <PixelButton
                                        onClick={handlePassTurn}
                                        className="h-16 text-xl bg-yellow-500 text-black border-4 border-white hover:scale-105 active:scale-95 transition-transform"
                                    >
                                        {'>>>'} 传递信号 ({hotkey.toUpperCase()}) {'>>>'}
                                    </PixelButton>
                                </div>
                            )}

                            {/* Timer / Progress */}
                            <div className="w-full bg-black h-4 border-2 border-white relative mt-4 max-w-xs mx-auto">
                                <div
                                    className="h-full bg-white transition-all duration-100 ease-linear"
                                    style={{ width: `${engine.progress}%` }}
                                />
                            </div>
                            <div className="mt-2 font-mono text-xl">
                                下个指令: {engine.nextTickIn.toFixed(1)}秒
                            </div>
                        </div>
                    )}

                    {/* Hotkey Config Display (Bottom of Card) */}
                    {isManualMode && (
                        <div className="mt-8 pt-4 border-t-2 border-neutral-700 w-full flex flex-col items-center">
                            <div className="text-xs text-neutral-500 mb-2 uppercase tracking-widest">操作设置</div>
                            <button
                                onClick={() => setIsRebinding(true)}
                                className={cn(
                                    "px-6 py-2 font-mono text-lg font-bold border-2 rounded transition-all flex items-center gap-2",
                                    isRebinding
                                        ? "bg-yellow-500 text-black border-white animate-pulse scale-110"
                                        : "bg-neutral-800 text-yellow-500 border-neutral-600 hover:border-yellow-500 hover:scale-105"
                                )}
                                onKeyDown={(e) => {
                                    if (isRebinding) {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        const key = e.key === ' ' ? 'Space' : e.key;
                                        setHotkey(key);
                                        localStorage.setItem("baiye_hotkey", key);
                                        setIsRebinding(false);
                                    }
                                }}
                            >
                                <span>🚀 快捷键:</span>
                                <span className="bg-black/30 px-2 rounded">
                                    {isRebinding ? "请按键..." : hotkey.toUpperCase()}
                                </span>
                            </button>
                            <div className="text-[10px] text-neutral-600 mt-2">点击按钮修改按键</div>
                            <div className="text-[10px] text-neutral-500 mt-4 max-w-xs text-left border-t border-neutral-800 pt-2 space-y-1">
                                <div><span className="text-yellow-600 font-bold">⚠️ 后台控制说明:</span></div>
                                <div>由于浏览器安全限制，<span className="text-white">普通按键</span> (如 {hotkey.toUpperCase()}) 在网页最小化/后台时会<span className="text-red-500">自动失效</span>。</div>
                                <div><span className="text-green-500">✅ 唯一方案</span>: 请使用 <span className="text-white border px-1 rounded">Next (下一首)</span> 多媒体键，它拥有后台穿透权限。</div>
                            </div>
                        </div>
                    )}
                </PixelCard>

                {/* Member List */}
                <div className="space-y-2">
                    <h3 className="uppercase text-neutral-500 text-sm font-bold">小队列表</h3>
                    {data.members.sort((a, b) => a.order_index - b.order_index).map((m) => {
                        const isActive = engine.roundStatus === 'ACTIVE' && m.order_index === engine.currentTick;
                        const isMe = m.user_id === userId;

                        return (
                            <div
                                key={m.user_id}
                                className={cn(
                                    "flex items-center justify-between p-3 border-2 border-transparent transition-all",
                                    isActive ? "bg-yellow-500/20 border-yellow-500 text-yellow-400" : "bg-neutral-800 border-black",
                                    isMe && !isActive && "border-neutral-600 bg-neutral-800/50"
                                )}
                            >
                                <div className="flex items-center gap-3">
                                    <span className={cn(
                                        "w-6 h-6 flex items-center justify-center font-bold text-xs border-2",
                                        isActive ? "bg-yellow-500 text-black border-black" : "bg-neutral-700 border-neutral-600"
                                    )}>
                                        {m.order_index + 1}
                                    </span>
                                    <span className={cn("font-bold", isMe && "text-blue-400")}>
                                        {m.user?.character_name} {isMe && "(你)"}
                                    </span>
                                </div>
                                {isActive && <span className="animate-blink text-xs text-yellow-500">行动中</span>}
                            </div>
                        );
                    })}
                </div>

                {/* Owner Controls */}
                {
                    amIOwner && engine.roundStatus !== 'WAITING' && (
                        <div className="mt-8 border-t-2 border-neutral-800 pt-8">
                            <div className="text-xs text-neutral-500 mb-2 uppercase text-center">管理员控制</div>
                            <div className="flex gap-4 justify-center">
                                <PixelButton variant="danger" onClick={handleReset} className="bg-red-500 hover:bg-red-600 text-white">
                                    重置轮次
                                </PixelButton>
                            </div>
                        </div>
                    )
                }





            </div >
        </main >
    );
}

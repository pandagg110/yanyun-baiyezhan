"use client";

import { PixelButton } from "@/components/pixel/pixel-button";
import { PixelCard } from "@/components/pixel/pixel-card";
import { useBroadcastEngine } from "@/hooks/use-broadcast-engine";
import { SupabaseService } from "@/services/supabase-service";
import { RoomData } from "@/types/app"; // Assuming RoomData is exported
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export default function RoomPage() {
    const params = useParams();
    const roomId = params.id as string;
    const router = useRouter();

    const [userId, setUserId] = useState<string | null>(null);
    const [data, setData] = useState<RoomData | null>(null);
    const [lastPoll, setLastPoll] = useState(Date.now());

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
        const interval = setInterval(fetchData, 2000); // Poll every 2s
        return () => clearInterval(interval);
    }, [fetchData]);

    // Derived State
    const myMember = data?.members.find((m) => m.user_id === userId);
    const amIOwner = data?.room.owner_id === userId;

    // Broadcast Engine
    const engine = useBroadcastEngine(
        data?.state.round_start_time ?? null,
        {
            roundDuration: data?.room.round_duration ?? 80,
            broadcastInterval: data?.room.broadcast_interval ?? 10,
            memberCount: data?.members.length ?? 0,
        },
        myMember?.order_index
    );

    // Handlers
    const handleStart = async () => {
        await SupabaseService.startRound(roomId);
        fetchData();
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
                    <h1 className="text-xl font-bold text-yellow-500 uppercase">房间 {data.room.room_code}</h1>
                    <div className="text-xs text-neutral-500">一轮时长: {data.room.round_duration}秒 | 播报间隔: {data.room.broadcast_interval}秒</div>
                </div>
                <PixelButton variant="secondary" className="px-3 py-1 text-xs" onClick={handleCopyCode}>
                    复制房间码
                </PixelButton>
            </header>

            <div className="flex-1 p-4 flex flex-col gap-6 max-w-2xl mx-auto w-full">

                {/* Main Status Card */}
                <PixelCard className={cn(
                    "flex flex-col items-center justify-center py-10 transition-colors duration-500",
                    engine.isMyTurn ? "bg-green-500 border-green-900" : "bg-neutral-800"
                )}>
                    {engine.roundStatus === 'WAITING' && (
                        <div className="text-center">
                            <div className="text-2xl text-neutral-400 mb-4">等待信号</div>
                            {amIOwner && (
                                <PixelButton onClick={handleStart} className="animate-pulse">
                                    开始播报
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
                                <div className={cn(
                                    "text-4xl md:text-5xl font-bold mb-4 break-all px-4",
                                    engine.isMyTurn ? "text-white drop-shadow-md" : "text-yellow-400"
                                )}>
                                    {engine.isMyTurn ? "轮到你了！" : currentAssignee.user?.character_name || "未知"}
                                </div>
                            ) : (
                                <div className="text-3xl text-neutral-500 mb-4">冷却中</div>
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
                {amIOwner && engine.roundStatus !== 'WAITING' && (
                    <div className="mt-8 border-t-2 border-neutral-800 pt-8">
                        <div className="text-xs text-neutral-500 mb-2 uppercase text-center">管理员控制</div>
                        <div className="flex gap-4 justify-center">
                            <PixelButton variant="danger" onClick={handleReset} className="bg-red-500 hover:bg-red-600 text-white">
                                重置轮次
                            </PixelButton>
                        </div>
                    </div>
                )}

            </div>
        </main>
    );
}

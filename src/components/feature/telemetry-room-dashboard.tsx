"use client";

import { PixelButton } from "@/components/pixel/pixel-button";
import { PixelCard } from "@/components/pixel/pixel-card";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { SupabaseService } from "@/services/supabase-service";
import { SkillCooldownTelemetry } from "@/types/app";
import { Activity, CheckCircle2, Clock3, RefreshCw, TimerReset, UserRound, Wifi, WifiOff } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

const ONLINE_MS = 15_000;
const IDLE_MS = 45_000;

interface TelemetryRoomDashboardProps {
    roomCode: string;
}

interface SkillView extends SkillCooldownTelemetry {
    isReady: boolean;
    remainingMs: number;
}

interface PlayerView {
    username: string;
    profession: string;
    heartbeatAt: number;
    skills: SkillView[];
}

function parseTime(value?: string | null) {
    if (!value) return 0;
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
}

function formatRelative(ms: number) {
    if (ms <= 0) return "刚刚";
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}秒前`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}分钟前`;
    return `${Math.floor(minutes / 60)}小时前`;
}

function formatRemaining(ms: number) {
    const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (minutes <= 0) return `${seconds}s`;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function getHeartbeatState(ageMs: number) {
    if (ageMs <= ONLINE_MS) return "online";
    if (ageMs <= IDLE_MS) return "idle";
    return "offline";
}

export function TelemetryRoomDashboard({ roomCode }: TelemetryRoomDashboardProps) {
    const [records, setRecords] = useState<SkillCooldownTelemetry[]>([]);
    const [now, setNow] = useState(Date.now());
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchRecords = useCallback(async () => {
        try {
            const data = await SupabaseService.getSkillCooldowns(roomCode);
            setRecords(data);
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : "读取技能数据失败");
        } finally {
            setIsLoading(false);
        }
    }, [roomCode]);

    useEffect(() => {
        void fetchRecords();

        const channel = supabase
            .channel(`skill-cooldowns-${roomCode}`)
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "baiyezhan_skill_cooldowns",
                    filter: `room_code=eq.${roomCode}`,
                },
                () => {
                    void fetchRecords();
                },
            )
            .subscribe();

        const pollTimer = window.setInterval(fetchRecords, 5000);

        return () => {
            window.clearInterval(pollTimer);
            supabase.removeChannel(channel);
        };
    }, [fetchRecords, roomCode]);

    useEffect(() => {
        const timer = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(timer);
    }, []);

    const players = useMemo<PlayerView[]>(() => {
        const grouped = new Map<string, PlayerView>();

        for (const record of records) {
            const username = record.username || "未知玩家";
            const heartbeatAt = parseTime(record.heartbeat_at);
            const cooldownAt = parseTime(record.cooldown_until);
            const skill: SkillView = {
                ...record,
                isReady: !cooldownAt || cooldownAt <= now,
                remainingMs: cooldownAt ? Math.max(0, cooldownAt - now) : 0,
            };

            const existing = grouped.get(username);
            if (!existing) {
                grouped.set(username, {
                    username,
                    profession: record.profession || "未识别",
                    heartbeatAt,
                    skills: [skill],
                });
                continue;
            }

            if (heartbeatAt > existing.heartbeatAt) {
                existing.heartbeatAt = heartbeatAt;
                existing.profession = record.profession || existing.profession;
            }
            existing.skills.push(skill);
        }

        return [...grouped.values()]
            .map(player => ({
                ...player,
                skills: player.skills.sort((a, b) => {
                    if (a.isReady !== b.isReady) return a.isReady ? 1 : -1;
                    return a.skill_name.localeCompare(b.skill_name, "zh-Hans-CN");
                }),
            }))
            .sort((a, b) => b.heartbeatAt - a.heartbeatAt || a.username.localeCompare(b.username, "zh-Hans-CN"));
    }, [records, now]);

    const onlineCount = players.filter(player => getHeartbeatState(now - player.heartbeatAt) === "online").length;
    const readyCount = records.filter(record => {
        const cooldownAt = parseTime(record.cooldown_until);
        return !cooldownAt || cooldownAt <= now;
    }).length;
    const cooldownCount = records.length - readyCount;

    return (
        <div className="flex-1 p-4 w-full max-w-6xl mx-auto space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <PixelCard className="bg-neutral-800 p-3">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <div className="text-xs font-bold uppercase tracking-wider text-neutral-500">在线玩家</div>
                            <div className="font-mono text-2xl font-bold text-green-400">{onlineCount}/{players.length}</div>
                        </div>
                        <Activity className="h-6 w-6 text-green-400" />
                    </div>
                </PixelCard>
                <PixelCard className="bg-neutral-800 p-3">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <div className="text-xs font-bold uppercase tracking-wider text-neutral-500">技能就绪</div>
                            <div className="font-mono text-2xl font-bold text-yellow-400">{readyCount}/{records.length}</div>
                        </div>
                        <CheckCircle2 className="h-6 w-6 text-yellow-400" />
                    </div>
                </PixelCard>
                <PixelCard className="bg-neutral-800 p-3">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <div className="text-xs font-bold uppercase tracking-wider text-neutral-500">冷却中</div>
                            <div className="font-mono text-2xl font-bold text-cyan-400">{cooldownCount}</div>
                        </div>
                        <TimerReset className="h-6 w-6 text-cyan-400" />
                    </div>
                </PixelCard>
            </div>

            <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-bold uppercase text-white">玩家技能状态</h2>
                <PixelButton
                    size="sm"
                    variant="secondary"
                    className="gap-2 px-3 py-2 text-xs"
                    onClick={fetchRecords}
                    isLoading={isLoading}
                >
                    <RefreshCw className="h-3.5 w-3.5" />
                    刷新
                </PixelButton>
            </div>

            {error && (
                <div className="border-2 border-red-500 bg-red-950/50 p-3 text-sm text-red-200">
                    {error}
                </div>
            )}

            {!isLoading && players.length === 0 && (
                <div className="border-2 border-dashed border-neutral-700 bg-neutral-900/50 py-16 text-center text-neutral-500">
                    等待客户端上报技能数据
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {players.map(player => {
                    const ageMs = now - player.heartbeatAt;
                    const heartbeatState = getHeartbeatState(ageMs);
                    const isOnline = heartbeatState === "online";
                    const isIdle = heartbeatState === "idle";

                    return (
                        <div
                            key={player.username}
                            className={cn(
                                "border-4 border-black bg-neutral-800 p-4 shadow-[4px_4px_0_0_#000]",
                                isOnline && "shadow-[4px_4px_0_0_#22c55e]",
                                isIdle && "shadow-[4px_4px_0_0_#eab308]",
                                heartbeatState === "offline" && "opacity-70",
                            )}
                        >
                            <div className="mb-4 flex items-start justify-between gap-3">
                                <div className="flex min-w-0 items-center gap-3">
                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center border-2 border-black bg-neutral-900">
                                        <UserRound className="h-5 w-5 text-yellow-400" />
                                    </div>
                                    <div className="min-w-0">
                                        <div className="truncate text-lg font-bold text-white">{player.username}</div>
                                        <div className="text-xs font-bold uppercase tracking-wider text-neutral-500">{player.profession}</div>
                                    </div>
                                </div>
                                <div
                                    className={cn(
                                        "flex shrink-0 items-center gap-1 border-2 border-black px-2 py-1 text-[11px] font-bold",
                                        isOnline && "bg-green-500 text-black",
                                        isIdle && "bg-yellow-500 text-black",
                                        heartbeatState === "offline" && "bg-neutral-700 text-neutral-300",
                                    )}
                                >
                                    {heartbeatState === "offline" ? <WifiOff className="h-3 w-3" /> : <Wifi className="h-3 w-3" />}
                                    {formatRelative(ageMs)}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {player.skills.map(skill => (
                                    <div
                                        key={`${skill.username}-${skill.skill_name}`}
                                        className={cn(
                                            "flex min-h-14 items-center justify-between gap-3 border-2 border-black px-3 py-2",
                                            skill.isReady ? "bg-green-500/15 text-green-200" : "bg-cyan-500/15 text-cyan-100",
                                        )}
                                    >
                                        <div className="min-w-0">
                                            <div className="truncate text-sm font-bold">{skill.skill_name}</div>
                                            <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                                                {skill.isReady ? "READY" : "COOLDOWN"}
                                            </div>
                                        </div>
                                        <div
                                            className={cn(
                                                "flex shrink-0 items-center gap-1 font-mono text-sm font-bold",
                                                skill.isReady ? "text-green-400" : "text-cyan-300",
                                            )}
                                        >
                                            {skill.isReady ? <CheckCircle2 className="h-4 w-4" /> : <Clock3 className="h-4 w-4" />}
                                            {skill.isReady ? "就绪" : formatRemaining(skill.remainingMs)}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

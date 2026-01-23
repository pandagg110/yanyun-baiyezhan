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
    const [roomCode, setRoomCode] = useState("");
    const [isJoining, setIsJoining] = useState(false);
    const [isCreating, setIsCreating] = useState(false);

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

    const handleCreate = async () => {
        if (!userId) return;
        setIsCreating(true);
        try {
            // Default room name "My Room" for now as per PRD flow
            const { room } = await SupabaseService.createRoom(userId, "My Room");
            router.push(`/room/${room.id}`);
        } catch (e) {
            console.error(e);
            alert("Failed to create room");
        } finally {
            setIsCreating(false);
        }
    };

    const handleJoin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!userId || !roomCode) return;
        setIsJoining(true);
        try {
            const data = await SupabaseService.joinRoom(userId, roomCode);
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

    if (!userId) return null; // or loading spinner

    return (
        <main className="flex min-h-screen flex-col items-center justify-center bg-neutral-900 p-4">
            <div className="mb-8 text-center">
                <h1 className="text-3xl font-bold text-white uppercase tracking-wider">
                    百业大厅
                </h1>
                <p className="text-neutral-500">选择你的目的地</p>
            </div>

            <div className="flex w-full max-w-4xl flex-col gap-8 md:flex-row">
                {/* Create Room Section */}
                <PixelCard className="flex-1 space-y-4">
                    <div className="text-xl font-bold text-yellow-500 uppercase">
                        指挥官
                    </div>
                    <p className="text-neutral-400">
                        创建一个新的播报房间并带领团队。
                    </p>
                    <div className="pt-4">
                        <PixelButton
                            className="w-full"
                            onClick={handleCreate}
                            isLoading={isCreating}
                        >
                            创建房间
                        </PixelButton>
                    </div>
                </PixelCard>

                {/* Join Room Section */}
                <PixelCard className="flex-1 space-y-4">
                    <div className="text-xl font-bold text-blue-400 uppercase">
                        成员
                    </div>
                    <p className="text-neutral-400">
                        通过房间码加入现有房间。
                    </p>
                    <form onSubmit={handleJoin} className="space-y-4 pt-4">
                        <PixelInput
                            placeholder="房间码 (4位数字)"
                            value={roomCode}
                            onChange={(e) => setRoomCode(e.target.value)}
                            className="text-center text-lg tracking-[0.5em]"
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

            <div className="mt-12 text-neutral-600 text-sm">
                当前登录：{userId ? "已连接" : "..."}
                <button
                    onClick={async () => {
                        await SupabaseService.logout();
                        router.push("/login");
                    }}
                    className="ml-4 text-red-400 hover:underline"
                >
                    退出
                </button>
            </div>
        </main>
    );
}

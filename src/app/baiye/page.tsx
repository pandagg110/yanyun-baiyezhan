"use client";

import { PixelButton } from "@/components/pixel/pixel-button";
import { PixelCard } from "@/components/pixel/pixel-card";
import { PixelInput } from "@/components/pixel/pixel-input";
import { SupabaseService } from "@/services/supabase-service";
import { Baiye, User } from "@/types/app";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function BaiyePage() {
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [baiyeList, setBaiyeList] = useState<Baiye[]>([]);
    const [loading, setLoading] = useState(true);

    // Create form
    const [showCreate, setShowCreate] = useState(false);
    const [newName, setNewName] = useState("");
    const [newDesc, setNewDesc] = useState("");
    const [creating, setCreating] = useState(false);
    const [canCreate, setCanCreate] = useState(false);

    useEffect(() => {
        const init = async () => {
            const u = await SupabaseService.getUser();
            if (!u) {
                router.push("/login");
                return;
            }
            setUser(u);

            // Check create permission
            const can = await SupabaseService.canCreateBaiye(u.role, u.id);
            setCanCreate(can);

            // Fetch baiye list
            await fetchBaiyeList();
            setLoading(false);
        };
        init();
    }, [router]);

    const fetchBaiyeList = async () => {
        try {
            const list = await SupabaseService.getBaiyeList();
            setBaiyeList(list);
        } catch (e) {
            console.error(e);
        }
    };

    const handleCreate = async () => {
        if (!user || !newName.trim()) return;
        setCreating(true);
        try {
            await SupabaseService.createBaiye(user.id, newName.trim(), newDesc.trim() || undefined);
            setNewName("");
            setNewDesc("");
            setShowCreate(false);
            await fetchBaiyeList();
            // Update canCreate status
            const can = await SupabaseService.canCreateBaiye(user.role, user.id);
            setCanCreate(can);
        } catch (e: any) {
            alert("创建失败: " + (e.message || JSON.stringify(e)));
        } finally {
            setCreating(false);
        }
    };

    const handleDelete = async (baiyeId: string, baiyeName: string) => {
        if (!confirm(`确定要删除百业 "${baiyeName}" 吗？\n\n⚠️ 此操作将删除该百业下的所有房间！`)) return;
        try {
            await SupabaseService.deleteBaiye(baiyeId);
            await fetchBaiyeList();
        } catch (e: any) {
            alert("删除失败: " + (e.message || JSON.stringify(e)));
        }
    };

    const handleLogout = async () => {
        await SupabaseService.logout();
        router.push("/login");
    };

    if (loading) {
        return <div className="min-h-screen bg-neutral-900 flex items-center justify-center text-white">正在加载...</div>;
    }

    return (
        <main className="min-h-screen bg-neutral-900 text-white p-4 md:p-8">
            {/* Header */}
            <header className="max-w-6xl mx-auto flex justify-between items-center mb-8 border-b-4 border-black pb-4">
                <div>
                    <h1 className="text-2xl font-bold text-yellow-500 uppercase">百业大厅</h1>
                    <p className="text-xs text-neutral-500">欢迎, {user?.character_name}</p>
                </div>
                <div className="flex items-center gap-3">
                    {user?.role === 'admin' && (
                        <button
                            onClick={() => router.push("/admin")}
                            className="text-xs text-yellow-500 hover:text-yellow-400 underline"
                        >
                            [ 用户管理 ]
                        </button>
                    )}
                    <button
                        onClick={handleLogout}
                        className="text-xs text-red-500 hover:text-red-400"
                    >
                        退出登录
                    </button>
                </div>
            </header>

            <div className="max-w-6xl mx-auto">
                {/* Create Button */}
                {canCreate && !showCreate && (
                    <div className="mb-6">
                        <PixelButton onClick={() => setShowCreate(true)}>
                            + 创建百业
                        </PixelButton>
                    </div>
                )}

                {/* Create Form */}
                {showCreate && (
                    <PixelCard className="mb-6 bg-neutral-800 max-w-md">
                        <h3 className="text-lg font-bold text-yellow-500 mb-4">创建新百业</h3>
                        <div className="space-y-4">
                            <PixelInput
                                label="百业名称"
                                placeholder="输入百业名称"
                                value={newName}
                                onChange={(e) => setNewName(e.target.value)}
                            />
                            <PixelInput
                                label="描述 (可选)"
                                placeholder="输入百业描述"
                                value={newDesc}
                                onChange={(e) => setNewDesc(e.target.value)}
                            />
                            <div className="flex gap-2">
                                <PixelButton
                                    onClick={handleCreate}
                                    isLoading={creating}
                                    disabled={!newName.trim()}
                                >
                                    创建
                                </PixelButton>
                                <PixelButton
                                    variant="secondary"
                                    onClick={() => setShowCreate(false)}
                                >
                                    取消
                                </PixelButton>
                            </div>
                        </div>
                    </PixelCard>
                )}

                {/* VIP/User limit info */}
                {user?.role === 'vip' && !canCreate && (
                    <div className="mb-6 text-sm text-neutral-500">
                        ⚠️ VIP 用户最多可创建 1 个百业，您已达到上限
                    </div>
                )}

                {/* Baiye Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {baiyeList.map((baiye) => {
                        const hue = parseInt(baiye.id.slice(0, 2), 16) * 10;
                        const bgGradient = `linear-gradient(135deg, hsl(${hue}, 30%, 20%), hsl(${hue + 40}, 30%, 15%))`;

                        return (
                            <div
                                key={baiye.id}
                                className="relative group border-4 border-black bg-neutral-800 transition-all hover:-translate-y-1 hover:shadow-[4px_4px_0_0_#facc15] overflow-hidden cursor-pointer"
                                onClick={() => router.push(`/baiye/${baiye.id}/hall`)}
                            >
                                {/* Cover */}
                                <div
                                    className="h-32 w-full flex items-center justify-center select-none border-b-4 border-black"
                                    style={{ background: baiye.cover_image ? `url(${baiye.cover_image}) center/cover` : bgGradient }}
                                >
                                    <div className="font-bold text-4xl text-white/10 uppercase tracking-tighter">
                                        百业
                                    </div>
                                </div>

                                {/* Admin Delete Button */}
                                {user?.role === 'admin' && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleDelete(baiye.id, baiye.name);
                                        }}
                                        className="absolute top-2 right-2 w-6 h-6 bg-red-600 hover:bg-red-500 text-white font-bold text-sm border-2 border-black flex items-center justify-center transition-colors z-10"
                                        title="删除百业"
                                    >
                                        ✕
                                    </button>
                                )}

                                {/* Content */}
                                <div className="p-4">
                                    <h3 className="text-lg font-bold text-white truncate mb-1">
                                        {baiye.name}
                                    </h3>
                                    {baiye.description && (
                                        <p className="text-sm text-neutral-400 truncate">
                                            {baiye.description}
                                        </p>
                                    )}
                                    <div className="mt-3 text-xs text-neutral-500">
                                        点击进入 →
                                    </div>
                                </div>
                            </div>
                        );
                    })}

                    {baiyeList.length === 0 && (
                        <div className="col-span-full py-12 text-center border-2 border-dashed border-neutral-700 text-neutral-500 bg-neutral-900/50">
                            暂无百业，{canCreate ? "点击上方按钮创建一个" : "等待管理员创建..."}
                        </div>
                    )}
                </div>
            </div>
        </main>
    );
}

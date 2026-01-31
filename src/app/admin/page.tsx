"use client";

import { PixelButton } from "@/components/pixel/pixel-button";
import { PixelCard } from "@/components/pixel/pixel-card";
import { SupabaseService } from "@/services/supabase-service";
import { User, UserRole } from "@/types/app";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const ROLE_COLORS: Record<UserRole, string> = {
    admin: "bg-red-500 text-white",
    vip: "bg-yellow-500 text-black",
    user: "bg-neutral-600 text-white",
};

const ROLE_LABELS: Record<UserRole, string> = {
    admin: "管理员",
    vip: "VIP",
    user: "用户",
};

export default function AdminPage() {
    const router = useRouter();
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [updating, setUpdating] = useState<string | null>(null);

    useEffect(() => {
        const checkAccess = async () => {
            const user = await SupabaseService.getUser();
            if (!user) {
                router.push("/login");
                return;
            }

            if (user.role !== "admin") {
                alert("无权访问管理页面");
                router.push("/baiye");
                return;
            }

            setCurrentUser(user);
            await fetchUsers();
            setLoading(false);
        };
        checkAccess();
    }, [router]);

    const fetchUsers = async () => {
        try {
            const allUsers = await SupabaseService.getAllUsers();
            setUsers(allUsers);
        } catch (error) {
            console.error("Failed to fetch users:", error);
        }
    };

    const handleRoleChange = async (userId: string, newRole: UserRole) => {
        if (userId === currentUser?.id && newRole !== "admin") {
            if (!confirm("你确定要移除自己的管理员权限吗？这将导致你无法再访问此页面。")) {
                return;
            }
        }

        setUpdating(userId);
        try {
            await SupabaseService.updateUserRole(userId, newRole);
            await fetchUsers();

            // If user removed self from admin, redirect
            if (userId === currentUser?.id && newRole !== "admin") {
                router.push("/baiye");
            }
        } catch (error: any) {
            alert("更新失败: " + (error.message || JSON.stringify(error)));
        } finally {
            setUpdating(null);
        }
    };

    if (loading) {
        return (
            <main className="flex min-h-screen items-center justify-center bg-neutral-900">
                <div className="text-white text-xl animate-pulse">加载中...</div>
            </main>
        );
    }

    return (
        <main className="flex min-h-screen flex-col bg-neutral-900 p-4 pb-20">
            {/* Header */}
            <div className="mb-8 flex justify-between items-center max-w-4xl mx-auto w-full border-b-4 border-white/10 pb-4">
                <div>
                    <h1 className="text-3xl font-bold text-white uppercase tracking-wider text-shadow-pixel">
                        用户管理
                    </h1>
                    <div className="flex items-center gap-2 mt-1">
                        <span className="text-neutral-500 text-xs">管理员:</span>
                        <span className="text-red-500 font-bold font-mono terminal-text">
                            {currentUser?.character_name}
                        </span>
                    </div>
                </div>
                <button
                    onClick={() => router.push("/baiye")}
                    className="text-blue-400 hover:text-blue-300 font-bold uppercase text-sm"
                >
                    [ 返回百业列表 ]
                </button>
            </div>

            {/* User List */}
            <div className="max-w-4xl mx-auto w-full">
                <PixelCard className="bg-neutral-800">
                    <div className="text-xl font-bold text-red-500 uppercase border-b-2 border-red-500/20 pb-2 mb-4">
                        所有用户 ({users.length})
                    </div>

                    <div className="space-y-3">
                        {users.map((user) => (
                            <div
                                key={user.id}
                                className="flex items-center justify-between p-3 bg-neutral-900 border-2 border-neutral-700 hover:border-neutral-600 transition-colors"
                            >
                                {/* User Info */}
                                <div className="flex items-center gap-4">
                                    <div
                                        className={`px-2 py-1 text-xs font-bold uppercase ${ROLE_COLORS[user.role]}`}
                                    >
                                        {ROLE_LABELS[user.role]}
                                    </div>
                                    <div>
                                        <div className="font-bold text-white">
                                            {user.character_name}
                                            {user.id === currentUser?.id && (
                                                <span className="text-yellow-500 ml-2">(你)</span>
                                            )}
                                        </div>
                                        <div className="text-xs text-neutral-500 font-mono">
                                            {user.email}
                                        </div>
                                    </div>
                                </div>

                                {/* Role Selector */}
                                <div className="flex items-center gap-2">
                                    {updating === user.id ? (
                                        <span className="text-yellow-500 text-sm animate-pulse">
                                            更新中...
                                        </span>
                                    ) : (
                                        <select
                                            value={user.role}
                                            onChange={(e) =>
                                                handleRoleChange(user.id, e.target.value as UserRole)
                                            }
                                            className="bg-neutral-800 border-2 border-neutral-600 text-white px-3 py-1 text-sm focus:border-yellow-500 outline-none cursor-pointer"
                                        >
                                            <option value="user">用户</option>
                                            <option value="vip">VIP</option>
                                            <option value="admin">管理员</option>
                                        </select>
                                    )}
                                </div>
                            </div>
                        ))}

                        {users.length === 0 && (
                            <div className="text-center py-8 text-neutral-500">
                                暂无用户数据
                            </div>
                        )}
                    </div>
                </PixelCard>

                {/* Info Card */}
                <div className="mt-6 p-4 border-2 border-dashed border-neutral-700 text-neutral-500 text-sm">
                    <div className="font-bold text-yellow-500 mb-2">权限说明:</div>
                    <ul className="space-y-1 list-disc list-inside">
                        <li><span className="text-red-400">管理员</span>: 可删除所有房间，管理所有房间和用户</li>
                        <li><span className="text-yellow-400">VIP</span>: 可创建房间，修改自己的房间设置</li>
                        <li><span className="text-neutral-400">用户</span>: 只能加入房间</li>
                    </ul>
                </div>
            </div>
        </main>
    );
}

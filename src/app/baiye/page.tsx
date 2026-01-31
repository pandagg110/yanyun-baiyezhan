"use client";

import { PixelButton } from "@/components/pixel/pixel-button";
import { PixelCard } from "@/components/pixel/pixel-card";
import { PixelInput } from "@/components/pixel/pixel-input";
import { SupabaseService } from "@/services/supabase-service";
import { Baiye, User } from "@/types/app";
import { useRouter } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import { Settings } from "lucide-react";

export default function BaiyePage() {
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [baiyeList, setBaiyeList] = useState<Baiye[]>([]);
    const [loading, setLoading] = useState(true);

    // Create form
    const [showCreate, setShowCreate] = useState(false);
    const [newName, setNewName] = useState("");
    const [newDesc, setNewDesc] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [newCoverFile, setNewCoverFile] = useState<File | null>(null);
    const [newCoverPreview, setNewCoverPreview] = useState<string | null>(null);
    const [creating, setCreating] = useState(false);
    const [canCreate, setCanCreate] = useState(false);
    const createFileRef = useRef<HTMLInputElement>(null);

    // Edit modal
    const [editingBaiye, setEditingBaiye] = useState<Baiye | null>(null);
    const [editName, setEditName] = useState("");
    const [editDesc, setEditDesc] = useState("");
    const [editPassword, setEditPassword] = useState("");
    const [editCoverFile, setEditCoverFile] = useState<File | null>(null);
    const [editCoverPreview, setEditCoverPreview] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const editFileRef = useRef<HTMLInputElement>(null);

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

    const handleCreateFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setNewCoverFile(file);
            const reader = new FileReader();
            reader.onload = (ev) => setNewCoverPreview(ev.target?.result as string);
            reader.readAsDataURL(file);
        }
    };

    const handleCreate = async () => {
        if (!user || !newName.trim()) return;
        setCreating(true);
        try {
            // Upload cover image first if selected
            let coverUrl: string | undefined;
            if (newCoverFile) {
                coverUrl = await SupabaseService.uploadImage(newCoverFile);
            }

            await SupabaseService.createBaiye(user.id, newName.trim(), newDesc.trim() || undefined, coverUrl, newPassword.trim() || undefined);
            setNewName("");
            setNewDesc("");
            setNewPassword("");
            setNewCoverFile(null);
            setNewCoverPreview(null);
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

    const openEditModal = (baiye: Baiye) => {
        setEditingBaiye(baiye);
        setEditName(baiye.name);
        setEditDesc(baiye.description || "");
        setEditPassword(baiye.password || "");
        setEditCoverPreview(baiye.cover_image || null);
        setEditCoverFile(null);
    };

    const handleEditFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setEditCoverFile(file);
            const reader = new FileReader();
            reader.onload = (ev) => setEditCoverPreview(ev.target?.result as string);
            reader.readAsDataURL(file);
        }
    };

    const handleSaveEdit = async () => {
        if (!editingBaiye || !editName.trim()) return;
        setSaving(true);
        try {
            let coverUrl = editingBaiye.cover_image;
            if (editCoverFile) {
                coverUrl = await SupabaseService.uploadImage(editCoverFile);
            }

            await SupabaseService.updateBaiye(editingBaiye.id, {
                name: editName.trim(),
                description: editDesc.trim() || undefined,
                cover_image: coverUrl,
                password: editPassword.trim() || null
            });

            setEditingBaiye(null);
            await fetchBaiyeList();
        } catch (e: any) {
            alert("保存失败: " + (e.message || JSON.stringify(e)));
        } finally {
            setSaving(false);
        }
    };

    const handleLogout = async () => {
        await SupabaseService.logout();
        router.push("/login");
    };

    const handleEnterBaiye = (baiye: Baiye) => {
        // Admin and owner can bypass password
        if (user?.role === 'admin' || baiye.owner_id === user?.id) {
            router.push(`/baiye/${baiye.id}/hall`);
            return;
        }

        // Check if password is required
        if (baiye.password) {
            const pwd = prompt("请输入百业访问密码:");
            if (pwd === null) return; // User cancelled

            if (pwd !== baiye.password) {
                alert("密码错误");
                return;
            }
        }

        router.push(`/baiye/${baiye.id}/hall`);
    };

    const canEditBaiye = (baiye: Baiye) => {
        return user?.role === 'admin' || baiye.owner_id === user?.id;
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

                            {/* Cover Image Upload */}
                            <div className="space-y-2">
                                <label className="text-sm font-bold uppercase tracking-wider text-neutral-400">封面图片 (可选)</label>
                                <input
                                    ref={createFileRef}
                                    type="file"
                                    accept="image/*"
                                    onChange={handleCreateFileChange}
                                    className="hidden"
                                />
                                <div className="flex gap-2 items-center">
                                    <button
                                        type="button"
                                        onClick={() => createFileRef.current?.click()}
                                        className="px-3 py-2 bg-neutral-700 hover:bg-neutral-600 text-white text-sm border-2 border-black"
                                    >
                                        选择图片
                                    </button>
                                    {newCoverPreview && (
                                        <div className="relative w-16 h-16 border-2 border-black overflow-hidden">
                                            <img src={newCoverPreview} alt="preview" className="w-full h-full object-cover" />
                                            <button
                                                onClick={() => { setNewCoverFile(null); setNewCoverPreview(null); }}
                                                className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-xs flex items-center justify-center"
                                            >×</button>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Password */}
                            <div className="space-y-2">
                                <label className="text-sm font-bold uppercase tracking-wider text-neutral-400">访问密码 (可选)</label>
                                <input
                                    type="password"
                                    placeholder="留空则无需密码"
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    className="w-full bg-neutral-900 border-2 border-neutral-700 rounded p-2 text-sm text-white focus:border-yellow-500 outline-none"
                                />
                            </div>

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
                                    onClick={() => { setShowCreate(false); setNewCoverFile(null); setNewCoverPreview(null); }}
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
                        const hasCustomImage = baiye.cover_image && baiye.cover_image !== 'default';

                        return (
                            <div
                                key={baiye.id}
                                className="relative group border-4 border-black bg-neutral-800 transition-all hover:-translate-y-1 hover:shadow-[4px_4px_0_0_#facc15] overflow-hidden cursor-pointer"
                                onClick={() => handleEnterBaiye(baiye)}
                            >
                                {/* Cover */}
                                <div
                                    className="h-32 w-full flex items-center justify-center select-none border-b-4 border-black relative"
                                    style={{ background: hasCustomImage ? undefined : bgGradient }}
                                >
                                    {hasCustomImage ? (
                                        <img src={baiye.cover_image} alt="" className="w-full h-full object-cover absolute inset-0" />
                                    ) : (
                                        <div className="font-bold text-4xl text-white/10 uppercase tracking-tighter">
                                            百业
                                        </div>
                                    )}
                                </div>

                                {/* Settings Button (Admin or Owner) */}
                                {canEditBaiye(baiye) && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            openEditModal(baiye);
                                        }}
                                        className="absolute top-2 left-2 w-7 h-7 bg-neutral-700 hover:bg-neutral-600 text-white border-2 border-black flex items-center justify-center transition-colors z-10"
                                        title="编辑百业"
                                    >
                                        <Settings className="w-4 h-4" />
                                    </button>
                                )}

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
                                    <div className="mt-3 text-xs text-neutral-500 flex items-center gap-2">
                                        {baiye.password && (
                                            <span className="text-yellow-500" title="需要密码">🔒</span>
                                        )}
                                        <span>点击进入 →</span>
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

            {/* Edit Modal */}
            {editingBaiye && (
                <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
                    <PixelCard className="w-full max-w-md bg-neutral-900 border-yellow-500 relative">
                        <button
                            onClick={() => setEditingBaiye(null)}
                            className="absolute top-2 right-2 text-neutral-500 hover:text-white text-xl"
                        >×</button>

                        <h3 className="text-lg font-bold text-yellow-500 mb-4">编辑百业</h3>

                        <div className="space-y-4">
                            <PixelInput
                                label="百业名称"
                                placeholder="输入百业名称"
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                            />
                            <PixelInput
                                label="描述 (可选)"
                                placeholder="输入百业描述"
                                value={editDesc}
                                onChange={(e) => setEditDesc(e.target.value)}
                            />

                            {/* Cover Image Edit */}
                            <div className="space-y-2">
                                <label className="text-sm font-bold uppercase tracking-wider text-neutral-400">封面图片</label>
                                <input
                                    ref={editFileRef}
                                    type="file"
                                    accept="image/*"
                                    onChange={handleEditFileChange}
                                    className="hidden"
                                />
                                <div className="flex gap-2 items-center">
                                    <button
                                        type="button"
                                        onClick={() => editFileRef.current?.click()}
                                        className="px-3 py-2 bg-neutral-700 hover:bg-neutral-600 text-white text-sm border-2 border-black"
                                    >
                                        更换图片
                                    </button>
                                    {editCoverPreview && (
                                        <div className="relative w-20 h-20 border-2 border-black overflow-hidden">
                                            <img src={editCoverPreview} alt="preview" className="w-full h-full object-cover" />
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Password Edit */}
                            <div className="space-y-2">
                                <label className="text-sm font-bold uppercase tracking-wider text-neutral-400">访问密码</label>
                                <input
                                    type="password"
                                    placeholder="留空则移除密码"
                                    value={editPassword}
                                    onChange={(e) => setEditPassword(e.target.value)}
                                    className="w-full bg-neutral-900 border-2 border-neutral-700 rounded p-2 text-sm text-white focus:border-yellow-500 outline-none"
                                />
                                <p className="text-xs text-neutral-500">留空则移除密码保护</p>
                            </div>

                            <div className="flex gap-2 pt-4 border-t border-neutral-700">
                                <PixelButton
                                    onClick={handleSaveEdit}
                                    isLoading={saving}
                                    disabled={!editName.trim()}
                                >
                                    保存
                                </PixelButton>
                                <PixelButton
                                    variant="secondary"
                                    onClick={() => setEditingBaiye(null)}
                                >
                                    取消
                                </PixelButton>
                            </div>
                        </div>
                    </PixelCard>
                </div>
            )}
        </main>
    );
}

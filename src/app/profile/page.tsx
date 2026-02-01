"use client";

import { PixelButton } from "@/components/pixel/pixel-button";
import { PixelCard } from "@/components/pixel/pixel-card";
import { PixelInput } from "@/components/pixel/pixel-input";
import { SupabaseService } from "@/services/supabase-service";
import { User } from "@/types/app";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function ProfilePage() {
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Form
    const [characterName, setCharacterName] = useState("");
    const [avatarUrl, setAvatarUrl] = useState("default");

    useEffect(() => {
        const init = async () => {
            const u = await SupabaseService.getUser();
            if (!u) {
                router.push("/login");
                return;
            }
            setUser(u);
            setCharacterName(u.character_name);
            setAvatarUrl(u.avatar_url || "default");
            setLoading(false);
        };
        init();
    }, [router]);

    const handleSave = async () => {
        if (!user) return;
        if (!characterName.trim()) return alert("请输入昵称");

        setSaving(true);
        try {
            await SupabaseService.updateProfile(user.id, {
                character_name: characterName,
                avatar_url: avatarUrl
            });
            alert("保存成功！");

            // Should prompt re-fetch of user info in other components if they don't auto-update
            // But for simple SPA, next page load will get new data
        } catch (e: any) {
            console.error(e);
            alert("保存失败: " + e.message);
        } finally {
            setSaving(false);
        }
    };

    const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            // Re-use 'image' bucket logic or 'avatar' if specialized, but implementation plan said reuse logic
            // Assuming 'image' folder in 'baiyezhan' bucket
            const url = await SupabaseService.uploadFile(file, 'image');
            setAvatarUrl(url);
        } catch (err: any) {
            alert("上传失败: " + (err.message || JSON.stringify(err)));
        }
    };

    if (loading) {
        return <div className="min-h-screen bg-neutral-900 flex items-center justify-center text-white">Loading...</div>;
    }

    return (
        <main className="min-h-screen bg-neutral-900 text-white p-4 flex flex-col items-center">
            {/* Header */}
            <header className="w-full max-w-2xl flex justify-between items-center mb-8 border-b-4 border-white/10 pb-4">
                <h1 className="text-2xl font-bold uppercase tracking-widest text-yellow-500 text-shadow-pixel">
                    OPERATOR PROFILE
                </h1>
                <button
                    onClick={() => router.back()}
                    className="text-neutral-500 hover:text-white uppercase font-bold text-sm"
                >
                    [ BACK ]
                </button>
            </header>

            <PixelCard className="w-full max-w-2xl space-y-8 bg-neutral-800 p-8 border-4 border-black shadow-[8px_8px_0_0_#000]">
                {/* ID Card Style Layout */}
                <div className="flex flex-col md:flex-row gap-8">

                    {/* Left: Avatar */}
                    <div className="flex flex-col items-center gap-4 shrink-0">
                        <div className="relative w-32 h-32 md:w-40 md:h-40 border-4 border-white bg-black group overflow-hidden">
                            {avatarUrl && avatarUrl !== 'default' ? (
                                <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center bg-neutral-700 text-neutral-500 font-bold text-4xl">
                                    ?
                                </div>
                            )}

                            {/* Upload Overlay */}
                            <label className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center cursor-pointer transition-opacity">
                                <span className="text-xs font-bold text-white uppercase text-center px-2">
                                    Upload / Change
                                </span>
                                <input
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={handleAvatarUpload}
                                />
                            </label>
                        </div>
                        <div className="text-xs text-neutral-500 uppercase font-mono tracking-widest text-center">
                            ID: {user?.id.slice(0, 8)}
                        </div>
                    </div>

                    {/* Right: Form */}
                    <div className="flex-1 space-y-6 w-full">
                        <PixelInput
                            label="代号 / Nickname"
                            value={characterName}
                            onChange={(e) => setCharacterName(e.target.value)}
                            placeholder="Ente your codename..."
                            className="bg-neutral-900 border-2 border-neutral-700"
                        />

                        <div className="space-y-2 opacity-50 pointer-events-none grayscale">
                            <label className="text-sm font-bold uppercase tracking-wider text-neutral-400">
                                Email / Login
                            </label>
                            <div className="w-full bg-neutral-900/50 border-2 border-dashed border-neutral-700 p-2 text-neutral-500 font-mono text-sm">
                                {user?.email}
                            </div>
                        </div>

                        <div className="space-y-2 opacity-50 pointer-events-none grayscale">
                            <label className="text-sm font-bold uppercase tracking-wider text-neutral-400">
                                Clearance Level
                            </label>
                            <div className="w-full bg-neutral-900/50 border-2 border-dashed border-neutral-700 p-2 text-neutral-500 font-mono text-sm uppercase">
                                {user?.role}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Actions */}
                <div className="pt-8 border-t-2 border-black/20 flex gap-4">
                    <PixelButton
                        onClick={handleSave}
                        isLoading={saving}
                        className="flex-1 text-lg py-3"
                    >
                        SAVE CHANGES
                    </PixelButton>
                </div>

            </PixelCard>
        </main>
    );
}

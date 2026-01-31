"use client";

import { PixelButton } from "@/components/pixel/pixel-button";
import { PixelCard } from "@/components/pixel/pixel-card";
import { PixelInput } from "@/components/pixel/pixel-input";
import { SupabaseService } from "@/services/supabase-service";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";

export default function LoginPage() {
    const router = useRouter();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [charName, setCharName] = useState("");
    const [isRegister, setIsRegister] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    // Check if already logged in (30-day persistence)
    useEffect(() => {
        const checkSession = async () => {
            const { data: { session } } = await SupabaseService.getSession();
            if (session) {
                router.push("/baiye");
            }
        };
        checkSession();
    }, [router]);

    const handleAuth = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email || !password) return;
        if (isRegister && !charName) return;

        setIsLoading(true);
        try {
            if (isRegister) {
                await SupabaseService.register(email, password, charName);
            } else {
                await SupabaseService.login(email, password);
            }
            router.push("/baiye");
        } catch (err: any) {
            console.error("Auth Error:", err);
            alert(`操作失败: ${err.message || "请检查邮箱或密码"}`);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <main className="flex min-h-screen flex-col items-center justify-center bg-neutral-900 p-4">
            <div className="mb-8 text-center">
                <h1 className="mb-2 text-4xl font-bold text-yellow-500 uppercase tracking-widest text-shadow-pixel">
                    百业播报
                </h1>
                <p className="text-neutral-400">百业播报 v1.1</p>
            </div>

            <PixelCard className="w-full max-w-md space-y-6 bg-neutral-800 p-8">
                <div className="text-center text-xl font-bold uppercase text-white">
                    身份验证
                </div>

                <form onSubmit={handleAuth} className="space-y-6">
                    <PixelInput
                        label="邮箱"
                        placeholder="enter@email.com"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                    />

                    <PixelInput
                        label="密码"
                        placeholder="******"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        minLength={6}
                    />

                    {isRegister && (
                        <PixelInput
                            label="游戏角色名"
                            placeholder="输入角色名"
                            value={charName}
                            onChange={(e) => setCharName(e.target.value)}
                            required
                        />
                    )}

                    <PixelButton
                        type="submit"
                        className="w-full"
                        isLoading={isLoading}
                    >
                        {isRegister ? "注册并登录" : "登录系统"}
                    </PixelButton>

                    <div className="text-center text-sm text-neutral-400">
                        {isRegister ? "已有账号? " : "首次使用? "}
                        <button
                            type="button"
                            className="text-yellow-500 hover:underline font-bold"
                            onClick={() => setIsRegister(!isRegister)}
                        >
                            {isRegister ? "直接登录" : "创建账号"}
                        </button>
                    </div>
                </form>
            </PixelCard>
        </main>
    );
}

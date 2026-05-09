"use client";

import { PixelButton } from "@/components/pixel/pixel-button";
import { PixelCard } from "@/components/pixel/pixel-card";
import { supabase } from "@/lib/supabase";
import { Baiye, User } from "@/types/app";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function FeedbackPage() {
    const params = useParams();
    const baiyeId = params.id as string;
    const router = useRouter();

    const [baiye, setBaiye] = useState<Baiye | null>(null);
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    // Form fields
    const [worstExperience, setWorstExperience] = useState("");
    const [improvementSuggestion, setImprovementSuggestion] = useState("");
    const [goodParts, setGoodParts] = useState("");
    const [playerRole, setPlayerRole] = useState("");
    const [isAnonymous, setIsAnonymous] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);

    useEffect(() => {
        const init = async () => {
            // Fetch baiye info (public, no auth needed)
            const { data: b } = await supabase
                .from('baiyezhan_baiye')
                .select('*')
                .eq('id', baiyeId)
                .single();

            if (b) setBaiye(b as Baiye);

            // Try to get user (optional - may not be logged in)
            try {
                const { data: { session } } = await supabase.auth.getSession();
                if (session?.user) {
                    const { data: profile } = await supabase
                        .from('baiyezhan_users')
                        .select('*')
                        .eq('id', session.user.id)
                        .single();
                    if (profile) setUser(profile as User);
                }
            } catch {
                // Not logged in, that's fine
            }

            setLoading(false);
        };
        init();
    }, [baiyeId]);

    const handleSubmit = async () => {
        if (!improvementSuggestion.trim()) {
            alert("请填写必填项：最需要优化的建议");
            return;
        }

        setIsSubmitting(true);
        try {
            const insertPayload: any = {
                baiye_id: baiyeId,
                worst_experience: worstExperience.trim() || null,
                improvement_suggestion: improvementSuggestion.trim(),
                good_parts: goodParts.trim() || null,
                player_role: playerRole || null,
                is_anonymous: !user ? true : isAnonymous,
                user_id: (!user || isAnonymous) ? null : user.id,
                user_name: (!user || isAnonymous) ? null : user.character_name,
            };

            const { error } = await supabase
                .from('baiyezhan_feedback')
                .insert(insertPayload);

            if (error) throw error;
            setSubmitted(true);
        } catch (e: any) {
            console.error("Submit feedback error:", e);
            alert("提交失败: " + (e.message || "未知错误"));
        } finally {
            setIsSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-neutral-900 flex items-center justify-center text-white">
                正在加载...
            </div>
        );
    }

    // Success page
    if (submitted) {
        return (
            <main className="min-h-screen bg-neutral-900 text-white flex items-center justify-center p-4">
                <PixelCard className="bg-neutral-800 max-w-md w-full text-center space-y-6 p-8">
                    <div className="text-6xl mb-2">✅</div>
                    <div className="text-2xl font-bold text-green-400 uppercase">
                        反馈提交成功
                    </div>
                    <div className="text-sm text-neutral-400 leading-relaxed">
                        感谢你的反馈！<br />
                        我们会认真对待每一条意见，<br />
                        持续优化百业战的体验。
                    </div>
                    {baiye && (
                        <div className="pt-4 space-y-2">
                            <button
                                onClick={() => {
                                    setSubmitted(false);
                                    setWorstExperience("");
                                    setImprovementSuggestion("");
                                    setGoodParts("");
                                    setPlayerRole("");
                                    setIsAnonymous(false);
                                }}
                                className="w-full py-2 text-sm font-bold border-2 border-neutral-600 bg-neutral-700 text-white hover:bg-neutral-600 transition-colors"
                            >
                                📝 再提交一条
                            </button>
                            <button
                                onClick={() => router.push(`/baiye/${baiyeId}/hall`)}
                                className="w-full py-2 text-sm font-bold text-neutral-500 hover:text-white transition-colors"
                            >
                                ← 返回百业大厅
                            </button>
                        </div>
                    )}
                </PixelCard>
            </main>
        );
    }

    return (
        <main className="min-h-screen bg-neutral-900 text-white p-4 md:p-8">
            <div className="max-w-lg mx-auto">
                {/* Header */}
                <header className="mb-6 border-b-4 border-black pb-4">
                    <button
                        onClick={() => router.push(`/baiye/${baiyeId}/hall`)}
                        className="text-xs text-neutral-500 hover:text-white mb-2 block"
                    >
                        ← 返回百业大厅
                    </button>
                    <h1 className="text-2xl font-bold text-yellow-500 uppercase">
                        📝 战后反馈
                    </h1>
                    {baiye && (
                        <p className="text-sm text-neutral-500 mt-1">
                            {baiye.name}
                        </p>
                    )}
                </header>

                {/* Warm motivational message */}
                <div className="mb-6 border-2 border-yellow-500/20 bg-yellow-500/5 p-4 space-y-2">
                    <div className="text-yellow-400 font-bold text-sm">📮 指挥想听听你的想法</div>
                    <p className="text-neutral-300 text-sm leading-relaxed">
                        每一场百业战，都离不开在座各位的付出。
                        你的每一条反馈，指挥都会认真看——我们会借助 AI 把大家的声音汇总成优化计划，让下一场打得更好。
                    </p>
                    <p className="text-neutral-500 text-xs">
                        💛 哪怕只是一句话，都可能成为改变的起点。谢谢你。
                    </p>
                </div>

                {/* User status hint */}
                {!user && (
                    <div className="mb-4 border-2 border-neutral-700 bg-neutral-800/50 p-3 text-sm">
                        <span className="text-neutral-400">🔓 未登录状态 · 你的反馈将以匿名形式提交</span>
                    </div>
                )}

                {/* Form */}
                <PixelCard className="bg-neutral-800 space-y-5">
                    {/* Required Field */}
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-bold uppercase tracking-wider text-red-400 mb-2">
                                * 最需要优化的建议
                            </label>
                            <textarea
                                value={improvementSuggestion}
                                onChange={(e) => setImprovementSuggestion(e.target.value)}
                                placeholder="你觉得哪里需要改进？有什么好的想法？"
                                rows={4}
                                className="w-full bg-neutral-900 border-2 border-neutral-700 rounded p-3 text-sm text-white focus:border-yellow-500 outline-none resize-none placeholder:text-neutral-600"
                            />
                        </div>
                    </div>

                    {/* Optional Fields */}
                    <div className="space-y-4 pt-3 border-t border-neutral-700">
                        <div className="text-xs text-neutral-500 uppercase font-bold tracking-wider">
                            选填信息
                        </div>

                        <div>
                            <label className="block text-sm font-bold uppercase tracking-wider text-neutral-400 mb-2">
                                本次体验最不好的地方
                            </label>
                            <textarea
                                value={worstExperience}
                                onChange={(e) => setWorstExperience(e.target.value)}
                                placeholder="哪些地方让你觉得不舒服？可以是指挥、配合、节奏、规则等任何方面..."
                                rows={3}
                                className="w-full bg-neutral-900 border-2 border-neutral-700 rounded p-3 text-sm text-white focus:border-yellow-500 outline-none resize-none placeholder:text-neutral-600"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-bold uppercase tracking-wider text-neutral-400 mb-2">
                                做得好的地方
                            </label>
                            <textarea
                                value={goodParts}
                                onChange={(e) => setGoodParts(e.target.value)}
                                placeholder="有什么做得好、想继续保持的地方？（可选）"
                                rows={3}
                                className="w-full bg-neutral-900 border-2 border-neutral-700 rounded p-3 text-sm text-white focus:border-yellow-500 outline-none resize-none placeholder:text-neutral-600"
                            />
                        </div>

                        {/* Position Selection */}
                        <div>
                            <label className="block text-sm font-bold uppercase tracking-wider text-neutral-400 mb-2">
                                你的位置
                            </label>
                            <div className="flex gap-2 flex-wrap">
                                {['防守', '进攻'].map(role => (
                                    <button
                                        key={role}
                                        onClick={() => setPlayerRole(playerRole === role ? '' : role)}
                                        className={`px-4 py-2 text-sm font-bold border-2 transition-colors ${
                                            playerRole === role
                                                ? 'bg-yellow-500 text-black border-yellow-600'
                                                : 'bg-neutral-700 text-white border-neutral-600 hover:border-neutral-500'
                                        }`}
                                    >
                                        {role}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Anonymous Toggle - only show for logged-in users */}
                        {user && (
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <label className="text-sm font-bold uppercase tracking-wider text-neutral-400">
                                        匿名提交
                                    </label>
                                    <button
                                        onClick={() => setIsAnonymous(!isAnonymous)}
                                        className={`relative w-12 h-6 rounded-full transition-colors border-2 border-black ${
                                            isAnonymous ? 'bg-yellow-500' : 'bg-neutral-700'
                                        }`}
                                    >
                                        <div
                                            className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform shadow-md ${
                                                isAnonymous ? 'translate-x-6' : 'translate-x-0.5'
                                            }`}
                                        />
                                    </button>
                                </div>
                                {isAnonymous ? (
                                    <div className="text-xs text-yellow-500/80">
                                        🔒 匿名模式：不记录你的用户信息
                                    </div>
                                ) : (
                                    <div className="text-xs text-neutral-500">
                                        将以 <span className="text-blue-400">{user.character_name}</span> 身份提交
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Submit */}
                    <div className="pt-3">
                        <PixelButton
                            className="w-full"
                            onClick={handleSubmit}
                            isLoading={isSubmitting}
                            disabled={!improvementSuggestion.trim()}
                        >
                            提交反馈
                        </PixelButton>
                        <p className="text-[10px] text-neutral-600 text-center mt-3">
                            你的反馈将帮助我们持续优化百业战体验
                        </p>
                    </div>
                </PixelCard>
            </div>
        </main>
    );
}

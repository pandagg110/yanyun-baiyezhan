"use client";

import { ImprovementAiPanel } from "@/components/feature/improvement-ai-panel";
import { ImprovementFeedbackForm } from "@/components/feature/improvement-feedback-form";
import { ImprovementKanban } from "@/components/feature/improvement-kanban";
import { PixelCard } from "@/components/pixel/pixel-card";
import { SupabaseService } from "@/services/supabase-service";
import { Baiye, Todo, User } from "@/types/app";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function ImprovementPage() {
    const params = useParams();
    const baiyeId = params.id as string;
    const router = useRouter();

    const [user, setUser] = useState<User | null>(null);
    const [baiye, setBaiye] = useState<Baiye | null>(null);
    const [loading, setLoading] = useState(true);
    const [todoRefreshKey, setTodoRefreshKey] = useState(0);
    const [selectedTodo, setSelectedTodo] = useState<Todo | null>(null);

    useEffect(() => {
        const init = async () => {
            const u = await SupabaseService.getUser();
            if (!u) { router.push("/login"); return; }
            setUser(u);
            const b = await SupabaseService.getBaiye(baiyeId);
            if (!b) { router.push("/baiye"); return; }
            setBaiye(b);
            setLoading(false);
        };
        init();
    }, [router, baiyeId]);

    if (loading) {
        return <div className="min-h-screen bg-neutral-900 flex items-center justify-center text-white">正在加载...</div>;
    }

    const isAdmin = user?.role === 'admin';

    return (
        <main className="min-h-screen bg-neutral-900 text-white">
            {/* Header */}
            <header className="sticky top-0 z-30 bg-neutral-900/95 backdrop-blur-sm border-b-4 border-black">
                <div className="max-w-[1600px] mx-auto px-4 md:px-8 py-3 flex justify-between items-center">
                    <div>
                        <button
                            onClick={() => router.push(`/baiye/${baiyeId}/hall`)}
                            className="text-xs text-neutral-500 hover:text-white mb-0.5 block"
                        >
                            ← 返回百业大厅
                        </button>
                        <h1 className="text-xl font-bold text-yellow-500 uppercase flex items-center gap-2">
                            <span>🔧</span>
                            <span>战术改进中心</span>
                        </h1>
                        {baiye && <p className="text-xs text-neutral-500">{baiye.name}</p>}
                    </div>
                    <div className="flex items-center gap-3">
                        <span className="text-xs text-neutral-500 font-bold uppercase">
                            [ {user?.character_name} ]
                        </span>
                    </div>
                </div>
            </header>

            {/* Main Content - Three Column Layout */}
            <div className="max-w-[1600px] mx-auto px-4 md:px-8 py-6">
                <div className="flex flex-col xl:flex-row gap-6">
                    {/* Left Column: Feedback Form */}
                    <div className="w-full xl:w-72 shrink-0">
                        <PixelCard className="bg-neutral-800 space-y-3">
                            <div className="text-lg font-bold text-purple-400 uppercase border-b-2 border-purple-400/20 pb-2">
                                📝 战后反馈
                            </div>
                            <ImprovementFeedbackForm baiyeId={baiyeId} user={user} />
                        </PixelCard>

                        {/* Lifecycle Description */}
                        <div className="mt-4 border border-neutral-700/50 bg-neutral-800/30 p-3 space-y-2">
                            <div className="text-xs font-bold text-neutral-400 uppercase">📌 生命周期</div>
                            <div className="space-y-1.5">
                                {[
                                    { icon: '📝', label: '反馈收集', desc: '玩家提交战后体验' },
                                    { icon: '🤖', label: 'AI 总结', desc: '自动分析生成计划' },
                                    { icon: '📋', label: '计划跟踪', desc: '看板管理优化项' },
                                    { icon: '✅', label: '完成验证', desc: '标记完成或被重开' },
                                    { icon: '🔗', label: '复盘关联', desc: '问题溯源到对战' },
                                ].map((step, i) => (
                                    <div key={i} className="flex items-center gap-2">
                                        <span className="text-sm w-5 text-center">{step.icon}</span>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-[11px] font-bold text-neutral-300">{step.label}</div>
                                            <div className="text-[10px] text-neutral-600">{step.desc}</div>
                                        </div>
                                        {i < 4 && <span className="text-neutral-700 text-[10px]">→</span>}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Center Column: Kanban */}
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-4">
                            <h2 className="text-lg font-bold text-white uppercase">📋 优化计划看板</h2>
                        </div>
                        <ImprovementKanban
                            baiyeId={baiyeId}
                            isAdmin={isAdmin}
                            refreshKey={todoRefreshKey}
                            onSelectTodo={setSelectedTodo}
                            selectedTodoId={selectedTodo?.id || null}
                        />
                    </div>

                    {/* Right Column: AI Panel + Match Insights */}
                    <div className="w-full xl:w-80 shrink-0">
                        {isAdmin ? (
                            <ImprovementAiPanel
                                baiyeId={baiyeId}
                                onTodosGenerated={() => setTodoRefreshKey(k => k + 1)}
                                selectedTodo={selectedTodo}
                                baiyeName={baiye?.name}
                            />
                        ) : (
                            /* Non-admin: Show selected todo details */
                            selectedTodo ? (
                                <PixelCard className="bg-neutral-800 space-y-3">
                                    <div className="text-sm font-bold text-purple-400 uppercase border-b-2 border-purple-400/20 pb-2">
                                        📌 计划详情
                                    </div>
                                    <div className="space-y-2">
                                        <div className="text-sm font-bold text-white">{selectedTodo.title}</div>
                                        {selectedTodo.description && (
                                            <div className="text-xs text-neutral-400">{selectedTodo.description}</div>
                                        )}
                                        {selectedTodo.keywords && selectedTodo.keywords.length > 0 && (
                                            <div className="flex gap-1 flex-wrap">
                                                {selectedTodo.keywords.map((kw, i) => (
                                                    <span key={i} className="text-[10px] bg-purple-500/15 text-purple-400 px-1.5 py-0.5 rounded border border-purple-500/20">{kw}</span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </PixelCard>
                            ) : (
                                <div className="border border-dashed border-neutral-700 text-neutral-600 text-xs text-center py-12 px-4">
                                    ← 点击看板中的计划卡片查看详情
                                </div>
                            )
                        )}
                    </div>
                </div>
            </div>
        </main>
    );
}

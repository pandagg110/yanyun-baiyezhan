"use client";

import { PixelButton } from "@/components/pixel/pixel-button";
import { PixelCard } from "@/components/pixel/pixel-card";
import { SupabaseService } from "@/services/supabase-service";
import { Feedback, Todo } from "@/types/app";
import { useState, useRef } from "react";

interface ImprovementAiPanelProps {
    baiyeId: string;
    onTodosGenerated?: () => void;
    selectedTodo?: Todo | null;
    baiyeName?: string;
}

type TimeRange = 'today' | 'recent_3' | 'recent_7' | 'recent_30' | 'all';

const TIME_OPTS: { value: TimeRange; label: string }[] = [
    { value: 'today', label: '今日' },
    { value: 'recent_3', label: '近3天' },
    { value: 'recent_7', label: '近7天' },
    { value: 'recent_30', label: '近30天' },
    { value: 'all', label: '全部' },
];

const TIPS = [
    '正在收集反馈数据...',
    'AI 正在阅读大家的心声...',
    '正在分析共性问题...',
    '正在评估优先级...',
    '正在生成优化计划...',
    '快好了，再等一下...',
];

interface MatchInsight {
    match_id: string;
    team_a: string;
    team_b: string;
    match_start_time: string;
    snippet: string;
}

export function ImprovementAiPanel({ baiyeId, onTodosGenerated, selectedTodo, baiyeName }: ImprovementAiPanelProps) {
    const [timeRange, setTimeRange] = useState<TimeRange>('recent_7');
    const [isGenerating, setIsGenerating] = useState(false);
    const [result, setResult] = useState<{ feedback_count: number; todo_count: number } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [tipIdx, setTipIdx] = useState(0);
    const tipRef = useRef<NodeJS.Timeout | null>(null);
    const abortRef = useRef<AbortController | null>(null);

    // Feedback preview
    const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
    const [showFb, setShowFb] = useState(false);
    const [loadingFb, setLoadingFb] = useState(false);

    // Match insights
    const [insights, setInsights] = useState<MatchInsight[]>([]);
    const [loadingInsights, setLoadingInsights] = useState(false);

    const getTimeParams = () => {
        switch (timeRange) {
            case 'today': return { time_range: 'today' as const };
            case 'recent_3': return { time_range: 'recent_n' as const, days: '3' };
            case 'recent_7': return { time_range: 'recent_n' as const, days: '7' };
            case 'recent_30': return { time_range: 'recent_n' as const, days: '30' };
            case 'all': return { time_range: 'custom' as const };
        }
    };

    const generate = async () => {
        setIsGenerating(true); setError(null); setResult(null);
        setTipIdx(0);
        tipRef.current = setInterval(() => setTipIdx(p => (p + 1) % TIPS.length), 5000);
        const ctrl = new AbortController();
        abortRef.current = ctrl;

        try {
            const params = getTimeParams();
            const res = await fetch('/api/feedback/summarize', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ baiye_id: baiyeId, ...params }),
                signal: ctrl.signal,
            });
            const data = await res.json();
            if (!res.ok) { setError(data.error || '生成失败'); return; }
            setResult({ feedback_count: data.feedback_count, todo_count: data.todos?.length || 0 });
            onTodosGenerated?.();
        } catch (e: any) {
            if (e.name === 'AbortError') return;
            setError(e.message || '请求失败');
        } finally {
            setIsGenerating(false);
            if (tipRef.current) { clearInterval(tipRef.current); tipRef.current = null; }
            abortRef.current = null;
        }
    };

    const cancel = () => {
        abortRef.current?.abort();
        setIsGenerating(false);
        if (tipRef.current) { clearInterval(tipRef.current); tipRef.current = null; }
    };

    const loadFeedbacks = async () => {
        if (showFb) { setShowFb(false); return; }
        setLoadingFb(true);
        try {
            let startTime: string | undefined;
            if (timeRange === 'today') { const d = new Date(); d.setHours(0, 0, 0, 0); startTime = d.toISOString(); }
            else if (timeRange !== 'all') { const days = parseInt(timeRange.replace('recent_', '')); startTime = new Date(Date.now() - days * 86400000).toISOString(); }
            const data = await SupabaseService.getFeedbacksByBaiye(baiyeId, { startTime, limit: 100 });
            setFeedbacks(data); setShowFb(true);
        } catch (e) { console.error("Failed to load feedbacks:", e); }
        finally { setLoadingFb(false); }
    };

    // Load match insights when a todo is selected
    const loadInsights = async (todo: Todo) => {
        if (!todo.keywords || todo.keywords.length === 0) { setInsights([]); return; }
        setLoadingInsights(true);
        try {
            const res = await fetch('/api/improvement/match-link', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ baiye_id: baiyeId, keywords: todo.keywords }),
            });
            if (res.ok) {
                const data = await res.json();
                setInsights(data.results || []);
            }
        } catch (e) { console.error("Failed to load insights:", e); }
        finally { setLoadingInsights(false); }
    };

    // When selectedTodo changes, load insights
    useState(() => {
        if (selectedTodo) loadInsights(selectedTodo);
        else setInsights([]);
    });

    return (
        <>
            {/* Full-screen loading overlay */}
            {isGenerating && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="text-center space-y-6 max-w-sm px-6">
                        <div className="relative w-20 h-20 mx-auto">
                            <div className="absolute inset-0 border-4 border-yellow-500/20 rounded-full" />
                            <div className="absolute inset-0 border-4 border-transparent border-t-yellow-500 rounded-full animate-spin" />
                            <div className="absolute inset-2 border-4 border-transparent border-b-cyan-400 rounded-full animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }} />
                            <div className="absolute inset-0 flex items-center justify-center text-2xl">🤖</div>
                        </div>
                        <div className="space-y-2">
                            <div className="text-lg font-bold text-yellow-400">AI 正在分析反馈</div>
                            <div className="text-sm text-neutral-300 h-5">{TIPS[tipIdx]}</div>
                            <div className="text-xs text-neutral-500 mt-2">通常需要 30~60 秒</div>
                        </div>
                        <button onClick={cancel} className="px-6 py-2 text-sm font-bold border-2 border-neutral-600 bg-neutral-800 text-neutral-400 hover:text-white hover:border-neutral-500 transition-colors">
                            取消生成
                        </button>
                    </div>
                </div>
            )}

            <div className="space-y-4">
                {/* AI Summary Section */}
                <PixelCard className="bg-neutral-800 space-y-3">
                    <div className="text-lg font-bold text-cyan-400 uppercase border-b-2 border-cyan-400/20 pb-2">
                        🤖 AI 反馈总结
                    </div>
                    <div className="text-xs text-neutral-500">选择时间范围，AI 自动分析反馈生成计划。</div>

                    {/* Time Range */}
                    <div className="flex gap-1.5 flex-wrap">
                        {TIME_OPTS.map(o => (
                            <button key={o.value} onClick={() => setTimeRange(o.value)}
                                className={`px-2.5 py-1 text-xs font-bold border-2 transition-colors ${timeRange === o.value ? 'bg-cyan-500 text-black border-cyan-600' : 'bg-neutral-700 text-white border-neutral-600 hover:border-neutral-500'}`}>
                                {o.label}
                            </button>
                        ))}
                    </div>

                    {/* Buttons */}
                    <div className="flex gap-2">
                        <PixelButton className="flex-1" onClick={generate} disabled={isGenerating}>🚀 生成总结</PixelButton>
                        <button onClick={loadFeedbacks} disabled={loadingFb}
                            className="px-3 py-2 text-xs font-bold border-2 border-neutral-600 bg-neutral-700 text-white hover:bg-neutral-600 transition-colors">
                            {loadingFb ? '...' : '📜'}
                        </button>
                    </div>

                    {/* Result */}
                    {result && (
                        <div className="border-2 border-green-500/30 bg-green-500/10 p-2 text-sm">
                            <div className="text-green-400 font-bold">✅ 生成完成</div>
                            <div className="text-xs text-neutral-400 mt-1">
                                分析 <span className="text-white font-bold">{result.feedback_count}</span> 条反馈，
                                生成 <span className="text-white font-bold">{result.todo_count}</span> 条计划
                            </div>
                        </div>
                    )}
                    {error && (
                        <div className="border-2 border-red-500/30 bg-red-500/10 p-2 text-sm">
                            <div className="text-red-400 font-bold">⚠️ 错误</div>
                            <div className="text-xs text-neutral-400 mt-1">{error}</div>
                        </div>
                    )}

                    {/* Feedback List */}
                    {showFb && (
                        <div className="space-y-2 border-t border-neutral-700 pt-2">
                            <div className="text-xs text-neutral-500 font-bold uppercase">原始反馈 ({feedbacks.length})</div>
                            {feedbacks.length === 0 ? (
                                <div className="text-xs text-neutral-600 text-center py-2">暂无反馈</div>
                            ) : (
                                <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
                                    {feedbacks.map(fb => (
                                        <div key={fb.id} className="border border-neutral-700 bg-neutral-900 p-2 text-xs space-y-1">
                                            <div className="flex justify-between items-start">
                                                <span className="text-neutral-500 font-mono">{new Date(fb.created_at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                                                <div className="flex gap-1">
                                                    {fb.player_role && <span className="text-[10px] bg-neutral-700 px-1.5 py-0.5 rounded text-neutral-300">{fb.player_role}</span>}
                                                    {fb.is_anonymous && <span className="text-[10px] bg-neutral-700 px-1.5 py-0.5 rounded text-yellow-500">匿名</span>}
                                                </div>
                                            </div>
                                            {fb.worst_experience && <div><span className="text-red-400">❌ </span><span className="text-neutral-300">{fb.worst_experience}</span></div>}
                                            <div><span className="text-yellow-400">💡 </span><span className="text-neutral-300">{fb.improvement_suggestion}</span></div>
                                            {fb.good_parts && <div><span className="text-green-400">✨ </span><span className="text-neutral-300">{fb.good_parts}</span></div>}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </PixelCard>

                {/* Match Insight Linker */}
                {selectedTodo && (
                    <PixelCard className="bg-neutral-800 space-y-3">
                        <div className="text-sm font-bold text-purple-400 uppercase border-b-2 border-purple-400/20 pb-2">
                            🔗 关联复盘
                        </div>
                        <div className="text-xs text-neutral-500">
                            选中的问题：<span className="text-white font-bold">{selectedTodo.title}</span>
                        </div>
                        {selectedTodo.keywords && selectedTodo.keywords.length > 0 ? (
                            <>
                                <div className="flex gap-1 flex-wrap">
                                    {selectedTodo.keywords.map((kw, i) => (
                                        <span key={i} className="text-[10px] bg-purple-500/15 text-purple-400 px-1.5 py-0.5 rounded border border-purple-500/20">{kw}</span>
                                    ))}
                                </div>
                                {loadingInsights ? (
                                    <div className="text-xs text-neutral-500 text-center py-4">搜索关联复盘中...</div>
                                ) : insights.length > 0 ? (
                                    <div className="space-y-2 max-h-48 overflow-y-auto">
                                        {insights.map((ins, i) => (
                                            <div key={i} className="border border-neutral-700 bg-neutral-900 p-2 text-xs">
                                                <div className="flex justify-between items-center mb-1">
                                                    <span className="text-white font-bold">{ins.team_a} vs {ins.team_b}</span>
                                                    <span className="text-neutral-500 font-mono">{new Date(ins.match_start_time).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })}</span>
                                                </div>
                                                <div className="text-neutral-400 line-clamp-3">{ins.snippet}</div>
                                                <a href={`/baiye/${baiyeId}/analysis`} className="text-[10px] text-cyan-500 hover:text-cyan-400 mt-1 inline-block">
                                                    → 查看完整分析
                                                </a>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-xs text-neutral-600 text-center py-4 border border-dashed border-neutral-700">
                                        暂未找到关联复盘
                                    </div>
                                )}
                            </>
                        ) : (
                            <div className="text-xs text-neutral-600 text-center py-4 border border-dashed border-neutral-700">
                                该计划暂无关键词，使用 AI 重新生成可自动提取
                            </div>
                        )}
                    </PixelCard>
                )}
            </div>
        </>
    );
}

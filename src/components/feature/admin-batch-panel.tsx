"use client";

import { PixelButton } from "@/components/pixel/pixel-button";
import { PixelCard } from "@/components/pixel/pixel-card";
import { SupabaseService } from "@/services/supabase-service";
import { Feedback } from "@/types/app";
import { useState, useRef } from "react";

interface AdminBatchPanelProps {
    baiyeId: string;
    onTodosGenerated?: () => void;
}

type TimeRange = 'today' | 'recent_3' | 'recent_7' | 'recent_30' | 'all';

const TIME_RANGE_OPTIONS: { value: TimeRange; label: string }[] = [
    { value: 'today', label: '今日' },
    { value: 'recent_3', label: '近3天' },
    { value: 'recent_7', label: '近7天' },
    { value: 'recent_30', label: '近30天' },
    { value: 'all', label: '全部' },
];

// Loading tips that cycle during generation
const LOADING_TIPS = [
    '正在收集反馈数据...',
    'AI 正在阅读大家的心声...',
    '正在分析共性问题...',
    '正在评估优先级...',
    '正在生成优化计划...',
    '快好了，再等一下...',
    '还在努力中，感谢耐心等待...',
];

export function AdminBatchPanel({ baiyeId, onTodosGenerated }: AdminBatchPanelProps) {
    const [timeRange, setTimeRange] = useState<TimeRange>('recent_7');
    const [isGenerating, setIsGenerating] = useState(false);
    const [result, setResult] = useState<{ feedback_count: number; todo_count: number } | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Loading overlay state
    const [loadingTipIndex, setLoadingTipIndex] = useState(0);
    const tipIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const abortControllerRef = useRef<AbortController | null>(null);

    // Feedback preview
    const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
    const [showFeedbacks, setShowFeedbacks] = useState(false);
    const [loadingFeedbacks, setLoadingFeedbacks] = useState(false);

    const getTimeParams = () => {
        switch (timeRange) {
            case 'today':
                return { time_range: 'today' as const };
            case 'recent_3':
                return { time_range: 'recent_n' as const, days: '3' };
            case 'recent_7':
                return { time_range: 'recent_n' as const, days: '7' };
            case 'recent_30':
                return { time_range: 'recent_n' as const, days: '30' };
            case 'all':
                return { time_range: 'custom' as const };
        }
    };

    const startLoadingTips = () => {
        setLoadingTipIndex(0);
        tipIntervalRef.current = setInterval(() => {
            setLoadingTipIndex(prev => (prev + 1) % LOADING_TIPS.length);
        }, 5000);
    };

    const stopLoadingTips = () => {
        if (tipIntervalRef.current) {
            clearInterval(tipIntervalRef.current);
            tipIntervalRef.current = null;
        }
    };

    const handleGenerate = async () => {
        setIsGenerating(true);
        setError(null);
        setResult(null);
        startLoadingTips();

        const controller = new AbortController();
        abortControllerRef.current = controller;

        try {
            const params = getTimeParams();
            const res = await fetch('/api/feedback/summarize', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    baiye_id: baiyeId,
                    ...params,
                }),
                signal: controller.signal,
            });

            const data = await res.json();

            if (!res.ok) {
                setError(data.error || '生成失败');
                return;
            }

            setResult({
                feedback_count: data.feedback_count,
                todo_count: data.todos?.length || 0,
            });

            onTodosGenerated?.();
        } catch (e: any) {
            if (e.name === 'AbortError') {
                // User cancelled
                return;
            }
            setError(e.message || '请求失败');
        } finally {
            setIsGenerating(false);
            stopLoadingTips();
            abortControllerRef.current = null;
        }
    };

    const handleCancel = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        setIsGenerating(false);
        stopLoadingTips();
    };

    const handleLoadFeedbacks = async () => {
        if (showFeedbacks) {
            setShowFeedbacks(false);
            return;
        }

        setLoadingFeedbacks(true);
        try {
            let startTime: string | undefined;
            if (timeRange === 'today') {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                startTime = today.toISOString();
            } else if (timeRange !== 'all') {
                const days = parseInt(timeRange.replace('recent_', ''));
                startTime = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
            }

            const data = await SupabaseService.getFeedbacksByBaiye(baiyeId, {
                startTime,
                limit: 100,
            });
            setFeedbacks(data);
            setShowFeedbacks(true);
        } catch (e) {
            console.error("Failed to load feedbacks:", e);
        } finally {
            setLoadingFeedbacks(false);
        }
    };

    return (
        <>
            {/* Full-screen loading overlay */}
            {isGenerating && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="text-center space-y-6 max-w-sm px-6">
                        {/* Spinning animation */}
                        <div className="relative w-20 h-20 mx-auto">
                            <div className="absolute inset-0 border-4 border-yellow-500/20 rounded-full" />
                            <div className="absolute inset-0 border-4 border-transparent border-t-yellow-500 rounded-full animate-spin" />
                            <div className="absolute inset-2 border-4 border-transparent border-b-cyan-400 rounded-full animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }} />
                            <div className="absolute inset-0 flex items-center justify-center text-2xl">
                                🤖
                            </div>
                        </div>

                        {/* Status text */}
                        <div className="space-y-2">
                            <div className="text-lg font-bold text-yellow-400">
                                AI 正在分析反馈
                            </div>
                            <div className="text-sm text-neutral-300 h-5 transition-opacity duration-500">
                                {LOADING_TIPS[loadingTipIndex]}
                            </div>
                            <div className="text-xs text-neutral-500 mt-2">
                                通常需要 30~60 秒，请耐心等待
                            </div>
                        </div>

                        {/* Cancel button */}
                        <button
                            onClick={handleCancel}
                            className="px-6 py-2 text-sm font-bold border-2 border-neutral-600 bg-neutral-800 text-neutral-400 hover:text-white hover:border-neutral-500 transition-colors"
                        >
                            取消生成
                        </button>
                    </div>
                </div>
            )}

            <PixelCard className="bg-neutral-800 space-y-3">
                <div className="text-xl font-bold text-cyan-400 uppercase border-b-2 border-cyan-400/20 pb-2">
                    🤖 AI 反馈总结
                </div>

                <div className="text-xs text-neutral-500">
                    选择时间范围后点击生成，AI 将分析玩家反馈并自动创建优化计划。
                </div>

                {/* Time Range Picker */}
                <div className="flex gap-1.5 flex-wrap">
                    {TIME_RANGE_OPTIONS.map(opt => (
                        <button
                            key={opt.value}
                            onClick={() => setTimeRange(opt.value)}
                            className={`px-2.5 py-1 text-xs font-bold border-2 transition-colors ${timeRange === opt.value
                                    ? 'bg-cyan-500 text-black border-cyan-600'
                                    : 'bg-neutral-700 text-white border-neutral-600 hover:border-neutral-500'
                                }`}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2">
                    <PixelButton
                        className="flex-1"
                        onClick={handleGenerate}
                        disabled={isGenerating}
                    >
                        🚀 生成总结
                    </PixelButton>

                    <button
                        onClick={handleLoadFeedbacks}
                        disabled={loadingFeedbacks}
                        className="px-3 py-2 text-xs font-bold border-2 border-neutral-600 bg-neutral-700 text-white hover:bg-neutral-600 transition-colors"
                        title="查看原始反馈"
                    >
                        {loadingFeedbacks ? '...' : '📜'}
                    </button>
                </div>

                {/* Result */}
                {result && (
                    <div className="border-2 border-green-500/30 bg-green-500/10 p-2 text-sm">
                        <div className="text-green-400 font-bold">✅ 生成完成</div>
                        <div className="text-xs text-neutral-400 mt-1">
                            分析了 <span className="text-white font-bold">{result.feedback_count}</span> 条反馈，
                            生成了 <span className="text-white font-bold">{result.todo_count}</span> 条优化计划
                        </div>
                    </div>
                )}

                {/* Error */}
                {error && (
                    <div className="border-2 border-red-500/30 bg-red-500/10 p-2 text-sm">
                        <div className="text-red-400 font-bold">⚠️ 错误</div>
                        <div className="text-xs text-neutral-400 mt-1">{error}</div>
                    </div>
                )}

                {/* Feedback List */}
                {showFeedbacks && (
                    <div className="space-y-2 border-t border-neutral-700 pt-2">
                        <div className="text-xs text-neutral-500 font-bold uppercase">
                            原始反馈 ({feedbacks.length})
                        </div>
                        {feedbacks.length === 0 ? (
                            <div className="text-xs text-neutral-600 text-center py-2">暂无反馈数据</div>
                        ) : (
                            <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                                {feedbacks.map(fb => (
                                    <div key={fb.id} className="border border-neutral-700 bg-neutral-900 p-2 text-xs space-y-1">
                                        <div className="flex justify-between items-start">
                                            <span className="text-neutral-500 font-mono">
                                                {new Date(fb.created_at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                            <div className="flex gap-1">
                                                {fb.player_role && (
                                                    <span className="text-[10px] bg-neutral-700 px-1.5 py-0.5 rounded text-neutral-300">
                                                        {fb.player_role}
                                                    </span>
                                                )}
                                                {fb.is_anonymous && (
                                                    <span className="text-[10px] bg-neutral-700 px-1.5 py-0.5 rounded text-yellow-500">
                                                        匿名
                                                    </span>
                                                )}
                                                {!fb.is_anonymous && fb.user_name && (
                                                    <span className="text-[10px] bg-neutral-700 px-1.5 py-0.5 rounded text-blue-400">
                                                        {fb.user_name}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        {fb.worst_experience && (
                                            <div>
                                                <span className="text-red-400">❌ </span>
                                                <span className="text-neutral-300">{fb.worst_experience}</span>
                                            </div>
                                        )}
                                        <div>
                                            <span className="text-yellow-400">💡 </span>
                                            <span className="text-neutral-300">{fb.improvement_suggestion}</span>
                                        </div>
                                        {fb.good_parts && (
                                            <div>
                                                <span className="text-green-400">✨ </span>
                                                <span className="text-neutral-300">{fb.good_parts}</span>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </PixelCard>
        </>
    );
}

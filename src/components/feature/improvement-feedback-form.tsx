"use client";

import { PixelButton } from "@/components/pixel/pixel-button";
import { supabase } from "@/lib/supabase";
import { User } from "@/types/app";
import { useState } from "react";

interface ImprovementFeedbackFormProps {
    baiyeId: string;
    user: User | null;
}

export function ImprovementFeedbackForm({ baiyeId, user }: ImprovementFeedbackFormProps) {
    const [worstExperience, setWorstExperience] = useState("");
    const [improvementSuggestion, setImprovementSuggestion] = useState("");
    const [goodParts, setGoodParts] = useState("");
    const [playerRole, setPlayerRole] = useState("");
    const [isAnonymous, setIsAnonymous] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);

    const handleSubmit = async () => {
        if (!improvementSuggestion.trim()) return;
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

    const handleReset = () => {
        setSubmitted(false);
        setWorstExperience("");
        setImprovementSuggestion("");
        setGoodParts("");
        setPlayerRole("");
        setIsAnonymous(false);
    };

    if (submitted) {
        return (
            <div className="text-center space-y-4 py-6">
                <div className="text-4xl">✅</div>
                <div className="text-lg font-bold text-green-400">反馈已提交</div>
                <div className="text-xs text-neutral-400">
                    感谢你的反馈！指挥会认真看。
                </div>
                <button
                    onClick={handleReset}
                    className="px-4 py-2 text-xs font-bold border-2 border-neutral-600 bg-neutral-700 text-white hover:bg-neutral-600 transition-colors"
                >
                    📝 再提交一条
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Motivational */}
            <div className="border border-yellow-500/20 bg-yellow-500/5 p-3 space-y-1">
                <div className="text-yellow-400 font-bold text-xs">📮 指挥想听听你的想法</div>
                <p className="text-neutral-400 text-[11px] leading-relaxed">
                    每一条反馈都会被 AI 汇总成优化计划。
                </p>
            </div>

            {/* Required: Improvement Suggestion */}
            <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-red-400 mb-1.5">
                    * 最需要优化的建议
                </label>
                <textarea
                    value={improvementSuggestion}
                    onChange={(e) => setImprovementSuggestion(e.target.value)}
                    placeholder="你觉得哪里需要改进？"
                    rows={3}
                    className="w-full bg-neutral-900 border-2 border-neutral-700 rounded p-2.5 text-sm text-white focus:border-yellow-500 outline-none resize-none placeholder:text-neutral-600"
                />
            </div>

            {/* Optional: Worst Experience */}
            <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-neutral-500 mb-1.5">
                    最不好的体验（选填）
                </label>
                <textarea
                    value={worstExperience}
                    onChange={(e) => setWorstExperience(e.target.value)}
                    placeholder="哪些地方让你觉得不舒服？"
                    rows={2}
                    className="w-full bg-neutral-900 border-2 border-neutral-700 rounded p-2.5 text-sm text-white focus:border-yellow-500 outline-none resize-none placeholder:text-neutral-600"
                />
            </div>

            {/* Optional: Good Parts */}
            <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-neutral-500 mb-1.5">
                    做得好的地方（选填）
                </label>
                <textarea
                    value={goodParts}
                    onChange={(e) => setGoodParts(e.target.value)}
                    placeholder="有什么想继续保持的？"
                    rows={2}
                    className="w-full bg-neutral-900 border-2 border-neutral-700 rounded p-2.5 text-sm text-white focus:border-yellow-500 outline-none resize-none placeholder:text-neutral-600"
                />
            </div>

            {/* Position Selector */}
            <div className="flex gap-2">
                {['防守', '进攻'].map(role => (
                    <button
                        key={role}
                        onClick={() => setPlayerRole(playerRole === role ? '' : role)}
                        className={`flex-1 py-1.5 text-xs font-bold border-2 transition-colors ${playerRole === role
                            ? 'bg-yellow-500 text-black border-yellow-600'
                            : 'bg-neutral-700 text-white border-neutral-600 hover:border-neutral-500'
                            }`}
                    >
                        {role}
                    </button>
                ))}
            </div>

            {/* Anonymous Toggle - logged in only */}
            {user && (
                <div className="flex items-center justify-between text-xs">
                    <span className="text-neutral-400">匿名提交</span>
                    <button
                        onClick={() => setIsAnonymous(!isAnonymous)}
                        className={`relative w-10 h-5 rounded-full transition-colors border border-black ${isAnonymous ? 'bg-yellow-500' : 'bg-neutral-700'
                            }`}
                    >
                        <div
                            className={`absolute top-0.5 w-3.5 h-3.5 bg-white rounded-full transition-transform shadow-md ${isAnonymous ? 'translate-x-5' : 'translate-x-0.5'
                                }`}
                        />
                    </button>
                </div>
            )}

            {/* Submit */}
            <PixelButton
                className="w-full"
                onClick={handleSubmit}
                isLoading={isSubmitting}
                disabled={!improvementSuggestion.trim()}
            >
                提交反馈
            </PixelButton>
        </div>
    );
}

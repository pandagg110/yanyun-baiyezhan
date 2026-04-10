"use client";

import { PixelButton } from "@/components/pixel/pixel-button";
import { SupabaseService } from "@/services/supabase-service";
import { Baiye, Match, MatchScreenshot, MatchStat, User } from "@/types/app";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface MatchWithStats extends Match {
    stats_count: number;
    submitted_teams: string[];
}

interface MatchDetail {
    match: Match;
    stats: MatchStat[];
    team_a_stats: MatchStat[];
    team_b_stats: MatchStat[];
    submitted_teams: string[];
    screenshots: MatchScreenshot[];
}

const STAT_COLS: { key: keyof MatchStat; label: string }[] = [
    { key: "kills", label: "击败" },
    { key: "assists", label: "助攻" },
    { key: "deaths", label: "重伤" },
    { key: "coins", label: "逗币" },
    { key: "damage", label: "输出" },
    { key: "damage_taken", label: "承伤" },
    { key: "healing", label: "治疗" },
    { key: "building_damage", label: "建筑" },
];

export default function MatchHistoryPage() {
    const params = useParams();
    const baiyeId = params.id as string;
    const router = useRouter();

    const [user, setUser] = useState<User | null>(null);
    const [baiye, setBaiye] = useState<Baiye | null>(null);
    const [matches, setMatches] = useState<MatchWithStats[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Detail expansion
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [loadingDetail, setLoadingDetail] = useState(false);
    const [detail, setDetail] = useState<MatchDetail | null>(null);

    // Delete state
    const [deletingId, setDeletingId] = useState<string | null>(null);

    // Screenshot lightbox
    const [showScreenshots, setShowScreenshots] = useState(false);
    const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

    // Permissions
    const isAdmin = user?.role === "admin";
    const canSubmit = user?.role === "admin" || user?.role === "vip";

    useEffect(() => {
        const init = async () => {
            const u = await SupabaseService.getUser();
            setUser(u);

            const b = await SupabaseService.getBaiye(baiyeId);
            if (!b) {
                router.push("/baiye");
                return;
            }
            setBaiye(b);

            try {
                const res = await fetch(`/api/matches?baiye_name=${encodeURIComponent(b.name)}`);
                if (!res.ok) throw new Error("Failed to fetch matches");
                const data = await res.json();
                setMatches(data.matches || []);
            } catch (err: unknown) {
                setError(err instanceof Error ? err.message : "加载失败");
            }
            setLoading(false);
        };
        init();
    }, [router, baiyeId]);

    const toggleDetail = async (matchId: string) => {
        if (expandedId === matchId) {
            setExpandedId(null);
            setDetail(null);
            return;
        }

        setExpandedId(matchId);
        setLoadingDetail(true);

        try {
            const res = await fetch(`/api/matches/${matchId}`);
            if (!res.ok) throw new Error("Failed to fetch detail");
            const data = await res.json();
            setDetail(data);
        } catch {
            setDetail(null);
        }
        setLoadingDetail(false);
    };

    const handleDelete = async (matchId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!confirm("确认删除此对局记录？所有关联的玩家数据也将被删除。")) return;

        setDeletingId(matchId);
        try {
            const { data: { session } } = await SupabaseService.getSession();
            const token = session?.access_token;

            const res = await fetch(`/api/matches/${matchId}`, {
                method: "DELETE",
                headers: token ? { Authorization: `Bearer ${token}` } : {},
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || `HTTP ${res.status}`);
            }

            // Remove from local state
            setMatches((prev) => prev.filter((m) => m.id !== matchId));
            if (expandedId === matchId) {
                setExpandedId(null);
                setDetail(null);
            }
        } catch (err: unknown) {
            alert(err instanceof Error ? err.message : "删除失败");
        } finally {
            setDeletingId(null);
        }
    };

    const formatTime = (t?: string) => {
        if (!t) return "—";
        return new Date(t).toLocaleString("zh-CN", {
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
        });
    };

    const getWinnerBadge = (m: Match) => {
        if (!m.winner || m.winner === "draw") {
            return (
                <span className="text-xs font-bold text-yellow-500 bg-yellow-500/10 px-2 py-0.5 border border-yellow-500/30">
                    {m.winner === "draw" ? "🤝 平局" : "⏳ 待定"}
                </span>
            );
        }
        const isOurWin = m.winner === baiye?.name;
        return (
            <span className={`text-xs font-bold px-2 py-0.5 border ${
                isOurWin
                    ? "text-green-400 bg-green-500/10 border-green-500/30"
                    : "text-red-400 bg-red-500/10 border-red-500/30"
            }`}>
                🏆 {m.winner}
            </span>
        );
    };

    const renderTeamTable = (teamName: string, stats: MatchStat[], isOurTeam: boolean) => {
        if (stats.length === 0) {
            return (
                <div className="text-center text-sm text-neutral-500 py-4 border border-dashed border-neutral-700">
                    {teamName} · 暂无数据
                </div>
            );
        }

        return (
            <div className="space-y-2">
                <h4 className={`text-sm font-bold uppercase flex items-center gap-2 ${
                    isOurTeam ? "text-yellow-500" : "text-blue-400"
                }`}>
                    {isOurTeam ? "⭐" : "⚔️"} {teamName}
                    <span className="text-xs text-neutral-500 font-normal">({stats.length}人)</span>
                </h4>
                <div className="overflow-x-auto">
                    <table className="w-full text-xs border-collapse min-w-[800px]">
                        <thead>
                            <tr className="border-b border-neutral-700">
                                <th className="text-left py-2 px-2 text-neutral-500 uppercase">玩家</th>
                                {STAT_COLS.map((col) => (
                                    <th key={col.key} className="text-center py-2 px-1 text-neutral-500">{col.label}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {stats.map((s) => (
                                <tr key={s.id} className="border-b border-neutral-800 hover:bg-neutral-800/50">
                                    <td className="py-1.5 px-2 font-bold text-white">{s.player_name}</td>
                                    {STAT_COLS.map((col) => (
                                        <td key={col.key} className="py-1.5 px-1 text-center text-neutral-300">
                                            {Number(s[col.key]).toLocaleString()}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-neutral-900 flex items-center justify-center text-white">
                正在加载...
            </div>
        );
    }

    return (
        <main className="min-h-screen bg-neutral-900 text-white p-4 md:p-8">
            {/* Header */}
            <header className="max-w-6xl mx-auto flex justify-between items-center mb-8 border-b-4 border-black pb-4">
                <div>
                    <button
                        onClick={() => router.push(`/baiye/${baiyeId}/hall`)}
                        className="text-xs text-neutral-500 hover:text-white mb-1"
                    >
                        ← 返回{baiye?.name}
                    </button>
                    <h1 className="text-2xl font-bold text-yellow-500 uppercase">
                        📋 百业战记录
                    </h1>
                    <p className="text-xs text-neutral-500">
                        {baiye?.name} 参与的所有对战 · 共 {matches.length} 场
                    </p>
                </div>
                {canSubmit && (
                    <PixelButton onClick={() => router.push(`/baiye/${baiyeId}/stats`)}>
                        📊 录入战绩
                    </PixelButton>
                )}
            </header>

            {error && (
                <div className="max-w-6xl mx-auto mb-4 bg-red-900/50 border-2 border-red-600 p-3 text-sm text-red-300">
                    ❌ {error}
                </div>
            )}

            <div className="max-w-6xl mx-auto space-y-3">
                {matches.length === 0 ? (
                    <div className="py-20 text-center border-2 border-dashed border-neutral-700 text-neutral-500 bg-neutral-800/50">
                        <div className="text-4xl mb-4">📭</div>
                        <p className="text-lg font-bold mb-2">暂无对战记录</p>
                        <p className="text-sm mb-4">
                            {canSubmit ? "前往录入页面上传第一份战绩数据吧" : "暂无对战数据"}
                        </p>
                        {canSubmit && (
                            <PixelButton onClick={() => router.push(`/baiye/${baiyeId}/stats`)}>
                                📷 去录入
                            </PixelButton>
                        )}
                    </div>
                ) : (
                    matches.map((m) => (
                        <div key={m.id} className="border-2 border-neutral-700 bg-neutral-800/50">
                            {/* Row Header */}
                            <div className="flex items-center">
                                <button
                                    onClick={() => toggleDetail(m.id)}
                                    className="flex-1 text-left p-4 hover:bg-neutral-800 transition-colors flex items-center gap-4"
                                >
                                    {/* Teams */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className={`font-bold text-sm ${
                                                m.team_a === baiye?.name ? "text-yellow-500" : "text-white"
                                            }`}>
                                                {m.team_a}
                                            </span>
                                            <span className="text-neutral-600 text-xs font-bold">VS</span>
                                            <span className={`font-bold text-sm ${
                                                m.team_b === baiye?.name ? "text-yellow-500" : "text-white"
                                            }`}>
                                                {m.team_b}
                                            </span>
                                        </div>
                                        <div className="text-xs text-neutral-500 mt-1 flex items-center gap-2">
                                            <span>{formatTime(m.match_start_time)}</span>
                                            {m.notes && <span>· {m.notes}</span>}
                                        </div>
                                    </div>

                                    {/* Winner Badge */}
                                    <div className="shrink-0">{getWinnerBadge(m)}</div>

                                    {/* Submission Status */}
                                    <div className="shrink-0 text-xs w-20 text-right">
                                        <div className="text-neutral-300 font-bold">{m.stats_count} 人</div>
                                        <div className="flex gap-0.5 justify-end mt-0.5">
                                            {[m.team_a, m.team_b].map((tn) => (
                                                <div
                                                    key={tn}
                                                    className={`w-3 h-3 border ${
                                                        m.submitted_teams?.includes(tn)
                                                            ? "bg-green-500 border-green-600"
                                                            : "bg-neutral-700 border-neutral-600"
                                                    }`}
                                                    title={`${tn}: ${m.submitted_teams?.includes(tn) ? "已提交" : "未提交"}`}
                                                />
                                            ))}
                                        </div>
                                    </div>

                                    {/* Expand Arrow */}
                                    <div className={`text-neutral-500 text-xs transition-transform ${
                                        expandedId === m.id ? "rotate-90" : ""
                                    }`}>
                                        ▶
                                    </div>
                                </button>

                                {/* Admin Delete Button */}
                                {isAdmin && (
                                    <button
                                        onClick={(e) => handleDelete(m.id, e)}
                                        disabled={deletingId === m.id}
                                        className="px-3 py-2 mr-2 text-xs text-red-400 hover:text-red-300 hover:bg-red-900/30 border border-transparent hover:border-red-500/30 transition-all disabled:opacity-50"
                                        title="删除对局"
                                    >
                                        {deletingId === m.id ? "..." : "🗑️"}
                                    </button>
                                )}
                            </div>

                            {/* Expanded Detail */}
                            {expandedId === m.id && (
                                <div className="border-t-2 border-neutral-700 p-4 bg-neutral-900/50 space-y-6">
                                    {loadingDetail ? (
                                        <div className="text-sm text-neutral-500 text-center py-4">加载中...</div>
                                    ) : detail ? (
                                        <>
                                            {/* Screenshot Evidence Button */}
                                            {detail.screenshots.length > 0 && (
                                                <div className="flex items-center justify-between">
                                                    <button
                                                        onClick={() => setShowScreenshots(!showScreenshots)}
                                                        className="flex items-center gap-2 text-sm text-yellow-500 hover:text-yellow-400 border border-yellow-500/30 bg-yellow-500/5 px-3 py-1.5 hover:bg-yellow-500/10 transition-colors"
                                                    >
                                                        📷 查看上传截图
                                                        <span className="text-xs bg-yellow-500/20 px-1.5 py-0.5">
                                                            {detail.screenshots.length}
                                                        </span>
                                                    </button>
                                                </div>
                                            )}

                                            {/* Screenshot Gallery */}
                                            {showScreenshots && detail.screenshots.length > 0 && (
                                                <div className="space-y-3">
                                                    {/* Group by team */}
                                                    {[detail.match.team_a, detail.match.team_b].map(teamName => {
                                                        const teamShots = detail.screenshots.filter(s => s.team_name === teamName);
                                                        if (teamShots.length === 0) return null;
                                                        return (
                                                            <div key={teamName} className="space-y-2">
                                                                <h5 className="text-xs font-bold text-neutral-400 uppercase">
                                                                    {teamName} 提交的截图 ({teamShots.length}张)
                                                                </h5>
                                                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                                                                    {teamShots.map((ss, idx) => (
                                                                        <button
                                                                            key={ss.id}
                                                                            onClick={() => setLightboxIdx(
                                                                                detail.screenshots.indexOf(ss)
                                                                            )}
                                                                            className="aspect-video bg-neutral-800 border border-neutral-700 hover:border-yellow-500/50 overflow-hidden transition-colors group relative"
                                                                        >
                                                                            <img
                                                                                src={ss.image_url}
                                                                                alt={`截图 ${idx + 1}`}
                                                                                className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                                                            />
                                                                            <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-[10px] text-neutral-400 px-1 py-0.5">
                                                                                {new Date(ss.created_at).toLocaleString('zh-CN', {
                                                                                    month: '2-digit', day: '2-digit',
                                                                                    hour: '2-digit', minute: '2-digit'
                                                                                })}
                                                                            </div>
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}

                                            {renderTeamTable(
                                                detail.match.team_a,
                                                detail.team_a_stats,
                                                detail.match.team_a === baiye?.name
                                            )}
                                            <div className="border-t border-neutral-700" />
                                            {renderTeamTable(
                                                detail.match.team_b,
                                                detail.team_b_stats,
                                                detail.match.team_b === baiye?.name
                                            )}
                                        </>
                                    ) : (
                                        <div className="text-sm text-neutral-500 text-center py-4">暂无数据</div>
                                    )}
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>

            {/* Footer */}
            <div className="max-w-6xl mx-auto mt-8 text-center text-xs text-neutral-600">
                {user?.character_name && `[ ${user.character_name} ]`}
            </div>

            {/* Lightbox Modal */}
            {lightboxIdx !== null && detail && (
                <div
                    className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
                    onClick={() => setLightboxIdx(null)}
                >
                    <div className="relative max-w-5xl max-h-[90vh] w-full" onClick={e => e.stopPropagation()}>
                        {/* Close */}
                        <button
                            onClick={() => setLightboxIdx(null)}
                            className="absolute -top-10 right-0 text-white text-2xl hover:text-yellow-500 z-10"
                        >
                            ✕
                        </button>

                        {/* Image */}
                        <img
                            src={detail.screenshots[lightboxIdx]?.image_url}
                            alt="截图证据"
                            className="w-full h-full object-contain max-h-[85vh]"
                        />

                        {/* Info bar */}
                        <div className="absolute bottom-0 left-0 right-0 bg-black/70 p-3 flex items-center justify-between text-sm">
                            <span className="text-neutral-400">
                                📷 {detail.screenshots[lightboxIdx]?.team_name} ·
                                {new Date(detail.screenshots[lightboxIdx]?.created_at).toLocaleString('zh-CN')}
                            </span>
                            <span className="text-neutral-500">
                                {lightboxIdx + 1} / {detail.screenshots.length}
                            </span>
                        </div>

                        {/* Prev / Next */}
                        {lightboxIdx > 0 && (
                            <button
                                onClick={() => setLightboxIdx(lightboxIdx - 1)}
                                className="absolute left-2 top-1/2 -translate-y-1/2 text-3xl text-white/60 hover:text-white bg-black/40 w-10 h-10 flex items-center justify-center"
                            >
                                ‹
                            </button>
                        )}
                        {lightboxIdx < detail.screenshots.length - 1 && (
                            <button
                                onClick={() => setLightboxIdx(lightboxIdx + 1)}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-3xl text-white/60 hover:text-white bg-black/40 w-10 h-10 flex items-center justify-center"
                            >
                                ›
                            </button>
                        )}
                    </div>
                </div>
            )}
        </main>
    );
}

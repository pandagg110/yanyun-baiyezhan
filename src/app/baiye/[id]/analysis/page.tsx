"use client";

import { PixelButton } from "@/components/pixel/pixel-button";
import { PixelCard } from "@/components/pixel/pixel-card";
import { SupabaseService } from "@/services/supabase-service";
import { Baiye, MatchStat, User } from "@/types/app";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// ── Types ──
// Matches the SQL RPC fn_analysis_player_aggs output
interface PlayerAgg {
    player_name: string;
    matches_played: number;
    total_kills: number;
    total_assists: number;
    total_deaths: number;
    total_coins: number;
    total_building_damage: number;
    total_healing: number;
    total_damage: number;
    total_damage_taken: number;
    avg_coin_ratio: number;
    avg_building: number;
    avg_healing: number;
    kd: number;                // SQL returns 'kd' not 'kda'
}

// Matches the SQL RPC fn_analysis_match_summaries output
interface MatchSummary {
    match_id: string;
    team_a: string;
    team_b: string;
    winner: string | null;
    match_type: string;
    match_start_time: string;
    coin_value: number;
    player_count: number;
    avg_coin_ratio: number;
    avg_building: number;
    team_kd: number;
}

type SortDir = 'asc' | 'desc';
interface SortState<K extends string = string> {
    key: K;
    dir: SortDir;
}

// Sortable column definition
interface ColDef<K extends string = string> {
    key: K;
    label: string;
    sub?: string;           // sub-label
    align?: 'left' | 'center';
    color?: string;         // text color class
    nosort?: boolean;
}

// Reusable sort toggle helper
function toggleSort<K extends string>(current: SortState<K>, key: K): SortState<K> {
    if (current.key === key) return { key, dir: current.dir === 'asc' ? 'desc' : 'asc' };
    return { key, dir: 'desc' };
}

// Sort indicator component
function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
    if (!active) return <span className="text-neutral-700 ml-0.5">⇅</span>;
    return <span className="text-yellow-400 ml-0.5">{dir === 'asc' ? '▲' : '▼'}</span>;
}

// Per-match player trend data (from /api/analysis/player-trend)
interface TrendPoint {
    match_id: string;
    team_a: string;
    team_b: string;
    winner: string | null;
    match_type: string;
    match_start_time: string;
    coin_value: number;
    kills: number;
    assists: number;
    deaths: number;
    coins: number;
    damage: number;
    damage_taken: number;
    healing: number;
    building_damage: number;
    coin_ratio: number;
    kda: number;
}

// Match detail cache entry (from /api/analysis/match)
interface MatchDetailCache {
    match: {
        id: string;
        team_a: string;
        team_b: string;
        winner: string | null;
        match_type: string;
        match_start_time: string;
        coin_value: number;
    };
    stats: MatchStat[];
    loading?: boolean;
}

const PERIODS = [
    { label: "全部", value: "" },
    { label: "3个月", value: "90" },
    { label: "1个月", value: "30" },
    { label: "7天", value: "7" },
];

const MATCH_TYPES = ["全部", "排位", "正赛", "约战"];

const CHART_METRICS = [
    { key: "coin_ratio", label: "拿野", color: "#facc15" },
    { key: "building", label: "塔伤", color: "#f97316" },
    { key: "kda", label: "KD", color: "#22d3ee" },
    { key: "healing", label: "治疗", color: "#34d399" },
] as const;

// Comparison player colors — muted to not overpower the primary line
const COMPARE_COLORS = [
    "#a78bfa", // violet
    "#34d399", // emerald
    "#fb923c", // orange
    "#f472b6", // pink
    "#60a5fa", // blue
    "#fbbf24", // amber
    "#4ade80", // green
    "#e879f9", // fuchsia
];

type DetailSortKey = 'player_name' | 'coin_ratio' | 'building_damage' | 'kda' | 'kills' | 'assists' | 'deaths' | 'coins' | 'damage' | 'damage_taken' | 'healing';

const DETAIL_COLS: { key: DetailSortKey; label: string; color?: string; align?: 'left' }[] = [
    { key: 'player_name', label: '玩家', align: 'left' },
    { key: 'coin_ratio', label: '拿野', color: 'text-yellow-500/70' },
    { key: 'building_damage', label: '塔伤', color: 'text-orange-400/70' },
    { key: 'kda', label: 'KD', color: 'text-cyan-400/70' },
    { key: 'kills', label: '击败' },
    { key: 'assists', label: '助攻' },
    { key: 'deaths', label: '重伤' },
    { key: 'coins', label: '逗币' },
    { key: 'damage', label: '输出' },
    { key: 'damage_taken', label: '承伤' },
    { key: 'healing', label: '治疗' },
];

type AnalysisTab = 'players' | 'matches';

// ═══ Timeline Component ═══
function AnalysisTimeline({ matches, baiyeName, onSelect, activeId }: {
    matches: { id: string; team_a: string; team_b: string; winner: string | null; match_type?: string; match_start_time?: string }[];
    baiyeName: string;
    onSelect: (id: string) => void;
    activeId: string | null;
}) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = useState(false);
    const dragState = useRef({ startX: 0, scrollLeft: 0 });

    const sorted = useMemo(() =>
        [...matches]
            .filter(m => m.match_start_time)
            .sort((a, b) => new Date(a.match_start_time!).getTime() - new Date(b.match_start_time!).getTime()),
        [matches]
    );

    const positioned = useMemo(() => {
        if (sorted.length === 0) return [];
        const CLOSE_MS = 30 * 60 * 1000;
        const items: { match: typeof sorted[0]; dateLabel: string; level: number; isNewDate: boolean }[] = [];
        let prevTime = 0, currentLevel = 0, prevDate = '';

        for (const m of sorted) {
            const t = new Date(m.match_start_time!).getTime();
            const dl = new Date(m.match_start_time!).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
            const isNew = dl !== prevDate;
            if (isNew) currentLevel = 0;
            else if (t - prevTime < CLOSE_MS) currentLevel++;
            else currentLevel = 0;
            items.push({ match: m, dateLabel: dl, level: currentLevel, isNewDate: isNew });
            prevTime = t; prevDate = dl;
        }
        return items;
    }, [sorted]);

    const onMouseDown = useCallback((e: React.MouseEvent) => {
        setIsDragging(true);
        dragState.current = { startX: e.pageX - (scrollRef.current?.offsetLeft || 0), scrollLeft: scrollRef.current?.scrollLeft || 0 };
    }, []);
    const onMouseMove = useCallback((e: React.MouseEvent) => {
        if (!isDragging || !scrollRef.current) return;
        e.preventDefault();
        const x = e.pageX - (scrollRef.current.offsetLeft || 0);
        scrollRef.current.scrollLeft = dragState.current.scrollLeft - (x - dragState.current.startX) * 1.5;
    }, [isDragging]);
    const onMouseUp = useCallback(() => setIsDragging(false), []);

    if (positioned.length === 0) return null;

    const getOpp = (m: typeof sorted[0]) => m.team_a === baiyeName ? m.team_b : m.team_a;
    const getTime = (t?: string) => t ? new Date(t).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '';
    const getStyle = (m: typeof sorted[0]) => {
        if (!m.winner || m.winner === 'draw') return { border: 'border-neutral-600', bg: 'bg-neutral-800' };
        return m.winner === baiyeName
            ? { border: 'border-green-500/50', bg: 'bg-green-950/40' }
            : { border: 'border-red-500/40', bg: 'bg-red-950/30' };
    };
    const getBadge = (t?: string) => {
        if (t === '排位') return 'text-blue-400 bg-blue-500/15';
        if (t === '正赛') return 'text-red-400 bg-red-500/15';
        if (t === '约战') return 'text-green-400 bg-green-500/15';
        return 'text-neutral-500 bg-neutral-700/50';
    };

    return (
        <div className="mb-4">
            <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-bold text-neutral-400 uppercase tracking-wider">⏤ 时间轴</span>
                <div className="flex-1 h-px bg-neutral-700" />
                <span className="text-[10px] text-neutral-600">← 拖动 →</span>
            </div>
            <div
                ref={scrollRef}
                className="overflow-x-auto pb-2 cursor-grab active:cursor-grabbing"
                onMouseDown={onMouseDown} onMouseMove={onMouseMove}
                onMouseUp={onMouseUp} onMouseLeave={onMouseUp}
                style={{ scrollbarColor: '#525252 transparent' }}
            >
                <div className="flex items-end gap-1 min-w-max pl-2 pr-4" style={{ paddingTop: '48px' }}>
                    {positioned.map(({ match: m, dateLabel, level, isNewDate }) => {
                        const opp = getOpp(m);
                        const s = getStyle(m);
                        const won = m.winner === baiyeName;
                        const lost = m.winner && m.winner !== 'draw' && m.winner !== baiyeName;
                        return (
                            <div key={m.id} className="flex flex-col items-center" style={{ marginTop: level > 0 ? `-${level * 48}px` : '0' }}>
                                {isNewDate && <div className="text-[10px] text-neutral-500 mb-1 font-bold whitespace-nowrap">{dateLabel}</div>}
                                {!isNewDate && level === 0 && <div className="h-3" />}
                                <button
                                    onClick={() => onSelect(m.id)}
                                    className={`relative flex flex-col items-center px-2 py-1 border ${s.border} ${s.bg}
                                        transition-all duration-150 hover:scale-105 hover:z-10 min-w-[64px]
                                        ${activeId === m.id ? 'ring-1 ring-yellow-500/60 scale-105 z-10' : ''}
                                    `}
                                >
                                    <div className={`absolute -top-1.5 -right-1.5 w-3 h-3 rounded-full text-[7px] font-black flex items-center justify-center ${won ? 'bg-green-500 text-black' : lost ? 'bg-red-500 text-white' : 'bg-neutral-600 text-neutral-400'
                                        }`}>
                                        {won ? 'W' : lost ? 'L' : '?'}
                                    </div>
                                    <span className={`text-[9px] font-bold px-1 py-px mb-0.5 ${getBadge(m.match_type)}`}>
                                        {m.match_type || '排位'}
                                    </span>
                                    <span className="text-[11px] font-bold text-white whitespace-nowrap max-w-[60px] truncate" title={`vs ${opp}`}>
                                        vs {opp.length > 5 ? opp.slice(0, 5) + '..' : opp}
                                    </span>
                                    <span className="text-[9px] text-neutral-500 mt-0.5">{getTime(m.match_start_time)}</span>
                                </button>
                                {level === 0 && <div className="w-px h-2 bg-neutral-600" />}
                            </div>
                        );
                    })}
                </div>
                <div className="h-px bg-gradient-to-r from-transparent via-neutral-600 to-transparent mx-2 -mt-0.5" />
            </div>
        </div>
    );
}

function DetailTable({ teamName, stats, coinValue, sort, onSort, formatNum }: {
    teamName: string;
    stats: MatchStat[];
    coinValue: number;
    sort: SortState<DetailSortKey>;
    onSort: (key: DetailSortKey) => void;
    formatNum: (n: number) => string;
}) {
    const rows = useMemo(() => {
        const enriched = stats.map(s => {
            const cr = (s.coins || 0) / coinValue;
            const pKda = (s.kills || 0) / Math.max(s.deaths || 0, 1);
            return { s, coin_ratio: cr, kda: pKda };
        });

        enriched.sort((a, b) => {
            const { key, dir } = sort;
            let va: number | string, vb: number | string;
            if (key === 'player_name') { va = a.s.player_name; vb = b.s.player_name; }
            else if (key === 'coin_ratio') { va = a.coin_ratio; vb = b.coin_ratio; }
            else if (key === 'kda') { va = a.kda; vb = b.kda; }
            else {
                const getVal = (x: MatchStat) => {
                    switch (key) {
                        case 'building_damage': return x.building_damage || 0;
                        case 'kills': return x.kills || 0;
                        case 'assists': return x.assists || 0;
                        case 'deaths': return x.deaths || 0;
                        case 'coins': return x.coins || 0;
                        case 'damage': return x.damage || 0;
                        case 'damage_taken': return x.damage_taken || 0;
                        case 'healing': return x.healing || 0;
                        default: return 0;
                    }
                };
                va = getVal(a.s); vb = getVal(b.s);
            }
            if (typeof va === 'string' && typeof vb === 'string') return dir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
            return dir === 'asc' ? (va as number) - (vb as number) : (vb as number) - (va as number);
        });
        return enriched;
    }, [stats, coinValue, sort]);

    return (
        <div>
            <h5 className="text-xs font-bold text-neutral-400 mb-2 uppercase">
                {teamName} ({stats.length}人)
            </h5>

            {/* ── Mobile: Card List ── */}
            <div className="md:hidden space-y-2">
                {rows.map(({ s, coin_ratio, kda }) => (
                    <div key={s.id} className="bg-neutral-900/60 border border-neutral-700 px-3 py-2.5 space-y-2">
                        {/* Player name + core metrics */}
                        <div className="flex items-center justify-between">
                            <span className="text-sm font-bold text-white">{s.player_name}</span>
                            <div className="flex gap-2 text-xs">
                                <span className="text-cyan-400 font-bold">KD {kda.toFixed(2)}</span>
                                <span className="text-yellow-500 font-bold">🪙{coin_ratio.toFixed(2)}</span>
                            </div>
                        </div>
                        {/* Stats grid */}
                        <div className="grid grid-cols-4 gap-1 text-[11px]">
                            <div className="text-center">
                                <div className="text-neutral-500 mb-0.5">击/助/伤</div>
                                <div className="text-neutral-300 font-bold">{s.kills}/{s.assists}/{s.deaths}</div>
                            </div>
                            <div className="text-center">
                                <div className="text-neutral-500 mb-0.5">塔伤</div>
                                <div className="text-orange-400 font-bold">{formatNum(s.building_damage || 0)}</div>
                            </div>
                            <div className="text-center">
                                <div className="text-neutral-500 mb-0.5">治疗</div>
                                <div className="text-emerald-400 font-bold">{formatNum(s.healing || 0)}</div>
                            </div>
                            <div className="text-center">
                                <div className="text-neutral-500 mb-0.5">输出</div>
                                <div className="text-neutral-300 font-bold">{formatNum(s.damage || 0)}</div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* ── Desktop: Sortable Table ── */}
            <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-xs border-collapse min-w-[600px]">
                    <thead>
                        <tr className="border-b border-neutral-700">
                            {DETAIL_COLS.map(col => (
                                <th
                                    key={col.key}
                                    className={`${col.align === 'left' ? 'text-left' : 'text-center'} py-1 px-1 ${col.color || 'text-neutral-500'} cursor-pointer hover:text-white select-none transition-colors`}
                                    onClick={() => onSort(col.key)}
                                >
                                    {col.label}
                                    <SortIcon active={sort.key === col.key} dir={sort.dir} />
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map(({ s, coin_ratio, kda }) => (
                            <tr key={s.id} className="border-b border-neutral-800/50 hover:bg-white/5">
                                <td className="py-1.5 px-1 text-white font-bold">{s.player_name}</td>
                                <td className="py-1.5 px-1 text-center text-yellow-500">{coin_ratio.toFixed(2)}</td>
                                <td className="py-1.5 px-1 text-center text-orange-400">{formatNum(s.building_damage || 0)}</td>
                                <td className="py-1.5 px-1 text-center text-cyan-400">{kda.toFixed(2)}</td>
                                <td className="py-1.5 px-1 text-center text-neutral-400">{s.kills}</td>
                                <td className="py-1.5 px-1 text-center text-neutral-400">{s.assists}</td>
                                <td className="py-1.5 px-1 text-center text-neutral-400">{s.deaths}</td>
                                <td className="py-1.5 px-1 text-center text-neutral-400">{(s.coins || 0).toLocaleString()}</td>
                                <td className="py-1.5 px-1 text-center text-neutral-400">{formatNum(s.damage || 0)}</td>
                                <td className="py-1.5 px-1 text-center text-neutral-400">{formatNum(s.damage_taken || 0)}</td>
                                <td className="py-1.5 px-1 text-center text-neutral-400">{formatNum(s.healing || 0)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}


export default function AnalysisPage() {
    const params = useParams();
    const baiyeId = params.id as string;
    const router = useRouter();

    const [user, setUser] = useState<User | null>(null);
    const [baiye, setBaiye] = useState<Baiye | null>(null);
    const [loading, setLoading] = useState(true);

    // Filters
    const [matchType, setMatchType] = useState("全部");
    const [period, setPeriod] = useState("");

    // View tab: players vs matches
    const [viewTab, setViewTab] = useState<AnalysisTab>('players');

    // Data — now server-aggregated
    const [playerAggs, setPlayerAggs] = useState<PlayerAgg[]>([]);
    const [matchSummaries, setMatchSummaries] = useState<MatchSummary[]>([]);
    const [fetching, setFetching] = useState(false);

    // Lazy-loaded detail caches
    const [matchDetailCache, setMatchDetailCache] = useState<Map<string, MatchDetailCache>>(new Map());
    const [playerTrendCache, setPlayerTrendCache] = useState<Map<string, TrendPoint[]>>(new Map());
    const [trendLoading, setTrendLoading] = useState(false);

    // Selected player for chart view
    const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
    // Comparison players for overlay on the trend chart
    const [comparePlayers, setComparePlayers] = useState<string[]>([]);
    const [compareDropdownOpen, setCompareDropdownOpen] = useState(false);
    const [chartMetric, setChartMetric] = useState<"coin_ratio" | "building" | "kda" | "healing">("kda");

    // Expanded match in per-match section
    const [expandedMatchId, setExpandedMatchId] = useState<string | null>(null);

    // ── Sort states ──
    type PlayerSortKey = 'player_name' | 'matches_played' | 'avg_coin_ratio' | 'avg_building' | 'avg_healing' | 'kd' | 'total_kills' | 'total_assists' | 'total_deaths';
    const [playerSort, setPlayerSort] = useState<SortState<PlayerSortKey>>({ key: 'kd', dir: 'desc' });


    const [detailSort, setDetailSort] = useState<SortState<DetailSortKey>>({ key: 'kda', dir: 'desc' });

    // ── Player rename (admin only) ──
    const [renamingPlayer, setRenamingPlayer] = useState<string | null>(null);
    const [renameValue, setRenameValue] = useState('');
    const [renameLoading, setRenameLoading] = useState(false);
    const isAdmin = user?.role === 'admin';

    // ── Rename history log ──
    interface RenameLogEntry {
        id: string;
        old_name: string;
        new_name: string;
        affected_count: number;
        performed_at: string;
        is_undone: boolean;
        undone_at: string | null;
        performer?: { character_name: string } | null;
    }
    const [renameLogs, setRenameLogs] = useState<RenameLogEntry[]>([]);
    const [showRenameHistory, setShowRenameHistory] = useState(false);
    const [undoLoading, setUndoLoading] = useState(false);

    // ── Init ──
    useEffect(() => {
        const init = async () => {
            const u = await SupabaseService.getUser();
            setUser(u);
            const b = await SupabaseService.getBaiye(baiyeId);
            if (!b) { router.push("/baiye"); return; }
            setBaiye(b);
            setLoading(false);
        };
        init();
    }, [router, baiyeId]);

    // ── Fetch data when filters change ──
    const fetchData = useCallback(async () => {
        if (!baiye?.name) return;
        setFetching(true);
        // Clear caches when filters change
        setMatchDetailCache(new Map());
        setPlayerTrendCache(new Map());
        try {
            const params = new URLSearchParams({ baiye_name: baiye.name });
            if (matchType !== "全部") params.set("match_type", matchType);
            if (period) params.set("period", period);

            const res = await fetch(`/api/analysis?${params}`);
            if (!res.ok) throw new Error("Failed to fetch");
            const data = await res.json();
            setPlayerAggs(data.player_aggs || []);
            setMatchSummaries(data.match_summaries || []);
        } catch (err) {
            console.error("Analysis fetch error:", err);
        } finally {
            setFetching(false);
        }
    }, [baiye?.name, matchType, period]);

    useEffect(() => {
        if (baiye?.name) fetchData();
    }, [baiye?.name, fetchData]);

    // ── Rename player handler ──
    const fetchRenameLogs = useCallback(async () => {
        try {
            const res = await fetch('/api/analysis/rename');
            if (res.ok) {
                const data = await res.json();
                setRenameLogs(data.logs || []);
            }
        } catch (err) {
            console.error('Fetch rename logs error:', err);
        }
    }, []);

    const handleRename = useCallback(async (oldName: string, newName: string) => {
        if (!newName.trim() || newName.trim() === oldName) {
            setRenamingPlayer(null);
            return;
        }
        setRenameLoading(true);
        try {
            const { data: { session } } = await SupabaseService.getSession();
            const token = session?.access_token;
            const res = await fetch('/api/analysis/rename', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({ oldName, newName: newName.trim() }),
            });
            const data = await res.json();
            if (!res.ok) {
                alert('重命名失败: ' + (data.error || '未知错误'));
            } else {
                alert(data.message || '重命名成功');
                if (selectedPlayer === oldName) setSelectedPlayer(newName.trim());
                setComparePlayers(prev => prev.map(p => p === oldName ? newName.trim() : p));
                await fetchData();
                await fetchRenameLogs();
            }
        } catch (err) {
            console.error('Rename error:', err);
            alert('重命名失败');
        } finally {
            setRenameLoading(false);
            setRenamingPlayer(null);
        }
    }, [fetchData, fetchRenameLogs, selectedPlayer]);

    const handleUndo = useCallback(async (logId: string) => {
        if (!confirm('确认要撤销这次改名操作吗？')) return;
        setUndoLoading(true);
        try {
            const { data: { session } } = await SupabaseService.getSession();
            const token = session?.access_token;
            const res = await fetch('/api/analysis/rename', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({ logId }),
            });
            const data = await res.json();
            if (!res.ok) {
                alert('撤销失败: ' + (data.error || '未知错误'));
            } else {
                alert(data.message || '撤销成功');
                await fetchData();
                await fetchRenameLogs();
            }
        } catch (err) {
            console.error('Undo error:', err);
            alert('撤销失败');
        } finally {
            setUndoLoading(false);
        }
    }, [fetchData, fetchRenameLogs]);

    // Load rename logs when history panel is opened
    useEffect(() => {
        if (showRenameHistory && isAdmin) {
            fetchRenameLogs();
        }
    }, [showRenameHistory, isAdmin, fetchRenameLogs]);

    // Sorted player list (playerAggs now comes from server, no need to compute)
    const sortedPlayerAggs = useMemo(() => {
        const sorted = [...playerAggs];
        const { key, dir } = playerSort;
        sorted.sort((a, b) => {
            let va: number | string, vb: number | string;
            if (key === 'player_name') { va = a.player_name; vb = b.player_name; }
            else if (key === 'kd') { va = a.kd; vb = b.kd; }
            else { va = a[key as keyof PlayerAgg] as number; vb = b[key as keyof PlayerAgg] as number; }
            if (typeof va === 'string' && typeof vb === 'string') return dir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
            return dir === 'asc' ? (va as number) - (vb as number) : (vb as number) - (va as number);
        });
        return sorted;
    }, [playerAggs, playerSort]);

    // ── Lazy-load player trend data ──
    const fetchPlayerTrend = useCallback(async (playerName: string) => {
        if (!baiye?.name) return;
        // Skip if already cached
        if (playerTrendCache.has(playerName)) return;

        setTrendLoading(true);
        try {
            const params = new URLSearchParams({
                baiye_name: baiye.name,
                player_name: playerName,
            });
            if (matchType !== "全部") params.set("match_type", matchType);
            if (period) params.set("period", period);

            const res = await fetch(`/api/analysis/player-trend?${params}`);
            if (!res.ok) throw new Error("Failed to fetch trend");
            const data = await res.json();
            setPlayerTrendCache(prev => {
                const next = new Map(prev);
                next.set(playerName, data.trend || []);
                return next;
            });
        } catch (err) {
            console.error("Player trend fetch error:", err);
        } finally {
            setTrendLoading(false);
        }
    }, [baiye?.name, matchType, period, playerTrendCache]);

    // When selectedPlayer changes, fetch trend data
    useEffect(() => {
        if (selectedPlayer) {
            fetchPlayerTrend(selectedPlayer);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedPlayer]);

    // When compare players change, fetch their trends too
    useEffect(() => {
        for (const name of comparePlayers) {
            fetchPlayerTrend(name);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [comparePlayers]);

    const playerMatchData = useMemo((): TrendPoint[] => {
        if (!selectedPlayer) return [];
        return playerTrendCache.get(selectedPlayer) || [];
    }, [selectedPlayer, playerTrendCache]);

    // Build comparison player data from cache
    const comparePlayersData = useMemo(() => {
        return comparePlayers.map((name, idx) => ({
            name,
            color: COMPARE_COLORS[idx % COMPARE_COLORS.length],
            data: playerTrendCache.get(name) || [],
        }));
    }, [comparePlayers, playerTrendCache]);

    // Available players for comparison dropdown
    const availableComparePlayers = useMemo(() => {
        if (!selectedPlayer) return [];
        const excluded = new Set([selectedPlayer, ...comparePlayers]);
        return playerAggs
            .map(p => p.player_name)
            .filter(n => !excluded.has(n))
            .sort((a, b) => a.localeCompare(b));
    }, [selectedPlayer, comparePlayers, playerAggs]);

    // ── Lazy-load match details ──
    const fetchMatchDetail = useCallback(async (matchId: string) => {
        if (!matchId) return;
        // Already cached (and not loading)
        if (matchDetailCache.has(matchId) && !matchDetailCache.get(matchId)?.loading) return;

        // Mark as loading
        setMatchDetailCache(prev => {
            const next = new Map(prev);
            next.set(matchId, { match: {} as MatchDetailCache['match'], stats: [], loading: true });
            return next;
        });

        try {
            const res = await fetch(`/api/analysis/match?match_id=${matchId}`);
            if (!res.ok) throw new Error("Failed to fetch match detail");
            const data = await res.json();
            setMatchDetailCache(prev => {
                const next = new Map(prev);
                next.set(matchId, { match: data.match, stats: data.stats || [], loading: false });
                return next;
            });
        } catch (err) {
            console.error("Match detail fetch error:", err);
            setMatchDetailCache(prev => {
                const next = new Map(prev);
                next.delete(matchId);
                return next;
            });
        }
    }, [matchDetailCache]);

    // When expandedMatchId changes, fetch match details
    useEffect(() => {
        if (expandedMatchId) {
            fetchMatchDetail(expandedMatchId);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [expandedMatchId]);

    // ── Chart rendering (SVG) — with comparison support ──
    const renderChart = () => {
        if (playerMatchData.length < 2) {
            return (
                <div className="text-sm text-neutral-500 text-center py-12">
                    至少需要2场对局数据才能绘制曲线图
                </div>
            );
        }

        const getMetricValue = (d: TrendPoint) => {
            if (chartMetric === "coin_ratio") return d.coin_ratio;
            if (chartMetric === "building") return d.building_damage || 0;
            if (chartMetric === "healing") return d.healing || 0;
            return d.kda;
        };

        const primaryData = playerMatchData.map(getMetricValue);

        // Build comparison lines aligned to the same match sequence
        const primaryMatchIds = playerMatchData.map(d => d.match_id);
        const compareLines = comparePlayersData.map(cp => {
            const dataMap = new Map(cp.data.map(d => [d.match_id, d]));
            // For each primary match, find the comparison player's data
            const values = primaryMatchIds.map(mId => {
                const d = dataMap.get(mId);
                return d ? getMetricValue(d) : null;
            });
            return { name: cp.name, color: cp.color, values };
        });

        const metaInfo = CHART_METRICS.find(m => m.key === chartMetric)!;
        const W = 800, H = 320, PX = 60, PY = 30;
        const plotW = W - PX * 2, plotH = H - PY * 2 - 20;

        // Compute global min/max across primary + all comparison lines
        const allValues = [...primaryData];
        for (const cl of compareLines) {
            for (const v of cl.values) { if (v !== null) allValues.push(v); }
        }
        const maxVal = Math.max(...allValues) * 1.1 || 1;
        const minVal = Math.min(...allValues) * 0.9;
        const range = maxVal - minVal || 1;

        const toY = (v: number) => PY + plotH - ((v - minVal) / range) * plotH;
        const toX = (i: number) => PX + (i / (primaryData.length - 1)) * plotW;

        const primaryPoints = primaryData.map((v, i) => ({
            x: toX(i), y: toY(v), value: v, matchData: playerMatchData[i],
        }));

        const primaryPathD = primaryPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
        const primaryAreaD = primaryPathD + ` L ${primaryPoints[primaryPoints.length - 1].x} ${PY + plotH} L ${primaryPoints[0].x} ${PY + plotH} Z`;

        // Y-axis ticks
        const yTicks = 5;
        const yLabels = Array.from({ length: yTicks }, (_, i) => {
            const val = minVal + (range * i) / (yTicks - 1);
            return { val, y: PY + plotH - (i / (yTicks - 1)) * plotH };
        });

        const bigNumMetric = chartMetric === "building" || chartMetric === "healing";
        const fmtVal = (v: number) => bigNumMetric ? (v / 1000000).toFixed(2) + "M" : v.toFixed(2);
        const fmtAxis = (v: number) => bigNumMetric ? (v / 1000000).toFixed(1) + "M" : v.toFixed(2);

        return (
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 340 }}>
                {/* Grid lines */}
                {yLabels.map((yl, i) => (
                    <g key={i}>
                        <line x1={PX} y1={yl.y} x2={W - PX} y2={yl.y} stroke="#333" strokeWidth={0.5} />
                        <text x={PX - 8} y={yl.y + 4} fill="#666" fontSize={10} textAnchor="end">
                            {fmtAxis(yl.val)}
                        </text>
                    </g>
                ))}

                {/* ── Comparison player lines (render behind primary) ── */}
                {compareLines.map((cl, ci) => {
                    // Build path segments, skipping nulls
                    const segments: { x: number; y: number; value: number }[][] = [];
                    let current: { x: number; y: number; value: number }[] = [];
                    cl.values.forEach((v, i) => {
                        if (v !== null) {
                            current.push({ x: toX(i), y: toY(v), value: v });
                        } else if (current.length > 0) {
                            segments.push(current); current = [];
                        }
                    });
                    if (current.length > 0) segments.push(current);

                    return (
                        <g key={`cmp-${ci}`}>
                            {segments.map((seg, si) => {
                                if (seg.length < 2) {
                                    // Single point — just a dot
                                    return seg.map((pt, pi) => (
                                        <circle key={`${si}-${pi}`} cx={pt.x} cy={pt.y} r={3}
                                            fill={cl.color} fillOpacity={0.7} stroke="#111" strokeWidth={1.5} />
                                    ));
                                }
                                const segPath = seg.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
                                return (
                                    <g key={si}>
                                        <path d={segPath} fill="none" stroke={cl.color} strokeWidth={1.5}
                                            strokeLinejoin="round" strokeDasharray="6 3" opacity={0.7} />
                                        {seg.map((pt, pi) => (
                                            <circle key={pi} cx={pt.x} cy={pt.y} r={3}
                                                fill={cl.color} fillOpacity={0.7} stroke="#111" strokeWidth={1.5} />
                                        ))}
                                    </g>
                                );
                            })}
                        </g>
                    );
                })}

                {/* Primary area fill */}
                <path d={primaryAreaD} fill={metaInfo.color} fillOpacity={0.08} />

                {/* Primary line */}
                <path d={primaryPathD} fill="none" stroke={metaInfo.color} strokeWidth={2.5} strokeLinejoin="round" />

                {/* Primary points + labels */}
                {primaryPoints.map((p, i) => (
                    <g key={i}>
                        <circle cx={p.x} cy={p.y} r={4} fill={metaInfo.color} stroke="#111" strokeWidth={2} />
                        {/* Match label below */}
                        <text
                            x={p.x} y={H - 4}
                            fill="#888" fontSize={8} textAnchor="middle"
                            transform={`rotate(-20, ${p.x}, ${H - 4})`}
                        >
                            {p.matchData.team_a} vs {p.matchData.team_b}
                        </text>
                        {/* Value above */}
                        <text x={p.x} y={p.y - 10} fill={metaInfo.color} fontSize={9} textAnchor="middle" fontWeight="bold">
                            {fmtVal(p.value)}
                        </text>
                    </g>
                ))}
            </svg>
        );
    };

    const formatTime = (t?: string) => {
        if (!t) return "—";
        return new Date(t).toLocaleString("zh-CN", {
            month: "2-digit", day: "2-digit",
            hour: "2-digit", minute: "2-digit",
        });
    };

    const formatNum = (n: number) => {
        if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
        if (n >= 1000) return (n / 1000).toFixed(0) + "K";
        return n.toFixed(0);
    };

    if (loading) {
        return <div className="min-h-screen bg-neutral-900 flex items-center justify-center text-white">加载中...</div>;
    }

    return (
        <main className="min-h-screen bg-neutral-900 text-white p-4 md:p-8">
            {/* Header */}
            <header className="max-w-6xl mx-auto flex justify-between items-center mb-6 border-b-4 border-black pb-4">
                <div>
                    <button
                        onClick={() => router.push(`/baiye/${baiyeId}/hall`)}
                        className="text-xs text-neutral-500 hover:text-white mb-1"
                    >
                        ← 返回{baiye?.name}
                    </button>
                    <h1 className="text-2xl font-bold text-yellow-500 uppercase">
                        📈 对战分析
                    </h1>
                    <p className="text-xs text-neutral-500">{baiye?.name} · 数据洞察与趋势分析</p>
                </div>
                <span className="text-xs text-neutral-500 font-bold uppercase">
                    {user?.character_name && `[ ${user.character_name} ]`}
                </span>
            </header>

            <div className="max-w-6xl mx-auto space-y-6">
                {/* ═══ Filters ═══ */}
                <PixelCard className="bg-neutral-800 space-y-4">
                    <div className="flex flex-col md:flex-row gap-4">
                        {/* Match Type Filter */}
                        <div className="flex-1 space-y-2">
                            <label className="text-xs font-bold uppercase tracking-wider text-neutral-400">
                                对战类型
                            </label>
                            <div className="flex gap-1.5">
                                {MATCH_TYPES.map(t => (
                                    <button
                                        key={t}
                                        onClick={() => setMatchType(t)}
                                        className={`flex-1 py-2 text-xs font-bold border-2 transition-all ${matchType === t
                                                ? "bg-yellow-500 border-yellow-600 text-black"
                                                : "bg-neutral-700 border-neutral-600 text-neutral-400 hover:border-neutral-500"
                                            }`}
                                    >
                                        {t}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Period Filter */}
                        <div className="flex-1 space-y-2">
                            <label className="text-xs font-bold uppercase tracking-wider text-neutral-400">
                                时间范围
                            </label>
                            <div className="flex gap-1.5">
                                {PERIODS.map(p => (
                                    <button
                                        key={p.value}
                                        onClick={() => setPeriod(p.value)}
                                        className={`flex-1 py-2 text-xs font-bold border-2 transition-all ${period === p.value
                                                ? "bg-yellow-500 border-yellow-600 text-black"
                                                : "bg-neutral-700 border-neutral-600 text-neutral-400 hover:border-neutral-500"
                                            }`}
                                    >
                                        {p.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Summary stats */}
                    <div className="flex gap-4 pt-2 border-t border-neutral-700">
                        <div className="text-xs text-neutral-500">
                            共 <span className="text-white font-bold">{matchSummaries.length}</span> 场对局
                        </div>
                        <div className="text-xs text-neutral-500">
                            共 <span className="text-white font-bold">{playerAggs.length}</span> 名参战玩家
                        </div>
                    </div>
                </PixelCard>

                {fetching && (
                    <div className="flex items-center gap-3 text-sm text-yellow-500 justify-center py-8">
                        <div className="w-4 h-4 border-2 border-yellow-500 border-t-transparent animate-spin" />
                        加载分析数据中...
                    </div>
                )}

                {!fetching && matchSummaries.length === 0 && (
                    <div className="text-center py-16 text-neutral-600">
                        <div className="text-4xl mb-4">📭</div>
                        <p className="text-sm">该筛选条件下暂无对战数据</p>
                    </div>
                )}

                {/* ═══ Timeline ═══ */}
                {!fetching && matchSummaries.length > 0 && baiye && (
                    <AnalysisTimeline
                        matches={matchSummaries.map(ms => ({ id: ms.match_id, team_a: ms.team_a, team_b: ms.team_b, winner: ms.winner, match_type: ms.match_type, match_start_time: ms.match_start_time }))}
                        baiyeName={baiye.name}
                        onSelect={(id) => {
                            setViewTab('matches');
                            setExpandedMatchId(expandedMatchId === id ? null : id);
                        }}
                        activeId={expandedMatchId}
                    />
                )}

                {/* ═══ View Tab Switcher ═══ */}
                {!fetching && matchSummaries.length > 0 && (
                    <div className="flex border-2 border-neutral-700 overflow-hidden">
                        {[
                            { key: 'players' as const, label: '🏆 玩家综合数据', count: playerAggs.length },
                            { key: 'matches' as const, label: '📋 逐场分析', count: matchSummaries.length },
                        ].map(tab => (
                            <button
                                key={tab.key}
                                onClick={() => setViewTab(tab.key)}
                                className={`flex-1 py-2.5 text-xs font-bold transition-all ${viewTab === tab.key
                                        ? 'bg-yellow-500 text-black'
                                        : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-white'
                                    }`}
                            >
                                {tab.label} ({tab.count})
                            </button>
                        ))}
                    </div>
                )}

                {/* ═══ Player Summary Table ═══ */}
                {!fetching && viewTab === 'players' && sortedPlayerAggs.length > 0 && (
                    <PixelCard className="bg-neutral-800 space-y-3">
                        <h3 className="text-sm font-bold text-yellow-500 uppercase border-b-2 border-yellow-500/20 pb-2">
                            🏆 玩家综合数据
                        </h3>

                        {/* ── Mobile: Player Cards ── */}
                        <div className="md:hidden space-y-2">
                            {/* Sort bar */}
                            <div className="flex flex-wrap gap-1.5 pb-2 border-b border-neutral-700/60">
                                <span className="text-[10px] text-neutral-600 self-center pr-0.5 shrink-0">排序:</span>
                                {([
                                    { key: 'kd' as const, label: 'KD', color: 'text-cyan-400' },
                                    { key: 'avg_coin_ratio' as const, label: '拿野', color: 'text-yellow-500' },
                                    { key: 'avg_building' as const, label: '塔伤', color: 'text-orange-400' },
                                    { key: 'avg_healing' as const, label: '治疗', color: 'text-emerald-400' },
                                    { key: 'matches_played' as const, label: '场数', color: 'text-neutral-400' },
                                    { key: 'player_name' as const, label: '名字', color: 'text-neutral-400' },
                                ]).map(opt => {
                                    const isActive = playerSort.key === opt.key;
                                    return (
                                        <button
                                            key={opt.key}
                                            onClick={() => setPlayerSort(toggleSort(playerSort, opt.key))}
                                            className={`flex items-center gap-0.5 px-2.5 py-1 text-[11px] font-bold border transition-all ${
                                                isActive
                                                    ? 'bg-yellow-500/15 border-yellow-500/50 text-yellow-400'
                                                    : 'bg-neutral-800 border-neutral-700 text-neutral-500 hover:border-neutral-500 hover:text-neutral-300'
                                            }`}
                                        >
                                            <span className={isActive ? 'text-yellow-400' : opt.color}>{opt.label}</span>
                                            {isActive && (
                                                <span className="text-[9px] text-yellow-500 ml-0.5">
                                                    {playerSort.dir === 'desc' ? '↓' : '↑'}
                                                </span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                            {sortedPlayerAggs.map((p, i) => {
                                const isSelected = selectedPlayer === p.player_name;
                                const kdaColor = p.kd >= 10 ? 'text-cyan-300' : p.kd >= 5 ? 'text-cyan-400' : p.kd >= 3 ? 'text-green-400' : 'text-neutral-400';
                                const coinColor = p.avg_coin_ratio >= 1.5 ? 'text-yellow-400' : p.avg_coin_ratio >= 1.0 ? 'text-yellow-500/80' : 'text-neutral-400';
                                return (
                                    <div
                                        key={p.player_name}
                                        onClick={() => setSelectedPlayer(isSelected ? null : p.player_name)}
                                        className={`border-2 px-3 py-3 cursor-pointer transition-colors ${
                                            isSelected
                                                ? 'border-yellow-500/60 bg-yellow-500/8'
                                                : 'border-neutral-700 bg-neutral-900/40 hover:border-neutral-600'
                                        }`}
                                    >
                                        {/* Row 1: rank + name + rank indicator */}
                                        <div className="flex items-center gap-2 mb-2">
                                            <span className="text-neutral-600 text-xs w-5 shrink-0">#{i + 1}</span>
                                            <span className="font-bold text-white text-sm flex-1 min-w-0 truncate">
                                                {renamingPlayer === p.player_name ? (
                                                    <form
                                                        className="flex items-center gap-1"
                                                        onSubmit={(e) => {
                                                            e.preventDefault();
                                                            e.stopPropagation();
                                                            handleRename(p.player_name, renameValue);
                                                        }}
                                                        onClick={(e) => e.stopPropagation()}
                                                    >
                                                        <input
                                                            autoFocus
                                                            className="bg-neutral-700 border border-yellow-500/50 text-white text-xs px-1.5 py-0.5 w-28 outline-none focus:border-yellow-500"
                                                            value={renameValue}
                                                            onChange={(e) => setRenameValue(e.target.value)}
                                                            disabled={renameLoading}
                                                            onKeyDown={(e) => {
                                                                if (e.key === 'Escape') { e.stopPropagation(); setRenamingPlayer(null); }
                                                            }}
                                                        />
                                                        <button type="submit" disabled={renameLoading} className="text-green-400 text-xs px-1 disabled:opacity-50">
                                                            {renameLoading ? '...' : '✓'}
                                                        </button>
                                                        <button type="button" onClick={(e) => { e.stopPropagation(); setRenamingPlayer(null); }} className="text-red-400 text-xs px-1">
                                                            ✕
                                                        </button>
                                                    </form>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1.5">
                                                        {p.player_name}
                                                        {isAdmin && (
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); setRenamingPlayer(p.player_name); setRenameValue(p.player_name); }}
                                                                className="text-neutral-600 hover:text-yellow-500 transition-colors text-[10px]" title="修改玩家名"
                                                            >✏️</button>
                                                        )}
                                                    </span>
                                                )}
                                            </span>
                                            <div className="flex items-center gap-1.5 shrink-0">
                                                <span className="text-[10px] text-neutral-500">{p.matches_played}场</span>
                                                <span className={`text-xs ${isSelected ? 'text-yellow-500' : 'text-neutral-600'}`}>{isSelected ? '▼' : '▶'}</span>
                                            </div>
                                        </div>
                                        {/* Row 2: core 4 metrics */}
                                        <div className="grid grid-cols-4 gap-1 text-center">
                                            <div>
                                                <div className="text-[10px] text-cyan-500/70 mb-0.5">KD</div>
                                                <div className={`text-sm font-black ${kdaColor}`}>{p.kd.toFixed(2)}</div>
                                            </div>
                                            <div>
                                                <div className="text-[10px] text-yellow-500/70 mb-0.5">拿野</div>
                                                <div className={`text-sm font-black ${coinColor}`}>{p.avg_coin_ratio.toFixed(2)}</div>
                                            </div>
                                            <div>
                                                <div className="text-[10px] text-orange-400/70 mb-0.5">塔伤</div>
                                                <div className="text-sm font-black text-orange-400">{formatNum(p.avg_building)}</div>
                                            </div>
                                            <div>
                                                <div className="text-[10px] text-emerald-400/70 mb-0.5">治疗</div>
                                                <div className="text-sm font-black text-emerald-400">{formatNum(p.avg_healing)}</div>
                                            </div>
                                        </div>
                                        {/* Row 3: K/A/D */}
                                        <div className="mt-1.5 text-[11px] text-neutral-500 text-center">
                                            K/A/D: <span className="text-neutral-400">{p.total_kills}/{p.total_assists}/{p.total_deaths}</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* ── Desktop: Sortable Table ── */}
                        <div className="hidden md:block overflow-x-auto -mx-4 px-4">
                            <table className="w-full text-sm border-collapse min-w-[700px]">
                                <thead>
                                    <tr className="border-b-2 border-neutral-700">
                                        <th className="text-left py-2 px-2 text-neutral-400 text-xs">#</th>
                                        {([
                                            { key: 'player_name' as const, label: '玩家', align: 'left' as const },
                                            { key: 'matches_played' as const, label: '场数' },
                                            { key: 'avg_coin_ratio' as const, label: '拿野', sub: 'coin/价值', color: 'text-yellow-500' },
                                            { key: 'avg_building' as const, label: '平均塔伤', color: 'text-orange-400' },
                                            { key: 'avg_healing' as const, label: '平均治疗', color: 'text-emerald-400' },
                                            { key: 'kd' as const, label: 'KD', sub: 'K/D', color: 'text-cyan-400' },
                                        ]).map(col => (
                                            <th
                                                key={col.key}
                                                className={`${col.align === 'left' ? 'text-left' : 'text-center'} py-2 px-2 text-neutral-400 text-xs cursor-pointer hover:text-white select-none transition-colors`}
                                                onClick={() => setPlayerSort(toggleSort(playerSort, col.key))}
                                            >
                                                <span className={col.color || ''}>{col.label}</span>
                                                <SortIcon active={playerSort.key === col.key} dir={playerSort.dir} />
                                                {col.sub && <div className="text-[10px] text-neutral-600 font-normal">{col.sub}</div>}
                                            </th>
                                        ))}
                                        <th
                                            className="text-center py-2 px-2 text-neutral-400 text-xs cursor-pointer hover:text-white select-none transition-colors"
                                            onClick={() => setPlayerSort(toggleSort(playerSort, 'total_kills'))}
                                        >
                                            K/A/D
                                            <SortIcon active={playerSort.key === 'total_kills' || playerSort.key === 'total_assists' || playerSort.key === 'total_deaths'} dir={playerSort.dir} />
                                        </th>
                                        <th className="text-center py-2 px-2 text-neutral-400 text-xs">操作</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sortedPlayerAggs.map((p, i) => {
                                        const isSelected = selectedPlayer === p.player_name;
                                        return (
                                            <tr
                                                key={p.player_name}
                                                onClick={() => setSelectedPlayer(isSelected ? null : p.player_name)}
                                                className={`border-b border-neutral-800 cursor-pointer transition-colors ${isSelected
                                                        ? "bg-yellow-500/10 border-yellow-500/30"
                                                        : "hover:bg-neutral-750 hover:bg-white/5"
                                                    }`}
                                            >
                                                <td className="py-2.5 px-2 text-neutral-600 text-xs">
                                                    {i + 1}
                                                </td>
                                                <td className="py-2.5 px-2 text-xs font-bold" style={{ minWidth: 120 }}>
                                                    {renamingPlayer === p.player_name ? (
                                                        <form
                                                            className="flex items-center gap-1"
                                                            onSubmit={(e) => {
                                                                e.preventDefault();
                                                                e.stopPropagation();
                                                                handleRename(p.player_name, renameValue);
                                                            }}
                                                            onClick={(e) => e.stopPropagation()}
                                                        >
                                                            <input
                                                                autoFocus
                                                                className="bg-neutral-700 border border-yellow-500/50 text-white text-xs px-1.5 py-0.5 w-24 outline-none focus:border-yellow-500"
                                                                value={renameValue}
                                                                onChange={(e) => setRenameValue(e.target.value)}
                                                                disabled={renameLoading}
                                                                onKeyDown={(e) => {
                                                                    if (e.key === 'Escape') {
                                                                        e.stopPropagation();
                                                                        setRenamingPlayer(null);
                                                                    }
                                                                }}
                                                            />
                                                            <button
                                                                type="submit"
                                                                disabled={renameLoading}
                                                                className="text-green-400 hover:text-green-300 text-xs px-1 disabled:opacity-50"
                                                            >
                                                                {renameLoading ? '...' : '✓'}
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={(e) => { e.stopPropagation(); setRenamingPlayer(null); }}
                                                                className="text-red-400 hover:text-red-300 text-xs px-1"
                                                            >
                                                                ✕
                                                            </button>
                                                        </form>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1.5 text-white">
                                                            {p.player_name}
                                                            {isAdmin && (
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setRenamingPlayer(p.player_name);
                                                                        setRenameValue(p.player_name);
                                                                    }}
                                                                    className="text-neutral-600 hover:text-yellow-500 transition-colors text-[10px]"
                                                                    title="修改玩家名（修正OCR识别错误）"
                                                                >
                                                                    ✏️
                                                                </button>
                                                            )}
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="py-2.5 px-2 text-center text-xs text-neutral-300">
                                                    {p.matches_played}
                                                </td>
                                                <td className="py-2.5 px-2 text-center">
                                                    <span className={`text-xs font-bold ${p.avg_coin_ratio >= 1.5 ? "text-yellow-400" :
                                                            p.avg_coin_ratio >= 1.0 ? "text-yellow-500/70" :
                                                                "text-neutral-400"
                                                        }`}>
                                                        {p.avg_coin_ratio.toFixed(2)}
                                                    </span>
                                                </td>
                                                <td className="py-2.5 px-2 text-center">
                                                    <span className="text-xs font-bold text-orange-400">
                                                        {formatNum(p.avg_building)}
                                                    </span>
                                                </td>
                                                <td className="py-2.5 px-2 text-center">
                                                    <span className="text-xs font-bold text-emerald-400">
                                                        {formatNum(p.avg_healing)}
                                                    </span>
                                                </td>
                                                <td className="py-2.5 px-2 text-center">
                                                    <span className={`text-xs font-bold px-2 py-0.5 ${p.kd >= 10 ? "text-cyan-300 bg-cyan-500/10" :
                                                            p.kd >= 5 ? "text-cyan-400" :
                                                                p.kd >= 3 ? "text-green-400" :
                                                                    "text-neutral-400"
                                                        }`}>
                                                        {p.kd.toFixed(2)}
                                                    </span>
                                                </td>
                                                <td className="py-2.5 px-2 text-center text-xs text-neutral-500">
                                                    {p.total_kills}/{p.total_assists}/{p.total_deaths}
                                                </td>
                                                <td className="py-2.5 px-2 text-center">
                                                    <span className={`text-xs ${isSelected ? "text-yellow-500" : "text-neutral-600"}`}>
                                                        {isSelected ? "▼" : "▶"}
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </PixelCard>
                )}

                {/* ═══ Rename History Panel (admin only) ═══ */}
                {!fetching && viewTab === 'players' && isAdmin && (
                    <div className="border border-neutral-700">
                        <button
                            onClick={() => setShowRenameHistory(v => !v)}
                            className="w-full flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-neutral-400 hover:text-white hover:bg-white/5 transition-colors"
                        >
                            <span className="text-neutral-600">{showRenameHistory ? '▼' : '▶'}</span>
                            📝 改名操作日志
                            {renameLogs.length > 0 && (
                                <span className="text-[10px] text-neutral-600 ml-1">({renameLogs.length})</span>
                            )}
                        </button>
                        {showRenameHistory && (
                            <div className="border-t border-neutral-700 bg-neutral-900/50 p-4 space-y-2 max-h-64 overflow-y-auto" style={{ scrollbarColor: '#525252 transparent' }}>
                                {renameLogs.length === 0 ? (
                                    <div className="text-xs text-neutral-600 text-center py-4">暂无改名记录</div>
                                ) : (
                                    renameLogs.map((log, idx) => {
                                        // Can only undo the most recent non-undone entry
                                        const firstNonUndone = renameLogs.find(l => !l.is_undone);
                                        const canUndo = !log.is_undone && firstNonUndone?.id === log.id;
                                        const time = new Date(log.performed_at).toLocaleString('zh-CN', {
                                            month: '2-digit', day: '2-digit',
                                            hour: '2-digit', minute: '2-digit',
                                        });

                                        return (
                                            <div
                                                key={log.id}
                                                className={`flex items-center gap-3 px-3 py-2 text-xs border transition-all ${log.is_undone
                                                        ? 'border-neutral-800 bg-neutral-900/30 opacity-50'
                                                        : 'border-neutral-700 bg-neutral-800/50'
                                                    }`}
                                            >
                                                <span className="text-neutral-600 w-5 shrink-0">{idx + 1}</span>
                                                <span className="text-neutral-400 w-28 shrink-0">{time}</span>
                                                <span className="flex-1 min-w-0">
                                                    <span className="text-red-400 line-through">{log.old_name}</span>
                                                    <span className="text-neutral-600 mx-1.5">→</span>
                                                    <span className="text-green-400">{log.new_name}</span>
                                                    <span className="text-neutral-600 ml-2">({log.affected_count}条)</span>
                                                </span>
                                                {log.performer?.character_name && (
                                                    <span className="text-neutral-600 text-[10px] shrink-0">
                                                        by {log.performer.character_name}
                                                    </span>
                                                )}
                                                {log.is_undone ? (
                                                    <span className="text-neutral-600 text-[10px] shrink-0 px-1.5 py-0.5 border border-neutral-700">
                                                        已撤销
                                                    </span>
                                                ) : canUndo ? (
                                                    <button
                                                        onClick={() => handleUndo(log.id)}
                                                        disabled={undoLoading}
                                                        className="shrink-0 px-2 py-0.5 text-[10px] font-bold border border-orange-500/30 text-orange-400 bg-orange-500/10 hover:bg-orange-500/20 transition-colors disabled:opacity-50"
                                                    >
                                                        {undoLoading ? '...' : '⭯ 撤销'}
                                                    </button>
                                                ) : null}
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* ═══ Player Trend Chart — Floating Modal ═══ */}
                {selectedPlayer && (
                    <div
                        className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-8"
                        onClick={() => setSelectedPlayer(null)}
                    >
                        {/* Backdrop */}
                        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

                        {/* Modal Content */}
                        <div
                            className="relative w-full max-w-4xl max-h-[90vh] bg-neutral-800 border-2 border-cyan-500/30 shadow-[0_0_40px_rgba(34,211,238,0.15)] overflow-hidden flex flex-col"
                            onClick={e => e.stopPropagation()}
                        >
                            {/* Modal Header */}
                            <div className="flex items-center justify-between px-5 py-4 border-b-2 border-cyan-400/20 shrink-0">
                                <h3 className="text-sm font-bold text-cyan-400 uppercase">
                                    📊 {selectedPlayer} 趋势曲线
                                    {comparePlayers.length > 0 && (
                                        <span className="text-neutral-500 font-normal ml-2">vs {comparePlayers.length} 名玩家</span>
                                    )}
                                </h3>
                                <button
                                    onClick={() => { setSelectedPlayer(null); setComparePlayers([]); setCompareDropdownOpen(false); }}
                                    className="w-8 h-8 flex items-center justify-center text-neutral-400 hover:text-white hover:bg-white/10 transition-colors text-lg"
                                >
                                    ✕
                                </button>
                            </div>

                            {/* Scrollable body */}
                            <div className="overflow-y-auto flex-1 p-5 space-y-4">
                                {/* Metric switcher */}
                                <div className="flex gap-2">
                                    {CHART_METRICS.map(m => (
                                        <button
                                            key={m.key}
                                            onClick={() => setChartMetric(m.key)}
                                            className={`px-4 py-2 text-xs font-bold border-2 transition-all ${chartMetric === m.key
                                                    ? "border-current text-black"
                                                    : "bg-neutral-700 border-neutral-600 text-neutral-400 hover:border-neutral-500"
                                                }`}
                                            style={chartMetric === m.key ? { backgroundColor: m.color, borderColor: m.color } : {}}
                                        >
                                            {m.label}
                                        </button>
                                    ))}
                                </div>

                                {/* ── Add comparison players ── */}
                                <div className="flex items-center gap-2 flex-wrap">
                                    {/* Existing comparison tags */}
                                    {comparePlayers.map((cp, idx) => (
                                        <span
                                            key={cp}
                                            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold border transition-all"
                                            style={{
                                                borderColor: COMPARE_COLORS[idx % COMPARE_COLORS.length] + '60',
                                                backgroundColor: COMPARE_COLORS[idx % COMPARE_COLORS.length] + '15',
                                                color: COMPARE_COLORS[idx % COMPARE_COLORS.length],
                                            }}
                                        >
                                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: COMPARE_COLORS[idx % COMPARE_COLORS.length] }} />
                                            {cp}
                                            <button
                                                onClick={() => setComparePlayers(prev => prev.filter(p => p !== cp))}
                                                className="ml-0.5 hover:opacity-70 text-[10px]"
                                            >✕</button>
                                        </span>
                                    ))}

                                    {/* Add button with dropdown */}
                                    {availableComparePlayers.length > 0 && (
                                        <div className="relative">
                                            <button
                                                onClick={() => setCompareDropdownOpen(v => !v)}
                                                className={`px-3 py-1.5 text-xs font-bold border-2 border-dashed transition-all ${compareDropdownOpen
                                                        ? 'border-cyan-500 text-cyan-400 bg-cyan-500/10'
                                                        : 'border-neutral-600 text-neutral-400 hover:border-neutral-500 hover:text-neutral-300'
                                                    }`}
                                            >
                                                + 添加对比玩家
                                            </button>
                                            {compareDropdownOpen && (
                                                <div className="absolute top-full left-0 mt-1 z-20 bg-neutral-800 border border-neutral-600 shadow-xl max-h-48 overflow-y-auto min-w-[160px]" style={{ scrollbarColor: '#525252 transparent' }}>
                                                    {availableComparePlayers.map(name => (
                                                        <button
                                                            key={name}
                                                            onClick={() => {
                                                                setComparePlayers(prev => [...prev, name]);
                                                                setCompareDropdownOpen(false);
                                                            }}
                                                            className="w-full text-left px-3 py-2 text-xs text-neutral-300 hover:bg-white/10 hover:text-white transition-colors"
                                                        >
                                                            {name}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {comparePlayers.length > 0 && (
                                        <button
                                            onClick={() => setComparePlayers([])}
                                            className="px-2 py-1 text-[10px] text-neutral-500 hover:text-red-400 transition-colors"
                                        >
                                            清空对比
                                        </button>
                                    )}
                                </div>

                                {/* Legend */}
                                {comparePlayers.length > 0 && (
                                    <div className="flex items-center gap-3 text-[10px] text-neutral-500 pt-1">
                                        <span className="flex items-center gap-1">
                                            <span className="w-4 h-0.5 inline-block" style={{ backgroundColor: CHART_METRICS.find(m => m.key === chartMetric)?.color }} />
                                            {selectedPlayer} (主线)
                                        </span>
                                        {comparePlayers.map((cp, idx) => (
                                            <span key={cp} className="flex items-center gap-1">
                                                <span className="w-4 h-0.5 inline-block border-b border-dashed" style={{ borderColor: COMPARE_COLORS[idx % COMPARE_COLORS.length] }} />
                                                {cp}
                                            </span>
                                        ))}
                                    </div>
                                )}

                                {/* SVG Chart */}
                                <div className="bg-neutral-900/50 border border-neutral-700 p-4 rounded">
                                    {renderChart()}
                                </div>

                                {/* Player match detail list */}
                                <div className="space-y-1">
                                    <h4 className="text-xs font-bold text-neutral-400 uppercase pt-2">
                                        逐场数据 ({playerMatchData.length} 场)
                                    </h4>
                                    {playerMatchData.map((d, i) => {
                                        // Find comparison players' data for this match
                                        const cpDataForMatch = comparePlayersData.map(cp => {
                                            const found = cp.data.find(cd => cd.match_id === d.match_id);
                                            return found ? { name: cp.name, color: cp.color, data: found } : null;
                                        }).filter(Boolean) as { name: string; color: string; data: TrendPoint }[];

                                        return (
                                            <div key={i} className="border border-neutral-800 hover:border-neutral-700 transition-colors">
                                                {/* Primary player row */}
                                                <div className="flex items-center gap-3 py-2 px-3 bg-neutral-900/30 text-xs">
                                                    <span className="text-neutral-600 w-5">{i + 1}</span>
                                                    <span className="text-neutral-400 w-24 shrink-0">{formatTime(d.match_start_time)}</span>
                                                    <span className="text-white font-bold flex-1 min-w-0 truncate">
                                                        {d.team_a} <span className="text-neutral-600">vs</span> {d.team_b}
                                                    </span>
                                                    <div className="flex gap-4 shrink-0">
                                                        <span className="text-yellow-500" title="拿野">🪙 {d.coin_ratio.toFixed(2)}</span>
                                                        <span className="text-orange-400" title="塔伤">🏛 {formatNum(d.building_damage || 0)}</span>
                                                        <span className="text-emerald-400" title="治疗">💊 {formatNum(d.healing || 0)}</span>
                                                        <span className="text-cyan-400" title="KD">⚔ {d.kda.toFixed(2)}</span>
                                                    </div>
                                                    <span className="text-neutral-600 w-20 text-right shrink-0">
                                                        {d.kills}/{d.assists}/{d.deaths}
                                                    </span>
                                                </div>
                                                {/* Comparison player rows for same match */}
                                                {cpDataForMatch.map(cp => (
                                                    <div key={cp.name} className="flex items-center gap-3 py-1.5 px-3 text-xs border-t border-neutral-800/50"
                                                        style={{ backgroundColor: cp.color + '08' }}
                                                    >
                                                        <span className="w-5" />
                                                        <span className="w-24 shrink-0 flex items-center gap-1">
                                                            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: cp.color }} />
                                                            <span className="truncate" style={{ color: cp.color }}>{cp.name}</span>
                                                        </span>
                                                        <span className="flex-1" />
                                                        <div className="flex gap-4 shrink-0">
                                                            <span style={{ color: cp.color + 'cc' }} title="拿野">🪙 {cp.data.coin_ratio.toFixed(2)}</span>
                                                            <span style={{ color: cp.color + 'cc' }} title="塔伤">🏛 {formatNum(cp.data.building_damage || 0)}</span>
                                                            <span style={{ color: cp.color + 'cc' }} title="治疗">💊 {formatNum(cp.data.healing || 0)}</span>
                                                            <span style={{ color: cp.color + 'cc' }} title="KD">⚔ {cp.data.kda.toFixed(2)}</span>
                                                        </div>
                                                        <span style={{ color: cp.color + '99' }} className="w-20 text-right shrink-0">
                                                            {cp.data.kills}/{cp.data.assists}/{cp.data.deaths}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* ═══ Per-Match Breakdown ═══ */}
                {!fetching && viewTab === 'matches' && matchSummaries.length > 0 && (
                    <PixelCard className="bg-neutral-800 space-y-3">
                        <h3 className="text-sm font-bold text-yellow-500 uppercase border-b-2 border-yellow-500/20 pb-2">
                            📋 逐场分析 ({matchSummaries.length} 场)
                        </h3>

                        <div className="space-y-1">
                            {matchSummaries.map((ms) => {
                                const isExpanded = expandedMatchId === ms.match_id;
                                const typeBadge = ms.match_type === "排位" ? "text-blue-400 border-blue-500/30 bg-blue-500/10" :
                                    ms.match_type === "正赛" ? "text-red-400 border-red-500/30 bg-red-500/10" :
                                        "text-green-400 border-green-500/30 bg-green-500/10";
                                const detail = matchDetailCache.get(ms.match_id);

                                return (
                                    <div key={ms.match_id} className="border border-neutral-700 overflow-hidden">
                                        {/* Match row header */}
                                        <button
                                            onClick={() => setExpandedMatchId(isExpanded ? null : ms.match_id)}
                                            className="w-full flex items-center gap-2 md:gap-3 px-3 md:px-4 py-3 text-left hover:bg-white/5 transition-colors"
                                        >
                                            <span className="text-neutral-600 text-xs shrink-0">{isExpanded ? '▼' : '▶'}</span>

                                            {/* Mobile layout: stacked */}
                                            <div className="flex-1 min-w-0 md:contents">
                                                {/* Time + type badge — stacked on mobile, inline on desktop */}
                                                <div className="flex items-center gap-2 mb-1 md:mb-0 md:contents">
                                                    <span className="text-[11px] text-neutral-400 shrink-0 md:w-24">
                                                        {formatTime(ms.match_start_time)}
                                                    </span>
                                                    <span className={`px-1.5 py-0.5 text-[10px] font-bold border shrink-0 ${typeBadge}`}>
                                                        {ms.match_type || '排位'}
                                                    </span>
                                                </div>
                                                {/* Teams */}
                                                <div className="flex items-center gap-2 justify-between md:contents">
                                                    <span className="text-white text-xs font-bold min-w-0 truncate md:flex-1">
                                                        {ms.team_a} <span className="text-neutral-600">vs</span> {ms.team_b}
                                                    </span>
                                                    {/* Mobile: winner + stats combined */}
                                                    <div className="flex items-center gap-2 shrink-0 md:hidden">
                                                        {ms.winner && ms.winner !== 'draw' && (
                                                            <span className="text-[10px] text-green-400 bg-green-500/10 border border-green-500/20 px-1.5 py-0.5">
                                                                🏆 {ms.winner.length > 4 ? ms.winner.slice(0, 4) + '..' : ms.winner}
                                                            </span>
                                                        )}
                                                        <span className="text-neutral-500 text-[11px]">{ms.player_count}人</span>
                                                    </div>
                                                </div>
                                                {/* Mobile: agg stats row */}
                                                <div className="flex gap-3 mt-1 text-[11px] md:hidden">
                                                    <span className="text-yellow-500">🪙{ms.avg_coin_ratio.toFixed(2)}</span>
                                                    <span className="text-orange-400">🏛{formatNum(ms.avg_building)}</span>
                                                    <span className="text-cyan-400">⚔{ms.team_kd.toFixed(2)}</span>
                                                </div>
                                            </div>

                                            {/* Desktop-only: winner, agg stats, player count */}
                                            {ms.winner && ms.winner !== 'draw' && (
                                                <span className="hidden md:inline text-[10px] text-green-400 bg-green-500/10 border border-green-500/20 px-1.5 py-0.5 shrink-0">
                                                    🏆 {ms.winner}
                                                </span>
                                            )}
                                            <div className="hidden md:flex gap-3 shrink-0 text-xs">
                                                <span className="text-yellow-500">🪙 {ms.avg_coin_ratio.toFixed(2)}</span>
                                                <span className="text-orange-400">🏛 {formatNum(ms.avg_building)}</span>
                                                <span className="text-cyan-400">⚔ {ms.team_kd.toFixed(2)}</span>
                                            </div>
                                            <span className="hidden md:inline text-neutral-600 text-xs w-10 text-right shrink-0">
                                                {ms.player_count}人
                                            </span>
                                        </button>


                                        {/* Expanded detail (lazy-loaded) */}
                                        {isExpanded && (
                                            <div className="border-t border-neutral-700 bg-neutral-900/50 px-4 py-3 space-y-4">
                                                {detail?.loading ? (
                                                    <div className="flex items-center gap-2 text-xs text-neutral-500 py-4 justify-center">
                                                        <div className="w-3 h-3 border border-neutral-500 border-t-transparent animate-spin" />
                                                        加载对局详情...
                                                    </div>
                                                ) : detail?.stats && detail.stats.length > 0 ? (
                                                    [ms.team_a, ms.team_b].map(teamName => {
                                                        const tStats = detail.stats.filter(s => s.team_name === teamName);
                                                        if (tStats.length === 0) return null;
                                                        return (
                                                            <DetailTable
                                                                key={teamName}
                                                                teamName={teamName}
                                                                stats={tStats}
                                                                coinValue={detail.match?.coin_value || ms.coin_value || 720}
                                                                sort={detailSort}
                                                                onSort={(k) => setDetailSort(toggleSort(detailSort, k))}
                                                                formatNum={formatNum}
                                                            />
                                                        );
                                                    })
                                                ) : (
                                                    <div className="text-xs text-neutral-600 text-center py-4">暂无详细数据</div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </PixelCard>
                )}
            </div>

            {/* Footer */}
            <div className="max-w-6xl mx-auto mt-8 text-center text-xs text-neutral-600">
                {user?.character_name && `[ ${user.character_name} ]`}
            </div>
        </main>
    );
}

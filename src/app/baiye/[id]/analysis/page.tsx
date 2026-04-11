"use client";

import { PixelButton } from "@/components/pixel/pixel-button";
import { PixelCard } from "@/components/pixel/pixel-card";
import { SupabaseService } from "@/services/supabase-service";
import { Baiye, Match, MatchStat, User } from "@/types/app";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// ── Types ──
interface PlayerAgg {
    player_name: string;
    matches_played: number;
    total_kills: number;
    total_assists: number;
    total_deaths: number;
    total_coins: number;
    total_coin_value: number;
    total_building_damage: number;
    avg_coin_ratio: number;    // avg(coins / coin_value)
    avg_building: number;      // avg building_damage
    kda: number;               // kills / max(deaths, 1)
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

interface MatchWithTeam extends Match {
    coin_value: number;
}

interface PerMatchPlayer {
    match: MatchWithTeam;
    stat: MatchStat;
    coin_ratio: number;
    kda: number;
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
] as const;

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
                                    <div className={`absolute -top-1.5 -right-1.5 w-3 h-3 rounded-full text-[7px] font-black flex items-center justify-center ${
                                        won ? 'bg-green-500 text-black' : lost ? 'bg-red-500 text-white' : 'bg-neutral-600 text-neutral-400'
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
    // Compute derived values & sort
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
                    switch(key) {
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
            <div className="overflow-x-auto">
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
    const [period, setPeriod] = useState("7");

    // View tab: players vs matches
    const [viewTab, setViewTab] = useState<AnalysisTab>('players');

    // Data
    const [matches, setMatches] = useState<MatchWithTeam[]>([]);
    const [stats, setStats] = useState<MatchStat[]>([]);
    const [fetching, setFetching] = useState(false);

    // Selected player for chart view
    const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
    const [chartMetric, setChartMetric] = useState<"coin_ratio" | "building" | "kda">("kda");

    // Expanded match in per-match section
    const [expandedMatchId, setExpandedMatchId] = useState<string | null>(null);

    // ── Sort states ──
    type PlayerSortKey = 'player_name' | 'matches_played' | 'avg_coin_ratio' | 'avg_building' | 'kda' | 'total_kills' | 'total_assists' | 'total_deaths';
    const [playerSort, setPlayerSort] = useState<SortState<PlayerSortKey>>({ key: 'kda', dir: 'desc' });


    const [detailSort, setDetailSort] = useState<SortState<DetailSortKey>>({ key: 'kda', dir: 'desc' });

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
        try {
            const params = new URLSearchParams({ baiye_name: baiye.name });
            if (matchType !== "全部") params.set("match_type", matchType);
            if (period) params.set("period", period);

            const res = await fetch(`/api/analysis?${params}`);
            if (!res.ok) throw new Error("Failed to fetch");
            const data = await res.json();
            setMatches(data.matches || []);
            setStats(data.stats || []);
        } catch (err) {
            console.error("Analysis fetch error:", err);
        } finally {
            setFetching(false);
        }
    }, [baiye?.name, matchType, period]);

    useEffect(() => {
        if (baiye?.name) fetchData();
    }, [baiye?.name, fetchData]);

    // ── Compute player aggregations ──
    const playerAggs = useMemo(() => {
        if (stats.length === 0 || matches.length === 0) return [];

        const matchMap = new Map(matches.map(m => [m.id, m]));
        const playerMap = new Map<string, {
            matches: Set<string>;
            kills: number; assists: number; deaths: number;
            coins: number; coinValues: number;
            building: number;
            coinRatios: number[];
        }>();

        for (const s of stats) {
            const m = matchMap.get(s.match_id);
            if (!m) continue;
            // Only count our baiye's players, skip enemy team
            if (s.team_name !== baiye?.name) continue;
            const coinValue = m.coin_value || 660;

            if (!playerMap.has(s.player_name)) {
                playerMap.set(s.player_name, {
                    matches: new Set(), kills: 0, assists: 0, deaths: 0,
                    coins: 0, coinValues: 0, building: 0, coinRatios: [],
                });
            }
            const p = playerMap.get(s.player_name)!;
            p.matches.add(s.match_id);
            p.kills += s.kills || 0;
            p.assists += s.assists || 0;
            p.deaths += s.deaths || 0;
            p.coins += s.coins || 0;
            p.coinValues += coinValue;
            p.building += s.building_damage || 0;
            p.coinRatios.push((s.coins || 0) / coinValue);
        }

        const result: PlayerAgg[] = [];
        for (const [name, p] of playerMap) {
            const n = p.matches.size;
            result.push({
                player_name: name,
                matches_played: n,
                total_kills: p.kills,
                total_assists: p.assists,
                total_deaths: p.deaths,
                total_coins: p.coins,
                total_coin_value: p.coinValues,
                total_building_damage: p.building,
                avg_coin_ratio: p.coinRatios.reduce((a, b) => a + b, 0) / n,
                avg_building: p.building / n,
                kda: p.kills / Math.max(p.deaths, 1),
            });
        }
        return result;
    }, [stats, matches, baiye?.name]);

    // Sorted player list
    const sortedPlayerAggs = useMemo(() => {
        const sorted = [...playerAggs];
        const { key, dir } = playerSort;
        sorted.sort((a, b) => {
            let va: number | string, vb: number | string;
            if (key === 'player_name') { va = a.player_name; vb = b.player_name; }
            else { va = a[key] as number; vb = b[key] as number; }
            if (typeof va === 'string' && typeof vb === 'string') return dir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
            return dir === 'asc' ? (va as number) - (vb as number) : (vb as number) - (va as number);
        });
        return sorted;
    }, [playerAggs, playerSort]);

    // ── Per-player match data (for charts + list) ──
    const playerMatchData = useMemo((): PerMatchPlayer[] => {
        if (!selectedPlayer) return [];
        const matchMap = new Map(matches.map(m => [m.id, m]));

        return stats
            .filter(s => s.player_name === selectedPlayer && s.team_name === baiye?.name)
            .map(s => {
                const m = matchMap.get(s.match_id);
                if (!m) return null;
                const cv = m.coin_value || 660;
                return {
                    match: m,
                    stat: s,
                    coin_ratio: (s.coins || 0) / cv,
                    kda: (s.kills || 0) / Math.max(s.deaths || 0, 1),
                } as PerMatchPlayer;
            })
            .filter(Boolean)
            .sort((a, b) => new Date(a!.match.match_start_time!).getTime() - new Date(b!.match.match_start_time!).getTime()) as PerMatchPlayer[];
    }, [selectedPlayer, stats, matches, baiye?.name]);

    // ── Per-match aggregation (for bottom section) ──
    const matchAggs = useMemo(() => {
        const matchMap = new Map(matches.map(m => [m.id, m]));
        // Group ALL stats for detail tables (both teams)
        const allGrouped = new Map<string, MatchStat[]>();
        for (const s of stats) {
            if (!allGrouped.has(s.match_id)) allGrouped.set(s.match_id, []);
            allGrouped.get(s.match_id)!.push(s);
        }

        return matches.map(m => {
            const allStats = allGrouped.get(m.id) || [];
            // Only our team for metric aggregations
            const ourStats = allStats.filter(s => s.team_name === baiye?.name);
            const n = ourStats.length || 1;
            const totalKills = ourStats.reduce((a, s) => a + (s.kills || 0), 0);
            const totalAssists = ourStats.reduce((a, s) => a + (s.assists || 0), 0);
            const totalDeaths = ourStats.reduce((a, s) => a + (s.deaths || 0), 0);
            const totalCoins = ourStats.reduce((a, s) => a + (s.coins || 0), 0);
            const totalBuilding = ourStats.reduce((a, s) => a + (s.building_damage || 0), 0);
            const cv = m.coin_value || 660;

            return {
                match: m,
                stats: ourStats,
                player_count: ourStats.length,
                avg_coin_ratio: totalCoins / n / cv,
                avg_building: totalBuilding / n,
                kda: totalKills / Math.max(totalDeaths, 1),
                team_a_stats: allStats.filter(s => s.team_name === m.team_a),
                team_b_stats: allStats.filter(s => s.team_name === m.team_b),
            };
        });
    }, [matches, stats, baiye?.name]);

    // ── Chart rendering (SVG) ──
    const renderChart = () => {
        if (playerMatchData.length < 2) {
            return (
                <div className="text-sm text-neutral-500 text-center py-12">
                    至少需要2场对局数据才能绘制曲线图
                </div>
            );
        }

        const data = playerMatchData.map(d => {
            if (chartMetric === "coin_ratio") return d.coin_ratio;
            if (chartMetric === "building") return d.stat.building_damage || 0;
            return d.kda;
        });

        const metaInfo = CHART_METRICS.find(m => m.key === chartMetric)!;
        const W = 800, H = 280, PX = 60, PY = 30;
        const plotW = W - PX * 2, plotH = H - PY * 2;

        const maxVal = Math.max(...data) * 1.1 || 1;
        const minVal = Math.min(...data) * 0.9;
        const range = maxVal - minVal || 1;

        const points = data.map((v, i) => ({
            x: PX + (i / (data.length - 1)) * plotW,
            y: PY + plotH - ((v - minVal) / range) * plotH,
            value: v,
            match: playerMatchData[i].match,
        }));

        const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
        const areaD = pathD + ` L ${points[points.length - 1].x} ${PY + plotH} L ${points[0].x} ${PY + plotH} Z`;

        // Y-axis ticks
        const yTicks = 5;
        const yLabels = Array.from({ length: yTicks }, (_, i) => {
            const val = minVal + (range * i) / (yTicks - 1);
            return { val, y: PY + plotH - (i / (yTicks - 1)) * plotH };
        });

        return (
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 300 }}>
                {/* Grid lines */}
                {yLabels.map((yl, i) => (
                    <g key={i}>
                        <line x1={PX} y1={yl.y} x2={W - PX} y2={yl.y} stroke="#333" strokeWidth={0.5} />
                        <text x={PX - 8} y={yl.y + 4} fill="#666" fontSize={10} textAnchor="end">
                            {chartMetric === "building" ? (yl.val / 1000000).toFixed(1) + "M" : yl.val.toFixed(2)}
                        </text>
                    </g>
                ))}

                {/* Area fill */}
                <path d={areaD} fill={metaInfo.color} fillOpacity={0.08} />

                {/* Line */}
                <path d={pathD} fill="none" stroke={metaInfo.color} strokeWidth={2.5} strokeLinejoin="round" />

                {/* Points + labels */}
                {points.map((p, i) => (
                    <g key={i}>
                        <circle cx={p.x} cy={p.y} r={4} fill={metaInfo.color} stroke="#111" strokeWidth={2} />
                        {/* Match label below */}
                        <text
                            x={p.x} y={H - 4}
                            fill="#888" fontSize={8} textAnchor="middle"
                            transform={`rotate(-20, ${p.x}, ${H - 4})`}
                        >
                            {p.match.team_a} vs {p.match.team_b}
                        </text>
                        {/* Value above */}
                        <text x={p.x} y={p.y - 10} fill={metaInfo.color} fontSize={9} textAnchor="middle" fontWeight="bold">
                            {chartMetric === "building" ? (p.value / 1000000).toFixed(2) + "M" : p.value.toFixed(2)}
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
                                        className={`flex-1 py-2 text-xs font-bold border-2 transition-all ${
                                            matchType === t
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
                                        className={`flex-1 py-2 text-xs font-bold border-2 transition-all ${
                                            period === p.value
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
                            共 <span className="text-white font-bold">{matches.length}</span> 场对局
                        </div>
                        <div className="text-xs text-neutral-500">
                            共 <span className="text-white font-bold">{playerAggs.length}</span> 名参战玩家
                        </div>
                        <div className="text-xs text-neutral-500">
                            共 <span className="text-white font-bold">{stats.length}</span> 条数据记录
                        </div>
                    </div>
                </PixelCard>

                {fetching && (
                    <div className="flex items-center gap-3 text-sm text-yellow-500 justify-center py-8">
                        <div className="w-4 h-4 border-2 border-yellow-500 border-t-transparent animate-spin" />
                        加载分析数据中...
                    </div>
                )}

                {!fetching && matches.length === 0 && (
                    <div className="text-center py-16 text-neutral-600">
                        <div className="text-4xl mb-4">📭</div>
                        <p className="text-sm">该筛选条件下暂无对战数据</p>
                    </div>
                )}

                {/* ═══ Timeline ═══ */}
                {!fetching && matches.length > 0 && baiye && (
                    <AnalysisTimeline
                        matches={matches}
                        baiyeName={baiye.name}
                        onSelect={(id) => {
                            setViewTab('matches');
                            setExpandedMatchId(expandedMatchId === id ? null : id);
                        }}
                        activeId={expandedMatchId}
                    />
                )}

                {/* ═══ View Tab Switcher ═══ */}
                {!fetching && matches.length > 0 && (
                    <div className="flex border-2 border-neutral-700 overflow-hidden">
                        {[
                            { key: 'players' as const, label: '🏆 玩家综合数据', count: playerAggs.length },
                            { key: 'matches' as const, label: '📋 逐场分析', count: matchAggs.length },
                        ].map(tab => (
                            <button
                                key={tab.key}
                                onClick={() => setViewTab(tab.key)}
                                className={`flex-1 py-2.5 text-xs font-bold transition-all ${
                                    viewTab === tab.key
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
                        <div className="overflow-x-auto -mx-4 px-4">
                            <table className="w-full text-sm border-collapse min-w-[700px]">
                                <thead>
                                    <tr className="border-b-2 border-neutral-700">
                                        <th className="text-left py-2 px-2 text-neutral-400 text-xs">#</th>
                                        {([
                                            { key: 'player_name' as const, label: '玩家', align: 'left' as const },
                                            { key: 'matches_played' as const, label: '场数' },
                                            { key: 'avg_coin_ratio' as const, label: '拿野', sub: 'coin/价值', color: 'text-yellow-500' },
                                            { key: 'avg_building' as const, label: '平均塔伤', color: 'text-orange-400' },
                                            { key: 'kda' as const, label: 'KD', sub: 'K/D', color: 'text-cyan-400' },
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
                                                className={`border-b border-neutral-800 cursor-pointer transition-colors ${
                                                    isSelected
                                                        ? "bg-yellow-500/10 border-yellow-500/30"
                                                        : "hover:bg-neutral-750 hover:bg-white/5"
                                                }`}
                                            >
                                                <td className="py-2.5 px-2 text-neutral-600 text-xs">
                                                    {i + 1}
                                                </td>
                                                <td className="py-2.5 px-2 text-white text-xs font-bold">
                                                    {p.player_name}
                                                </td>
                                                <td className="py-2.5 px-2 text-center text-xs text-neutral-300">
                                                    {p.matches_played}
                                                </td>
                                                <td className="py-2.5 px-2 text-center">
                                                    <span className={`text-xs font-bold ${
                                                        p.avg_coin_ratio >= 1.5 ? "text-yellow-400" :
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
                                                    <span className={`text-xs font-bold px-2 py-0.5 ${
                                                        p.kda >= 10 ? "text-cyan-300 bg-cyan-500/10" :
                                                        p.kda >= 5 ? "text-cyan-400" :
                                                        p.kda >= 3 ? "text-green-400" :
                                                        "text-neutral-400"
                                                    }`}>
                                                        {p.kda.toFixed(2)}
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
                                </h3>
                                <button
                                    onClick={() => setSelectedPlayer(null)}
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
                                            className={`px-4 py-2 text-xs font-bold border-2 transition-all ${
                                                chartMetric === m.key
                                                    ? "border-current text-black"
                                                    : "bg-neutral-700 border-neutral-600 text-neutral-400 hover:border-neutral-500"
                                            }`}
                                            style={chartMetric === m.key ? { backgroundColor: m.color, borderColor: m.color } : {}}
                                        >
                                            {m.label}
                                        </button>
                                    ))}
                                </div>

                                {/* SVG Chart */}
                                <div className="bg-neutral-900/50 border border-neutral-700 p-4 rounded">
                                    {renderChart()}
                                </div>

                                {/* Player match detail list */}
                                <div className="space-y-1">
                                    <h4 className="text-xs font-bold text-neutral-400 uppercase pt-2">
                                        逐场数据 ({playerMatchData.length} 场)
                                    </h4>
                                    {playerMatchData.map((d, i) => (
                                        <div key={i} className="flex items-center gap-3 py-2 px-3 bg-neutral-900/30 border border-neutral-800 text-xs hover:border-neutral-700 transition-colors">
                                            <span className="text-neutral-600 w-5">{i + 1}</span>
                                            <span className="text-neutral-400 w-24 shrink-0">{formatTime(d.match.match_start_time)}</span>
                                            <span className="text-white font-bold flex-1 min-w-0 truncate">
                                                {d.match.team_a} <span className="text-neutral-600">vs</span> {d.match.team_b}
                                            </span>
                                            <div className="flex gap-4 shrink-0">
                                                <span className="text-yellow-500" title="拿野">🐉 {d.coin_ratio.toFixed(2)}</span>
                                                <span className="text-orange-400" title="塔伤">🏛 {formatNum(d.stat.building_damage || 0)}</span>
                                                <span className="text-cyan-400" title="KDA">⚔ {d.kda.toFixed(2)}</span>
                                            </div>
                                            <span className="text-neutral-600 w-20 text-right shrink-0">
                                                {d.stat.kills}/{d.stat.assists}/{d.stat.deaths}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* ═══ Per-Match Breakdown ═══ */}
                {!fetching && viewTab === 'matches' && matchAggs.length > 0 && (
                    <PixelCard className="bg-neutral-800 space-y-3">
                        <h3 className="text-sm font-bold text-yellow-500 uppercase border-b-2 border-yellow-500/20 pb-2">
                            📋 逐场分析 ({matchAggs.length} 场)
                        </h3>

                        <div className="space-y-1">
                            {matchAggs.map(({ match, avg_coin_ratio, avg_building, kda, player_count, team_a_stats, team_b_stats }) => {
                                const isExpanded = expandedMatchId === match.id;
                                const typeBadge = match.match_type === "排位" ? "text-blue-400 border-blue-500/30 bg-blue-500/10" :
                                    match.match_type === "正赛" ? "text-red-400 border-red-500/30 bg-red-500/10" :
                                    "text-green-400 border-green-500/30 bg-green-500/10";

                                return (
                                    <div key={match.id} className="border border-neutral-700 overflow-hidden">
                                        {/* Match row header */}
                                        <button
                                            onClick={() => setExpandedMatchId(isExpanded ? null : match.id)}
                                            className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/5 transition-colors"
                                        >
                                            <span className="text-neutral-600 text-xs">{isExpanded ? "▼" : "▶"}</span>
                                            <span className="text-xs text-neutral-400 w-24 shrink-0">
                                                {formatTime(match.match_start_time)}
                                            </span>
                                            <span className={`px-1.5 py-0.5 text-[10px] font-bold border ${typeBadge}`}>
                                                {match.match_type || "排位"}
                                            </span>
                                            <span className="text-white text-xs font-bold flex-1 min-w-0 truncate">
                                                {match.team_a} <span className="text-neutral-600">vs</span> {match.team_b}
                                            </span>

                                            {/* Winner */}
                                            {match.winner && match.winner !== "draw" && (
                                                <span className="text-[10px] text-green-400 bg-green-500/10 border border-green-500/20 px-1.5 py-0.5 shrink-0">
                                                    🏆 {match.winner}
                                                </span>
                                            )}

                                            {/* Agg stats */}
                                            <div className="flex gap-3 shrink-0 text-xs">
                                                <span className="text-yellow-500">🐉 {avg_coin_ratio.toFixed(2)}</span>
                                                <span className="text-orange-400">🏛 {formatNum(avg_building)}</span>
                                                <span className="text-cyan-400">⚔ {kda.toFixed(2)}</span>
                                            </div>
                                            <span className="text-neutral-600 text-xs w-10 text-right shrink-0">
                                                {player_count}人
                                            </span>
                                        </button>

                                        {/* Expanded detail */}
                                        {isExpanded && (
                                            <div className="border-t border-neutral-700 bg-neutral-900/50 px-4 py-3 space-y-4">
                                                {[
                                                    { name: match.team_a, stats: team_a_stats },
                                                    { name: match.team_b, stats: team_b_stats },
                                                ].map(({ name, stats: tStats }) => {
                                                    if (tStats.length === 0) return null;
                                                    return (
                                                        <DetailTable
                                                            key={name}
                                                            teamName={name}
                                                            stats={tStats}
                                                            coinValue={match.coin_value || 660}
                                                            sort={detailSort}
                                                            onSort={(k) => setDetailSort(toggleSort(detailSort, k))}
                                                            formatNum={formatNum}
                                                        />
                                                    );
                                                })}
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

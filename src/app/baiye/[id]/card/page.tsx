"use client";

import { PixelButton } from "@/components/pixel/pixel-button";
import { PixelCard } from "@/components/pixel/pixel-card";
import { SupabaseService } from "@/services/supabase-service";
import { Baiye, Match, MatchStat, User } from "@/types/app";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import domtoimage from 'dom-to-image-more';

// ─── Types ───
interface PlayerAgg {
    player_name: string;
    matches_played: number;
    total_kills: number;
    total_assists: number;
    total_deaths: number;
    total_coins: number;
    total_coin_value: number;
    total_building_damage: number;
    total_damage: number;
    total_healing: number;
    total_damage_taken: number;
    avg_coin_ratio: number;
    avg_building: number;
    avg_damage: number;
    avg_kills: number;
    avg_healing: number;
    avg_damage_taken: number;
    avg_assists: number;
    avg_deaths: number;
    kda: number;
}

interface MatchWithTeam extends Match { coin_value: number; }

const PERIODS = [
    { label: "全部", value: "", cardLabel: "" },
    { label: "3个月", value: "90", cardLabel: "赛季" },
    { label: "1个月", value: "30", cardLabel: "月度" },
    { label: "7天", value: "7", cardLabel: "周度" },
];
const MATCH_TYPES = ["全部", "排位", "正赛", "约战"];

// Available stat modules
interface StatModule {
    key: string;
    label: string;
    icon: string;
    getValue: (p: PlayerAgg) => string;
    color: string;
}

const STAT_MODULES: StatModule[] = [
    { key: "kda", label: "KD", icon: "⚔", getValue: p => p.kda.toFixed(2), color: "#22d3ee" },
    { key: "building", label: "塔伤", icon: "🏛", getValue: p => formatNum(p.avg_building), color: "#f97316" },
    { key: "kills_total", label: "人头", icon: "💀", getValue: p => p.total_kills.toString(), color: "#ef4444" },
    { key: "avg_damage", label: "场均输出", icon: "🔥", getValue: p => formatNum(p.avg_damage), color: "#f59e0b" },
    { key: "avg_kills", label: "场均击杀", icon: "🗡", getValue: p => p.avg_kills.toFixed(1), color: "#a855f7" },
    { key: "avg_healing", label: "场均治疗", icon: "💊", getValue: p => formatNum(p.avg_healing), color: "#34d399" },
    { key: "coin_ratio", label: "场均拿野", icon: "🐉", getValue: p => p.avg_coin_ratio.toFixed(2), color: "#facc15" },
];

function formatNum(n: number) {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
    if (n >= 1000) return (n / 1000).toFixed(1) + "K";
    return n.toFixed(0);
}

// ─── 称号系统 ───
// 阈值（所有伤害类单位为原始值，治疗 200W = 2_000_000）
function getTitle(p: PlayerAgg): string {
    if (p.matches_played === 0) return "无名之辈";

    const K  = p.avg_kills;           // 场均击杀
    const D  = p.avg_deaths;          // 场均死亡
    const A  = p.avg_assists;         // 场均助攻
    const DMG = p.avg_damage;         // 场均对玩家伤害
    const HEL = p.avg_healing;        // 场均治疗
    const BLD = p.avg_building;       // 场均塔伤
    const TKN = p.avg_damage_taken;   // 场均承伤
    const CR  = p.avg_coin_ratio;     // 场均拿野比例

    // 奇迹行者：拿野极强
    if (CR >= 0.9) return "奇迹行者";

    // 走哪算哪：拿野极弱
    if (CR <= 0.25 && K < 12) return "走哪算哪";

    // 冬瓜菜刀：高击杀 + 少死亡 + 高助攻 + 治疗低
    if (K >= 20 && D < 10 && A > 30 && HEL < 1_000_000) return "冬瓜菜刀";

    // 冬瓜臊子：低击杀 + 多死亡 + 助攻一般 + 治疗低
    if (K < 10 && D > 25 && A >= 20 && A <= 35 && HEL < 1_000_000) return "冬瓜臊子";

    // 比比拉布（吉祥物）：死亡高 + 啥都低
    if (D > 20 && K < 10 && HEL < 800_000 && DMG < 3_000_000 && BLD < 1_000_000) return "比比拉布";

    // 五代目火影：输出高 + 死亡少 + 承伤高 + 助攻高 + 治疗高 + 塔伤可观
    if (DMG >= 6_000_000 && D < 12 && TKN >= 4_000_000 && A > 25 && HEL >= 1_500_000 && BLD >= 1_500_000) return "五代目火影";

    // 老毛子：击杀少 + 玩家伤害高 + 死亡少 + 助攻高 + 治疗低
    if (K < 15 && DMG >= 5_000_000 && D < 12 && A > 25 && HEL < 1_000_000) return "老毛子";

    // M（搬树的）：击杀低 + 死亡少 + 承伤极高 + 助攻高 + 治疗较低
    if (K < 12 && D < 12 && TKN >= 6_000_000 && A > 25 && HEL < 2_000_000) return "M";

    // 抽水马桶：击杀低 + 死亡少 + 承伤高 + 助攻极高 + 治疗低
    if (K < 12 && D < 12 && TKN >= 4_000_000 && A > 35 && HEL < 1_000_000) return "抽水马桶";

    // 爹：击杀低 + 死亡少 + 承伤高 + 助攻低 + 治疗极高
    if (K < 12 && D < 12 && TKN >= 4_000_000 && A < 20 && HEL >= 3_000_000) return "爹";

    // 我的刀盾：击杀低 + 死亡少 + 承伤高 + 助攻一般 + 治疗低 + 塔伤高
    if (K < 12 && D < 12 && TKN >= 4_000_000 && A >= 20 && A <= 35 && HEL < 1_000_000 && BLD >= 2_000_000) return "我的刀盾";

    // 搅屎棍子：击杀低 + 死亡少 + 承伤高 + 助攻高 + 治疗低
    if (K < 12 && D < 12 && TKN >= 4_000_000 && A > 25 && HEL < 1_000_000) return "搅屎棍子";

    // 咕咕嘎嘎：各项都低
    if (K < 10 && D >= 10 && DMG < 3_000_000 && HEL < 800_000 && BLD < 1_000_000) return "咕咕嘎嘎";

    return "无名之辈";
}

// ─── Particle Effect ───
function ParticleOverlay({ onDone }: { onDone: () => void }) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d")!;
        canvas.width = canvas.offsetWidth;
        canvas.height = canvas.offsetHeight;

        const particles: { x: number; y: number; vx: number; vy: number; size: number; color: string; alpha: number; life: number }[] = [];
        const colors = ["#facc15", "#22d3ee", "#f97316", "#a855f7", "#ef4444", "#34d399"];

        // Create particles from center
        const cx = canvas.width / 2, cy = canvas.height / 2;
        for (let i = 0; i < 80; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 2 + Math.random() * 6;
            particles.push({
                x: cx, y: cy,
                vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
                size: 2 + Math.random() * 4,
                color: colors[Math.floor(Math.random() * colors.length)],
                alpha: 1,
                life: 40 + Math.random() * 30,
            });
        }

        let frame = 0;
        const animate = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            let alive = false;
            for (const p of particles) {
                p.x += p.vx;
                p.y += p.vy;
                p.vy += 0.05; // gravity
                p.alpha -= 1 / p.life;
                if (p.alpha <= 0) continue;
                alive = true;
                ctx.globalAlpha = p.alpha;
                ctx.fillStyle = p.color;
                ctx.fillRect(Math.floor(p.x), Math.floor(p.y), p.size, p.size); // pixel squares
            }
            frame++;
            if (alive && frame < 80) requestAnimationFrame(animate);
            else onDone();
        };
        animate();
    }, [onDone]);

    return (
        <canvas
            ref={canvasRef}
            className="absolute inset-0 z-50 pointer-events-none"
            style={{ width: "100%", height: "100%" }}
        />
    );
}

// ═══ Main Page ═══
export default function CardGeneratorPage() {
    const params = useParams();
    const baiyeId = params.id as string;
    const router = useRouter();

    const [user, setUser] = useState<User | null>(null);
    const [baiye, setBaiye] = useState<Baiye | null>(null);
    const [loading, setLoading] = useState(true);

    // Filters
    const [matchType, setMatchType] = useState("全部");
    const [period, setPeriod] = useState("7");

    // Data
    const [matches, setMatches] = useState<MatchWithTeam[]>([]);
    const [stats, setStats] = useState<MatchStat[]>([]);
    const [fetching, setFetching] = useState(false);

    // Card config
    const [selectedPlayer, setSelectedPlayer] = useState<string>("");
    const [enabledStats, setEnabledStats] = useState<Set<string>>(new Set(["kda", "building", "coin_ratio"]));

    // Generation state
    const [generated, setGenerated] = useState(false);
    const [showParticles, setShowParticles] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [copySuccess, setCopySuccess] = useState(false);

    const cardRef = useRef<HTMLDivElement>(null);

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

    // ── Fetch data ──
    const fetchData = useCallback(async () => {
        if (!baiye?.name) return;
        setFetching(true);
        setGenerated(false);
        try {
            const params = new URLSearchParams({ baiye_name: baiye.name });
            if (matchType !== "全部") params.set("match_type", matchType);
            if (period) params.set("period", period);
            const res = await fetch(`/api/analysis?${params}`);
            if (!res.ok) throw new Error("Failed");
            const data = await res.json();
            setMatches(data.matches || []);
            setStats(data.stats || []);
        } catch (err) {
            console.error("Card fetch error:", err);
        } finally {
            setFetching(false);
        }
    }, [baiye?.name, matchType, period]);

    useEffect(() => {
        if (baiye?.name) fetchData();
    }, [baiye?.name, fetchData]);

    // ── Aggregate player data ──
    const playerAggs = useMemo(() => {
        if (!baiye?.name || matches.length === 0) return [];
        const matchMap = new Map(matches.map(m => [m.id, m]));
        const ourStats = stats.filter(s => s.team_name === baiye.name);
        const agg = new Map<string, PlayerAgg>();

        for (const s of ourStats) {
            const m = matchMap.get(s.match_id);
            if (!m) continue;
            const coinVal = m.coin_value || 720;
            const ratio = coinVal > 0 ? (s.coins || 0) / coinVal : 0;

            if (!agg.has(s.player_name)) {
                agg.set(s.player_name, {
                    player_name: s.player_name,
                    matches_played: 0,
                    total_kills: 0, total_assists: 0, total_deaths: 0,
                    total_coins: 0, total_coin_value: 0,
                    total_building_damage: 0, total_damage: 0, total_healing: 0,
                    total_damage_taken: 0,
                    avg_coin_ratio: 0, avg_building: 0, avg_damage: 0,
                    avg_kills: 0, avg_healing: 0, avg_damage_taken: 0,
                    avg_assists: 0, avg_deaths: 0, kda: 0,
                });
            }
            const p = agg.get(s.player_name)!;
            p.matches_played++;
            p.total_kills += s.kills || 0;
            p.total_assists += s.assists || 0;
            p.total_deaths += s.deaths || 0;
            p.total_coins += s.coins || 0;
            p.total_coin_value += coinVal;
            p.total_building_damage += s.building_damage || 0;
            p.total_damage += s.damage || 0;
            p.total_healing += s.healing || 0;
            p.total_damage_taken += s.damage_taken || 0;
            p.avg_coin_ratio = p.total_coin_value > 0 ? p.total_coins / p.total_coin_value : 0;
            p.avg_building = p.total_building_damage / p.matches_played;
            p.avg_damage = p.total_damage / p.matches_played;
            p.avg_kills = p.total_kills / p.matches_played;
            p.avg_healing = p.total_healing / p.matches_played;
            p.avg_damage_taken = p.total_damage_taken / p.matches_played;
            p.avg_assists = p.total_assists / p.matches_played;
            p.avg_deaths = p.total_deaths / p.matches_played;
            p.kda = p.total_kills / Math.max(p.total_deaths, 1);
        }

        return Array.from(agg.values()).sort((a, b) => b.kda - a.kda);
    }, [baiye?.name, matches, stats]);

    // Auto-select current user's character
    useEffect(() => {
        if (user?.character_name) {
            setSelectedPlayer(user.character_name);
        }
    }, [user?.character_name]);

    // Find player data, or fallback to zeroed stats
    const currentPlayer: PlayerAgg = playerAggs.find(p => p.player_name === selectedPlayer) || {
        player_name: selectedPlayer || user?.character_name || "",
        matches_played: 0,
        total_kills: 0, total_assists: 0, total_deaths: 0,
        total_coins: 0, total_coin_value: 0,
        total_building_damage: 0, total_damage: 0, total_healing: 0,
        total_damage_taken: 0,
        avg_coin_ratio: 0, avg_building: 0, avg_damage: 0,
        avg_kills: 0, avg_healing: 0, avg_damage_taken: 0,
        avg_assists: 0, avg_deaths: 0, kda: 0,
    };

    // Filter display labels
    const filterLabel = useMemo(() => {
        const parts: string[] = [];
        if (matchType !== "全部") parts.push(matchType);
        const p = PERIODS.find(p => p.value === period);
        if (p && p.cardLabel) parts.push(p.cardLabel);
        return parts.join(" · ");
    }, [matchType, period]);

    // ── Toggle stat ──
    const toggleStat = (key: string) => {
        setEnabledStats(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
        setGenerated(false);
    };

    // ── Generate card ──
    const handleGenerate = () => {
        setGenerating(true);
        setShowParticles(true);
        setGenerated(false);

        setTimeout(() => {
            setGenerated(true);
            setGenerating(false);
        }, 600);
    };

    // ── Copy to clipboard ──
    const handleCopy = async () => {
        if (!cardRef.current) return;
        try {
            const blob = await domtoimage.toBlob(cardRef.current, { scale: 3 });
            if (navigator.clipboard?.write) {
                await navigator.clipboard.write([
                    new ClipboardItem({ 'image/png': blob }),
                ]);
            } else {
                // Fallback: download if Clipboard API not available
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${selectedPlayer || 'card'}_战场明信片.png`;
                a.click();
                URL.revokeObjectURL(url);
            }
            setCopySuccess(true);
            setTimeout(() => setCopySuccess(false), 2000);
        } catch (err) {
            console.error('Copy failed:', err);
        }
    };

    // ── Download ──
    const handleDownload = async () => {
        if (!cardRef.current) return;
        try {
            const blob = await domtoimage.toBlob(cardRef.current, { scale: 3 });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.download = `${selectedPlayer || 'card'}_战场明信片.png`;
            a.href = url;
            a.click();
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error('Download failed:', err);
        }
    };

    if (loading) {
        return <div className="min-h-screen bg-neutral-900 flex items-center justify-center text-white">加载中...</div>;
    }

    const activeModules = STAT_MODULES.filter(m => enabledStats.has(m.key));

    return (
        <main className="min-h-screen bg-neutral-900 text-white p-4 md:p-8">
            {/* Header */}
            <header className="max-w-7xl mx-auto flex justify-between items-center mb-6 border-b-4 border-black pb-4">
                <div>
                    <button
                        onClick={() => router.push(`/baiye/${baiyeId}/matches`)}
                        className="text-xs text-neutral-500 hover:text-white mb-1"
                    >
                        ← 返回战记录
                    </button>
                    <h1 className="text-2xl font-bold text-yellow-500 uppercase">
                        🎴 战场明信片
                    </h1>
                    <p className="text-xs text-neutral-500">{baiye?.name} · 生成专属的战场名片</p>
                </div>
            </header>

            <div className="max-w-7xl mx-auto">
                {/* ═══ Filters ═══ */}
                <PixelCard className="bg-neutral-800 space-y-4 mb-6">
                    <div className="flex flex-col md:flex-row gap-4">
                        <div className="flex-1 space-y-2">
                            <label className="text-xs font-bold uppercase tracking-wider text-neutral-400">对战类型</label>
                            <div className="flex gap-1.5">
                                {MATCH_TYPES.map(t => (
                                    <button
                                        key={t}
                                        onClick={() => { setMatchType(t); setGenerated(false); }}
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
                        <div className="flex-1 space-y-2">
                            <label className="text-xs font-bold uppercase tracking-wider text-neutral-400">时间范围</label>
                            <div className="flex gap-1.5">
                                {PERIODS.map(p => (
                                    <button
                                        key={p.value}
                                        onClick={() => { setPeriod(p.value); setGenerated(false); }}
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
                    <div className="flex gap-4 pt-2 border-t border-neutral-700 text-xs text-neutral-500">
                        <span>🔍 共 <span className="text-white font-bold">{matches.length}</span> 场对局</span>
                        <span>👥 <span className="text-white font-bold">{playerAggs.length}</span> 名参战玩家</span>
                    </div>
                </PixelCard>

                {/* ═══ Main Content: Card Preview + Config Panel ═══ */}
                <div className="flex flex-col lg:flex-row gap-6">
                    {/* ━━━ Left: Card Preview ━━━ */}
                    <div className="flex-1 flex flex-col items-center relative">
                        {showParticles && (
                            <ParticleOverlay onDone={() => setShowParticles(false)} />
                        )}

                        {/* Card */}
                        <div
                            ref={cardRef}
                            className={`w-[380px] transition-all duration-500 ${generated ? 'opacity-100 scale-100' : 'opacity-60 scale-95'
                                }`}
                            style={{ fontFamily: "'Noto Sans SC', sans-serif" }}
                        >
                            {/* Card Background */}
                            <div
                                className="relative overflow-hidden"
                                style={{
                                    background: "linear-gradient(145deg, #1a1a2e 0%, #16213e 30%, #0f3460 70%, #1a1a2e 100%)",
                                    border: "3px solid #facc15",
                                    boxShadow: "0 0 20px rgba(250, 204, 21, 0.15), inset 0 0 60px rgba(0,0,0,0.3)",
                                }}
                            >
                                {/* Decorative corner patterns */}
                                <div className="absolute top-0 left-0 w-12 h-12 border-t-2 border-l-2 border-yellow-500/30 m-2" />
                                <div className="absolute top-0 right-0 w-12 h-12 border-t-2 border-r-2 border-yellow-500/30 m-2" />
                                <div className="absolute bottom-0 left-0 w-12 h-12 border-b-2 border-l-2 border-yellow-500/30 m-2" />
                                <div className="absolute bottom-0 right-0 w-12 h-12 border-b-2 border-r-2 border-yellow-500/30 m-2" />

                                {/* Grid pattern overlay */}
                                <div className="absolute inset-0 opacity-[0.03]" style={{
                                    backgroundImage: "repeating-linear-gradient(0deg, #fff 0px, transparent 1px, transparent 20px), repeating-linear-gradient(90deg, #fff 0px, transparent 1px, transparent 20px)",
                                }} />

                                <div className="relative px-6 py-5">
                                    {/* Top bar: baiye name + filter */}
                                    <div className="flex items-center justify-between mb-4">
                                        <div className="flex items-center gap-2">
                                            <div className="w-1 h-4" style={{ background: "#facc15" }} />
                                            <span
                                                className="font-bold tracking-wider uppercase"
                                                style={{ fontSize: 11, color: "rgba(250,204,21,0.8)" }}
                                            >
                                                {baiye?.name || "百业战"}
                                            </span>
                                        </div>
                                        {filterLabel && (
                                            <span
                                                className="font-bold tracking-wider"
                                                style={{ fontSize: 9, padding: "2px 8px", border: "1px solid rgba(250,204,21,0.3)", color: "rgba(250,204,21,0.7)" }}
                                            >
                                                {filterLabel}
                                            </span>
                                        )}
                                    </div>

                                    {/* Avatar + Name + Title */}
                                    <div className="flex items-center gap-4 mb-5">
                                        {/* Avatar */}
                                        <div
                                            className="w-16 h-16 shrink-0 overflow-hidden"
                                            style={{
                                                border: "2px solid rgba(250,204,21,0.4)",
                                                boxShadow: "0 0 12px rgba(250,204,21,0.1)",
                                            }}
                                        >
                                            {user?.avatar_url ? (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img
                                                    src={user.avatar_url}
                                                    alt={user.character_name || "avatar"}
                                                    className="w-full h-full object-cover"
                                                    crossOrigin="anonymous"
                                                />
                                            ) : (
                                                <div
                                                    className="w-full h-full flex items-center justify-center"
                                                    style={{ background: "rgba(30,30,50,0.8)" }}
                                                >
                                                    <span
                                                        className="font-black"
                                                        style={{ fontSize: 22, color: "rgba(250,204,21,0.8)" }}
                                                    >
                                                        {(currentPlayer.player_name || user?.character_name || "?").charAt(0)}
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            {/* Title */}
                                            <div
                                                className="font-bold mb-0.5 tracking-wider"
                                                style={{ fontSize: 10, color: "rgba(34,211,238,0.8)" }}
                                            >
                                                {getTitle(currentPlayer)}
                                            </div>
                                            {/* Name */}
                                            <h2
                                                className="font-black truncate leading-tight"
                                                style={{ fontSize: 20, color: "#ffffff", textShadow: "0 0 10px rgba(255,255,255,0.1)" }}
                                            >
                                                {currentPlayer.player_name || "—"}
                                            </h2>
                                            {/* Matches count */}
                                            <div
                                                className="mt-0.5"
                                                style={{ fontSize: 10, color: "#737373" }}
                                            >
                                                参与 {currentPlayer.matches_played || 0} 场对战
                                            </div>
                                        </div>
                                    </div>

                                    {/* Divider */}
                                    <div
                                        className="h-px mb-4"
                                        style={{ background: "linear-gradient(to right, transparent, rgba(250,204,21,0.3), transparent)" }}
                                    />

                                    {/* Stats Grid */}
                                    {activeModules.length > 0 && (
                                        <div className={`grid gap-2 mb-4 ${activeModules.length <= 2 ? 'grid-cols-2' :
                                                activeModules.length === 3 ? 'grid-cols-3' :
                                                    activeModules.length === 4 ? 'grid-cols-2' :
                                                        'grid-cols-3'
                                            }`}>
                                            {activeModules.map(mod => (
                                                <div
                                                    key={mod.key}
                                                    className="flex flex-col items-center py-2.5 px-1"
                                                    style={{ border: "1px solid rgba(255,255,255,0.05)", background: "rgba(255,255,255,0.02)" }}
                                                >
                                                    <span
                                                        className="font-bold mb-1"
                                                        style={{ fontSize: 10, color: "#737373" }}
                                                    >
                                                        {mod.icon} {mod.label}
                                                    </span>
                                                    <span
                                                        className="font-black tracking-tight"
                                                        style={{ fontSize: 18, color: mod.color, textShadow: `0 0 8px ${mod.color}33` }}
                                                    >
                                                        {currentPlayer ? mod.getValue(currentPlayer) : "—"}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* Bottom bar */}
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-1.5">
                                            <div className="w-1.5 h-1.5 rotate-45" style={{ background: "#facc15" }} />
                                            <span
                                                className="font-bold tracking-widest uppercase"
                                                style={{ fontSize: 9, color: "#525252" }}
                                            >
                                                baiyezhan.xyz
                                            </span>
                                        </div>
                                        <span style={{ fontSize: 9, color: "#404040" }}>
                                            {new Date().toLocaleDateString("zh-CN")}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Action Buttons */}
                        {generated && (
                            <div className="flex gap-3 mt-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                <button
                                    onClick={handleCopy}
                                    className={`px-5 py-2.5 text-xs font-bold border-2 transition-all ${copySuccess
                                            ? "bg-green-500 border-green-600 text-black"
                                            : "bg-neutral-800 border-neutral-600 text-white hover:border-yellow-500 hover:text-yellow-500"
                                        }`}
                                >
                                    {copySuccess ? "✅ 已复制" : "📋 复制图片"}
                                </button>
                                <button
                                    onClick={handleDownload}
                                    className="px-5 py-2.5 text-xs font-bold border-2 bg-neutral-800 border-neutral-600 text-white hover:border-yellow-500 hover:text-yellow-500 transition-all"
                                >
                                    💾 下载图片
                                </button>
                            </div>
                        )}
                    </div>

                    {/* ━━━ Right: Config Panel ━━━ */}
                    <div className="w-full lg:w-[320px] shrink-0 space-y-4">

                        {/* Stat Modules */}
                        <PixelCard className="bg-neutral-800 space-y-3">
                            <h3 className="text-xs font-bold text-yellow-500 uppercase border-b border-yellow-500/20 pb-2">
                                📊 自定义数据模块
                            </h3>
                            <p className="text-[10px] text-neutral-500">
                                选择要展示在明信片上的数据
                            </p>
                            <div className="space-y-1.5">
                                {STAT_MODULES.map(mod => {
                                    const isOn = enabledStats.has(mod.key);
                                    return (
                                        <button
                                            key={mod.key}
                                            onClick={() => toggleStat(mod.key)}
                                            className={`w-full flex items-center gap-3 px-3 py-2 border-2 text-left transition-all ${isOn
                                                    ? "border-current bg-current/5"
                                                    : "border-neutral-700 bg-neutral-800 hover:border-neutral-600"
                                                }`}
                                            style={isOn ? { borderColor: mod.color + "60", color: mod.color } : {}}
                                        >
                                            <span className="text-sm">{mod.icon}</span>
                                            <span className={`text-xs font-bold flex-1 ${isOn ? "" : "text-neutral-400"}`}>
                                                {mod.label}
                                            </span>
                                            {isOn && currentPlayer && (
                                                <span className="text-xs font-bold" style={{ color: mod.color }}>
                                                    {mod.getValue(currentPlayer)}
                                                </span>
                                            )}
                                            <span className={`w-5 h-5 border-2 flex items-center justify-center text-[10px] font-bold ${isOn
                                                    ? "border-current bg-current text-black"
                                                    : "border-neutral-600"
                                                }`}
                                                style={isOn ? { backgroundColor: mod.color, borderColor: mod.color } : {}}
                                            >
                                                {isOn ? "✓" : ""}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </PixelCard>

                        {/* Generate Button */}
                        <button
                            onClick={handleGenerate}
                            disabled={generating}
                            className={`w-full py-3.5 text-sm font-black uppercase tracking-wider border-3 transition-all ${generating
                                    ? "bg-neutral-700 border-neutral-600 text-neutral-500 cursor-not-allowed"
                                    : "bg-gradient-to-r from-yellow-500 to-amber-500 border-yellow-600 text-black hover:from-yellow-400 hover:to-amber-400 hover:shadow-[0_0_20px_rgba(250,204,21,0.3)]"
                                }`}
                            style={{ borderWidth: "3px" }}
                        >
                            {generating ? (
                                <span className="flex items-center justify-center gap-2">
                                    <span className="w-4 h-4 border-2 border-black border-t-transparent animate-spin" />
                                    锻造中...
                                </span>
                            ) : (
                                "🔨 锻造明信片"
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </main>
    );
}

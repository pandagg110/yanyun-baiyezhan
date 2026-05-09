"use client";

import { useMemo } from "react";
import { RosterData, RosterSquadMember, MatchStat } from "@/types/app";

// ── 8 jungle positions on the map ──
// Internal layout: each has a label, position on SVG, and which side it belongs to
interface JungleSpot {
    label: string;          // e.g. "上内野（进攻）"
    shortLabel: string;     // e.g. "上内"
    side: "offense" | "defense"; // offense = near enemy, defense = near us
    area: "upper" | "lower";
    x: number;
    y: number;
}

const MAP_W = 900;
const MAP_H = 480;

// Layout constants
const BASE_W = 70;
const LANE_Y_TOP = 60;
const LANE_Y_MID = MAP_H / 2;
const LANE_Y_BOT = MAP_H - 60;

const JUNGLE_SPOTS: JungleSpot[] = [
    // Upper jungle area (between top and mid lanes)
    // 内野 = closer to base, 外野 = closer to midline
    { label: "上内野（防守）", shortLabel: "上内野", side: "defense", area: "upper", x: 240, y: 140 },
    { label: "上内野（进攻）", shortLabel: "上内野", side: "offense", area: "upper", x: 660, y: 140 },
    { label: "上外野（防守）", shortLabel: "上外野", side: "defense", area: "upper", x: 360, y: 155 },
    { label: "上外野（进攻）", shortLabel: "上外野", side: "offense", area: "upper", x: 540, y: 155 },

    // Lower jungle area (between mid and bottom lanes)
    { label: "下外野（防守）", shortLabel: "下外野", side: "defense", area: "lower", x: 360, y: MAP_H - 155 },
    { label: "下外野（进攻）", shortLabel: "下外野", side: "offense", area: "lower", x: 540, y: MAP_H - 155 },
    { label: "下内野（防守）", shortLabel: "下内野", side: "defense", area: "lower", x: 240, y: MAP_H - 140 },
    { label: "下内野（进攻）", shortLabel: "下内野", side: "offense", area: "lower", x: 660, y: MAP_H - 140 },
];

interface JungleAssignment {
    playerName: string;
    coinRatio?: number;     // if matched from stats
    squad: string;          // e.g. "进攻1队"
}

interface JungleData {
    spot: JungleSpot;
    assignments: JungleAssignment[];
}

interface BattleMapProps {
    rosterData?: RosterData | null;
    stats?: MatchStat[];           // for coin_ratio overlay
    coinValue?: number;
    baiyeName?: string;
    // New: match-level data for info panel
    matchInfo?: {
        team_a: string;
        team_b: string;
        winner?: string | null;
        big_dragon_team?: string | null;
        small_dragon_team?: string | null;
    } | null;
    allStats?: MatchStat[];  // both teams' stats for computing team comparison
}

/**
 * Extract jungle assignments from roster data.
 * We look through all squads' members' cells at the "打野" column
 * and match the cell text to one of the 8 jungle labels.
 */
function extractJungleAssignments(
    rosterData: RosterData,
    stats: MatchStat[],
    coinValue: number,
): JungleData[] {
    const defenseColumns = rosterData.columns || [];
    const attackColumns = rosterData.attackColumns || defenseColumns;
    // Find the "打野" column index separately for defense and attack
    // (attack and defense have different column layouts)
    const defJungleIdx = defenseColumns.findIndex(c => c.includes("打野"));
    const atkJungleIdx = attackColumns.findIndex(c => c.includes("打野"));
    if (defJungleIdx < 0 && atkJungleIdx < 0) return JUNGLE_SPOTS.map(spot => ({ spot, assignments: [] }));

    // Build a map: jungle label → assignments
    const assignmentMap = new Map<string, JungleAssignment[]>();
    for (const spot of JUNGLE_SPOTS) {
        assignmentMap.set(spot.label, []);
    }

    // Build stats lookup by player name
    const statsMap = new Map<string, MatchStat>();
    for (const s of stats) {
        statsMap.set(s.player_name, s);
    }

    const processSquads = (squads: { members: RosterSquadMember[] }[], prefix: string, colIdx: number) => {
        if (colIdx < 0) return;
        squads.forEach((squad, si) => {
            for (const member of squad.members) {
                if (colIdx < member.cells.length) {
                    const cellText = member.cells[colIdx]?.text?.trim();
                    if (cellText && assignmentMap.has(cellText)) {
                        const list = assignmentMap.get(cellText)!;
                        const stat = statsMap.get(member.name);
                        list.push({
                            playerName: member.name,
                            coinRatio: stat ? (stat.coins || 0) / coinValue : undefined,
                            squad: `${prefix}${si + 1}队`,
                        });
                    }
                }
            }
        });
    };

    processSquads(rosterData.attack || [], "进攻", atkJungleIdx);
    processSquads(rosterData.defense || [], "防守", defJungleIdx);

    return JUNGLE_SPOTS.map(spot => ({
        spot,
        assignments: assignmentMap.get(spot.label) || [],
    }));
}

/** Compute team comparison stats from both teams' stats */
function computeTeamComparison(allStats: MatchStat[], baiyeName: string, matchInfo?: BattleMapProps['matchInfo']) {
    const ourName = baiyeName;
    const ourStats = allStats.filter(s => s.team_name === ourName);
    const oppStats = allStats.filter(s => s.team_name !== ourName);

    const ourKills = ourStats.reduce((sum, s) => sum + (s.kills || 0), 0);
    const oppKills = oppStats.reduce((sum, s) => sum + (s.kills || 0), 0);
    const ourCoins = ourStats.reduce((sum, s) => sum + (s.coins || 0), 0);
    const oppCoins = oppStats.reduce((sum, s) => sum + (s.coins || 0), 0);
    const ourHealing = ourStats.reduce((sum, s) => sum + (s.healing || 0), 0);
    const oppHealing = oppStats.reduce((sum, s) => sum + (s.healing || 0), 0);
    const ourAvgHealing = ourStats.length > 0 ? ourHealing / ourStats.length : 0;
    const oppAvgHealing = oppStats.length > 0 ? oppHealing / oppStats.length : 0;

    return { ourKills, oppKills, ourCoins, oppCoins, ourAvgHealing, oppAvgHealing };
}

export function BattleMap({ rosterData, stats = [], coinValue = 792, baiyeName, matchInfo, allStats }: BattleMapProps) {
    const jungleData = useMemo(() => {
        if (!rosterData) return JUNGLE_SPOTS.map(spot => ({ spot, assignments: [] as JungleAssignment[] }));
        return extractJungleAssignments(rosterData, stats, coinValue);
    }, [rosterData, stats, coinValue]);

    const hasAnyAssignment = jungleData.some(j => j.assignments.length > 0);

    const comparison = useMemo(() => {
        if (!allStats || allStats.length === 0 || !baiyeName) return null;
        return computeTeamComparison(allStats, baiyeName, matchInfo);
    }, [allStats, baiyeName, matchInfo]);

    // Dragon status helpers
    const bigDragonTeam = matchInfo?.big_dragon_team;
    const smallDragonTeam = matchInfo?.small_dragon_team;
    const getDragonLabel = (team: string | null | undefined) => {
        if (!team) return null;
        if (team === baiyeName) return { label: '我方', color: '#22c55e', bg: '#14532d' };
        return { label: '敌方', color: '#ef4444', bg: '#7f1d1d' };
    };

    // Tower positions
    const towers = [
        // Our side towers (left)
        { x: BASE_W + 60, y: LANE_Y_TOP, side: "defense" as const },
        { x: BASE_W + 60, y: LANE_Y_MID, side: "defense" as const },
        { x: BASE_W + 60, y: LANE_Y_BOT, side: "defense" as const },
        // Enemy side towers (right)
        { x: MAP_W - BASE_W - 60, y: LANE_Y_TOP, side: "offense" as const },
        { x: MAP_W - BASE_W - 60, y: LANE_Y_MID, side: "offense" as const },
        { x: MAP_W - BASE_W - 60, y: LANE_Y_BOT, side: "offense" as const },
    ];

    // Format number helper
    const fmtNum = (n: number) => n >= 10000 ? (n / 10000).toFixed(1) + 'w' : n >= 1000 ? (n / 1000).toFixed(1) + 'k' : Math.round(n).toString();

    return (
        <div className="w-full">
            <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">🗺️ 战场地图</span>
                {!hasAnyAssignment && (
                    <span className="text-[10px] text-neutral-600">(无排表打野数据)</span>
                )}
            </div>

            {/* ── Info Panel: Dragons + Team Comparison ── */}
            {(comparison || bigDragonTeam || smallDragonTeam) && (
                <div className="flex flex-wrap gap-2 mb-2">
                    {/* Dragon Status */}
                    {(bigDragonTeam !== undefined || smallDragonTeam !== undefined) && (
                        <div className="flex gap-1.5">
                            {/* Big Dragon */}
                            {(() => {
                                const d = getDragonLabel(bigDragonTeam);
                                return (
                                    <div className={`flex items-center gap-1.5 px-2 py-1 border text-xs font-bold ${d ? `border-opacity-40` : 'border-neutral-700 bg-neutral-800/50'
                                        }`} style={d ? { borderColor: d.color + '60', backgroundColor: d.bg + 'cc', color: d.color } : { color: '#666' }}>
                                        <span>🐉</span>
                                        <span>大龙</span>
                                        <span className="text-[10px] opacity-80">{d ? d.label : '—'}</span>
                                    </div>
                                );
                            })()}
                            {/* Small Dragon */}
                            {(() => {
                                const d = getDragonLabel(smallDragonTeam);
                                return (
                                    <div className={`flex items-center gap-1.5 px-2 py-1 border text-xs font-bold ${d ? `border-opacity-40` : 'border-neutral-700 bg-neutral-800/50'
                                        }`} style={d ? { borderColor: d.color + '60', backgroundColor: d.bg + 'cc', color: d.color } : { color: '#666' }}>
                                        <span>🦎</span>
                                        <span>小龙</span>
                                        <span className="text-[10px] opacity-80">{d ? d.label : '—'}</span>
                                    </div>
                                );
                            })()}
                        </div>
                    )}

                    {/* Team Comparison Stats */}
                    {comparison && (
                        <div className="flex gap-1.5 flex-wrap">
                            {/* Kill Ratio */}
                            <div className="flex items-center gap-1. px-2 py-1 border border-neutral-700 bg-neutral-900/80 text-xs">
                                <span className="text-neutral-500">⚔</span>
                                <span className="text-cyan-400 font-bold">{comparison.ourKills}</span>
                                <span className="text-neutral-600">:</span>
                                <span className="text-red-400 font-bold">{comparison.oppKills}</span>
                                <span className="text-neutral-600 text-[10px] ml-0.5">人头</span>
                            </div>
                            {/* Economy Ratio */}
                            <div className="flex items-center gap-1 px-2 py-1 border border-neutral-700 bg-neutral-900/80 text-xs">
                                <span className="text-neutral-500">🪙</span>
                                <span className="text-yellow-400 font-bold">{fmtNum(comparison.ourCoins)}</span>
                                <span className="text-neutral-600">:</span>
                                <span className="text-red-400 font-bold">{fmtNum(comparison.oppCoins)}</span>
                                <span className="text-neutral-600 text-[10px] ml-0.5">经济</span>
                            </div>
                            {/* Avg Healing Ratio */}
                            <div className="flex items-center gap-1 px-2 py-1 border border-neutral-700 bg-neutral-900/80 text-xs">
                                <span className="text-neutral-500">💊</span>
                                <span className="text-emerald-400 font-bold">{fmtNum(comparison.ourAvgHealing)}</span>
                                <span className="text-neutral-600">:</span>
                                <span className="text-red-400 font-bold">{fmtNum(comparison.oppAvgHealing)}</span>
                                <span className="text-neutral-600 text-[10px] ml-0.5">均治疗</span>
                            </div>
                        </div>
                    )}
                </div>
            )}

            <div className="bg-neutral-950/80 border border-neutral-700 p-2 overflow-x-auto">
                <svg
                    viewBox={`0 0 ${MAP_W} ${MAP_H}`}
                    className="w-full"
                    style={{ minWidth: 600, maxHeight: 420 }}
                >
                    <defs>
                        {/* Gradient backgrounds for jungle areas */}
                        <radialGradient id="jungle-defense" cx="50%" cy="50%" r="50%">
                            <stop offset="0%" stopColor="#22c55e" stopOpacity="0.15" />
                            <stop offset="100%" stopColor="#22c55e" stopOpacity="0" />
                        </radialGradient>
                        <radialGradient id="jungle-offense" cx="50%" cy="50%" r="50%">
                            <stop offset="0%" stopColor="#ef4444" stopOpacity="0.15" />
                            <stop offset="100%" stopColor="#ef4444" stopOpacity="0" />
                        </radialGradient>
                        {/* Glow filters */}
                        <filter id="glow-green">
                            <feGaussianBlur stdDeviation="3" result="blur" />
                            <feComposite in="SourceGraphic" in2="blur" operator="over" />
                        </filter>
                        <filter id="glow-red">
                            <feGaussianBlur stdDeviation="3" result="blur" />
                            <feComposite in="SourceGraphic" in2="blur" operator="over" />
                        </filter>
                    </defs>

                    {/* ── Background ── */}
                    <rect x="0" y="0" width={MAP_W} height={MAP_H} fill="#0a0a0a" rx="4" />

                    {/* ── Midfield dividing line ── */}
                    <line x1={MAP_W / 2} y1="20" x2={MAP_W / 2} y2={MAP_H - 20}
                        stroke="#333" strokeWidth="1" strokeDasharray="6 4" />
                    <text x={MAP_W / 2} y="16" fill="#444" fontSize="10" textAnchor="middle" fontWeight="bold">
                        中线
                    </text>

                    {/* ── Lanes ── */}
                    {/* Top lane */}
                    <line x1={BASE_W} y1={LANE_Y_TOP} x2={MAP_W - BASE_W} y2={LANE_Y_TOP}
                        stroke="#444" strokeWidth="2" />
                    <text x={MAP_W / 2} y={LANE_Y_TOP - 10} fill="#666" fontSize="11"
                        textAnchor="middle" fontWeight="bold">上路</text>

                    {/* Mid lane */}
                    <line x1={BASE_W} y1={LANE_Y_MID} x2={MAP_W - BASE_W} y2={LANE_Y_MID}
                        stroke="#555" strokeWidth="2.5" />
                    <text x={MAP_W / 2} y={LANE_Y_MID - 10} fill="#777" fontSize="11"
                        textAnchor="middle" fontWeight="bold">中路</text>

                    {/* Bottom lane */}
                    <line x1={BASE_W} y1={LANE_Y_BOT} x2={MAP_W - BASE_W} y2={LANE_Y_BOT}
                        stroke="#444" strokeWidth="2" />
                    <text x={MAP_W / 2} y={LANE_Y_BOT - 10} fill="#666" fontSize="11"
                        textAnchor="middle" fontWeight="bold">下路</text>

                    {/* ── Lane connections (vertical at bases) ── */}
                    <line x1={BASE_W} y1={LANE_Y_TOP} x2={BASE_W} y2={LANE_Y_BOT}
                        stroke="#333" strokeWidth="1.5" />
                    <line x1={MAP_W - BASE_W} y1={LANE_Y_TOP} x2={MAP_W - BASE_W} y2={LANE_Y_BOT}
                        stroke="#333" strokeWidth="1.5" />

                    {/* ── Bases ── */}
                    {/* Our base (left) */}
                    <rect x="4" y={LANE_Y_TOP - 20} width={BASE_W - 10}
                        height={LANE_Y_BOT - LANE_Y_TOP + 40}
                        fill="#16a34a" fillOpacity="0.08"
                        stroke="#22c55e" strokeWidth="2" rx="6" />
                    <text x={BASE_W / 2} y={MAP_H / 2 - 8} fill="#22c55e" fontSize="14"
                        textAnchor="middle" fontWeight="bold">我方</text>
                    <text x={BASE_W / 2} y={MAP_H / 2 + 10} fill="#22c55e" fontSize="14"
                        textAnchor="middle" fontWeight="bold">基地</text>
                    {baiyeName && (
                        <text x={BASE_W / 2} y={MAP_H / 2 + 26} fill="#22c55e" fontSize="9"
                            textAnchor="middle" opacity="0.6">
                            {baiyeName.length > 6 ? baiyeName.slice(0, 6) + '..' : baiyeName}
                        </text>
                    )}

                    {/* Enemy base (right) */}
                    <rect x={MAP_W - BASE_W + 6} y={LANE_Y_TOP - 20}
                        width={BASE_W - 10}
                        height={LANE_Y_BOT - LANE_Y_TOP + 40}
                        fill="#dc2626" fillOpacity="0.08"
                        stroke="#ef4444" strokeWidth="2" rx="6" />
                    <text x={MAP_W - BASE_W / 2} y={MAP_H / 2 - 8} fill="#ef4444" fontSize="14"
                        textAnchor="middle" fontWeight="bold">敌方</text>
                    <text x={MAP_W - BASE_W / 2} y={MAP_H / 2 + 10} fill="#ef4444" fontSize="14"
                        textAnchor="middle" fontWeight="bold">基地</text>

                    {/* ── Towers ── */}
                    {towers.map((t, i) => (
                        <g key={`tower-${i}`}>
                            <rect x={t.x - 10} y={t.y - 10} width="20" height="20"
                                fill={t.side === "defense" ? "#166534" : "#7f1d1d"}
                                stroke={t.side === "defense" ? "#22c55e" : "#ef4444"}
                                strokeWidth="1.5" rx="3" />
                            <text x={t.x} y={t.y + 4} fill={t.side === "defense" ? "#86efac" : "#fca5a5"}
                                fontSize="9" textAnchor="middle" fontWeight="bold">塔</text>
                        </g>
                    ))}

                    {/* ── Jungle zones background glow ── */}
                    {/* Defense upper */}
                    <ellipse cx={300} cy={148} rx={120} ry={50}
                        fill="url(#jungle-defense)" />
                    {/* Offense upper */}
                    <ellipse cx={600} cy={148} rx={120} ry={50}
                        fill="url(#jungle-offense)" />
                    {/* Defense lower */}
                    <ellipse cx={300} cy={MAP_H - 148} rx={120} ry={50}
                        fill="url(#jungle-defense)" />
                    {/* Offense lower */}
                    <ellipse cx={600} cy={MAP_H - 148} rx={120} ry={50}
                        fill="url(#jungle-offense)" />

                    {/* ── Jungle spots ── */}
                    {jungleData.map(({ spot, assignments }, idx) => {
                        const isOffense = spot.side === "offense";
                        const hasData = assignments.length > 0;
                        const borderColor = isOffense ? "#ef4444" : "#22c55e";
                        const bgColor = isOffense ? "#7f1d1d" : "#14532d";
                        const textColor = isOffense ? "#fca5a5" : "#86efac";
                        const labelColor = isOffense ? "#f87171" : "#4ade80";
                        const sideLabel = isOffense ? "进攻" : "防守";

                        // Card dimensions
                        const cardW = 110;
                        const cardH = hasData ? 20 + assignments.length * 18 : 36;

                        return (
                            <g key={`jungle-${idx}`}>
                                {/* Jungle card */}
                                <rect
                                    x={spot.x - cardW / 2}
                                    y={spot.y - cardH / 2}
                                    width={cardW}
                                    height={cardH}
                                    fill={bgColor}
                                    fillOpacity={hasData ? "0.85" : "0.4"}
                                    stroke={borderColor}
                                    strokeWidth={hasData ? "1.5" : "0.8"}
                                    strokeOpacity={hasData ? 1 : 0.4}
                                    rx="4"
                                />

                                {/* Label: e.g. "上内野 (进攻)" */}
                                <text
                                    x={spot.x}
                                    y={spot.y - cardH / 2 + 13}
                                    fill={labelColor}
                                    fontSize="10"
                                    textAnchor="middle"
                                    fontWeight="bold"
                                    opacity={hasData ? 1 : 0.5}
                                >
                                    {spot.shortLabel}（{sideLabel}）
                                </text>

                                {/* Player assignments */}
                                {hasData ? (
                                    assignments.map((a, ai) => {
                                        const coinColor = a.coinRatio !== undefined
                                            ? (a.coinRatio >= 1 ? "#facc15" : a.coinRatio >= 0.6 ? "#fb923c" : "#a3a3a3")
                                            : "#666";
                                        return (
                                            <g key={`${idx}-${ai}`}>
                                                <text
                                                    x={spot.x - cardW / 2 + 8}
                                                    y={spot.y - cardH / 2 + 28 + ai * 18}
                                                    fill={textColor}
                                                    fontSize="10"
                                                    fontWeight="bold"
                                                >
                                                    {a.playerName.length > 5 ? a.playerName.slice(0, 5) + '..' : a.playerName}
                                                </text>
                                                {a.coinRatio !== undefined && (
                                                    <text
                                                        x={spot.x + cardW / 2 - 8}
                                                        y={spot.y - cardH / 2 + 28 + ai * 18}
                                                        fill={coinColor}
                                                        fontSize="10"
                                                        fontWeight="bold"
                                                        textAnchor="end"
                                                    >
                                                        🪙{a.coinRatio.toFixed(2)}
                                                    </text>
                                                )}
                                            </g>
                                        );
                                    })
                                ) : (
                                    <text
                                        x={spot.x}
                                        y={spot.y - cardH / 2 + 28}
                                        fill="#555"
                                        fontSize="9"
                                        textAnchor="middle"
                                    >
                                        —
                                    </text>
                                )}
                            </g>
                        );
                    })}

                    {/* ── Legend ── */}
                    <g transform={`translate(10, ${MAP_H - 32})`}>
                        <rect x="0" y="0" width="180" height="28" fill="#111" fillOpacity="0.8" rx="3" stroke="#333" strokeWidth="0.5" />
                        <rect x="8" y="7" width="10" height="10" fill="#14532d" stroke="#22c55e" strokeWidth="1" rx="2" />
                        <text x="22" y="16" fill="#86efac" fontSize="9">防守区 (我方侧)</text>
                        <rect x="98" y="7" width="10" height="10" fill="#7f1d1d" stroke="#ef4444" strokeWidth="1" rx="2" />
                        <text x="112" y="16" fill="#fca5a5" fontSize="9">进攻区 (敌方侧)</text>
                    </g>
                </svg>
            </div>
        </div>
    );
}


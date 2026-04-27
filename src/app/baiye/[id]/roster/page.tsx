"use client";

import { RosterOptionsManager } from "@/components/feature/roster-options-manager";
import { RosterPlayerPool } from "@/components/feature/roster-player-pool";
import { RosterTable } from "@/components/feature/roster-table";
import { RosterWall } from "@/components/feature/roster-wall";
import { PixelButton } from "@/components/pixel/pixel-button";
import { PixelCard } from "@/components/pixel/pixel-card";
import { SupabaseService } from "@/services/supabase-service";
import { Roster, RosterData, RosterMember, RosterOption, RosterSquad, User, WallTower } from "@/types/app";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const ATTACK_COLUMNS = [
    "开局规划", "打塔", "打鹅", "树团",
    "打野", "25分boss规划", "15分boss规划"
];

const DEFENSE_COLUMNS = [
    "开局规划", "守塔", "守鹅", "守车",
    "铁桶（boss没拿到）", "打野",
    "25分boss规划", "15分boss规划"
];

const EMPTY_SQUAD = (): RosterSquad => ({ members: [], colorNote: "花脸色标点" });

const EMPTY_WALL = (): WallTower[] => [
    { name: "上塔", members: [] },
    { name: "中塔", members: [] },
    { name: "下塔", members: [] },
];

const EMPTY_ROSTER_DATA = (): RosterData => ({
    columns: [...DEFENSE_COLUMNS],
    attackColumns: [...ATTACK_COLUMNS],
    attack: [EMPTY_SQUAD(), EMPTY_SQUAD(), EMPTY_SQUAD()],
    defense: [EMPTY_SQUAD(), EMPTY_SQUAD(), EMPTY_SQUAD()],
    wall: EMPTY_WALL(),
});

/** Extract all member names from a roster */
function extractNamesFromRoster(data: RosterData): string[] {
    const names: string[] = [];
    for (const section of [data.attack, data.defense]) {
        if (!Array.isArray(section)) continue;
        for (const squad of section) {
            if (!squad?.members) continue;
            for (const m of squad.members) { if (m.name) names.push(m.name); }
        }
    }
    // Wall uses string[] members
    if (Array.isArray(data.wall)) {
        for (const tower of data.wall) {
            if (tower?.members) {
                for (const name of tower.members) { if (name) names.push(name); }
            }
        }
    }
    return [...new Set(names)];
}

function todayStr() { return new Date().toISOString().split("T")[0]; }

type SectionTab = "attack" | "defense" | "wall";

export default function RosterPage() {
    const params = useParams();
    const baiyeId = params.id as string;
    const router = useRouter();

    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [members, setMembers] = useState<RosterMember[]>([]);
    const [options, setOptions] = useState<RosterOption[]>([]);
    const [rosterData, setRosterData] = useState<RosterData>(EMPTY_ROSTER_DATA());
    const [rosters, setRosters] = useState<Roster[]>([]);
    const [currentRosterId, setCurrentRosterId] = useState<string | null>(null);
    const [rosterName, setRosterName] = useState("排表");
    const [rosterDate, setRosterDate] = useState(todayStr());
    const [hasChanges, setHasChanges] = useState(false);
    const [activeTab, setActiveTab] = useState<SectionTab>("attack");
    const [showHistory, setShowHistory] = useState(false);

    const attackRef = useRef<HTMLDivElement>(null);
    const defenseRef = useRef<HTMLDivElement>(null);
    const wallRef = useRef<HTMLDivElement>(null);

    const isAdmin = user?.role === "admin" || user?.role === "vip";

    // Computed assigned sets
    const attackAssigned = rosterData.attack.flatMap((sq) => sq.members.map((m) => m.name));
    const defenseAssigned = rosterData.defense.flatMap((sq) => sq.members.map((m) => m.name));
    const globalAssigned = new Set([...attackAssigned, ...defenseAssigned]);
    const wallAssigned = new Set(
        Array.isArray(rosterData.wall)
            ? rosterData.wall.flatMap((t) => t.members || [])
            : []
    );

    /**
     * Build pool from roster data only.
     * Pool = names from current roster tables. If empty roster → empty pool.
     * After building, sync to DB for persistence (so history import can find them later).
     */
    const buildPoolFromRoster = async (data: RosterData) => {
        const namesFromRoster = extractNamesFromRoster(data);
        if (namesFromRoster.length === 0) {
            setMembers([]);
            return;
        }
        // Ensure they exist in DB
        await SupabaseService.batchAddRosterMembers(baiyeId, namesFromRoster);
        // Fetch from DB to get IDs, but only keep those from roster
        const allDb = await SupabaseService.getRosterMembers(baiyeId);
        const rosterSet = new Set(namesFromRoster);
        setMembers(allDb.filter((m) => rosterSet.has(m.name)).sort((a, b) => a.name.localeCompare(b.name)));
    };

    /** Load a specific roster (from history panel) */
    const loadRoster = async (roster: Roster) => {
        const data = normalizeRosterData(roster.roster_data || EMPTY_ROSTER_DATA());
        setCurrentRosterId(roster.id);
        setRosterName(roster.name);
        setRosterDate(roster.roster_date || todayStr());
        setRosterData(data);
        setHasChanges(false);
        setShowHistory(false);
        await buildPoolFromRoster(data);
    };

    /** Normalize old wall format (RosterSquad[]) to new WallTower[] + ensure attackColumns */
    function normalizeRosterData(data: RosterData): RosterData {
        let result = { ...data };

        // --- Normalize wall ---
        if (!result.wall || !Array.isArray(result.wall)) {
            result.wall = EMPTY_WALL();
        } else {
            const first = result.wall[0];
            if (first && typeof first === "object" && "name" in first && typeof (first as any).name === "string" && Array.isArray((first as any).members)) {
                if ((first as any).members.length === 0 || typeof (first as any).members[0] === "string") {
                    // Already new format
                }
            } else {
                // Old format: RosterSquad[] → convert
                const towerNames = ["上塔", "中塔", "下塔"];
                result.wall = towerNames.map((name, i) => {
                    const oldSquad = (data.wall as any)[i];
                    return {
                        name,
                        members: oldSquad?.members?.map((m: any) => m.name).filter(Boolean).slice(0, 3) || [],
                    };
                });
            }
        }

        // --- Ensure attackColumns (backward compat) ---
        if (!result.attackColumns) {
            // Find indices to remove (铁桶) from old shared columns
            const removedIndices: number[] = [];
            const derivedCols: string[] = [];
            result.columns.forEach((col, i) => {
                if (col.includes("铁桶")) {
                    removedIndices.push(i);
                } else {
                    let mapped = col;
                    if (col === "守塔") mapped = "打塔";
                    if (col === "守鹅") mapped = "打鹅";
                    if (col === "守车") mapped = "树团";
                    derivedCols.push(mapped);
                }
            });
            result.attackColumns = derivedCols;

            // Adjust attack squad member cells to match new column count
            if (removedIndices.length > 0) {
                result.attack = result.attack.map((squad) => ({
                    ...squad,
                    members: squad.members.map((m) => ({
                        ...m,
                        cells: m.cells.filter((_, ci) => !removedIndices.includes(ci)),
                    })),
                }));
            }
        }

        // Ensure attack member cells match attackColumns length
        const aCols = result.attackColumns!.length;
        result.attack = result.attack.map((squad) => ({
            ...squad,
            members: squad.members.map((m) => ({
                ...m,
                cells: m.cells.length === aCols ? m.cells : Array.from({ length: aCols }, (_, i) => m.cells[i] || { text: "", color: null }),
            })),
        }));

        // Ensure defense member cells match defense columns length
        const dCols = result.columns.length;
        result.defense = result.defense.map((squad) => ({
            ...squad,
            members: squad.members.map((m) => ({
                ...m,
                cells: m.cells.length === dCols ? m.cells : Array.from({ length: dCols }, (_, i) => m.cells[i] || { text: "", color: null }),
            })),
        }));

        return result;
    }

    useEffect(() => {
        const init = async () => {
            const u = await SupabaseService.getUser();
            if (!u) { router.push("/login"); return; }
            setUser(u);
            const b = await SupabaseService.getBaiye(baiyeId);
            if (!b) { router.push("/baiye"); return; }
            const [o, r] = await Promise.all([
                SupabaseService.getRosterOptions(baiyeId),
                SupabaseService.getRosters(baiyeId),
            ]);
            setOptions(o);
            setRosters(r);
            if (r.length > 0) {
                const latest = r[0];
                const data = normalizeRosterData(latest.roster_data || EMPTY_ROSTER_DATA());
                setCurrentRosterId(latest.id);
                setRosterName(latest.name);
                setRosterDate(latest.roster_date || todayStr());
                setRosterData(data);
                await buildPoolFromRoster(data);
            }
            // If no rosters → pool stays empty
            setLoading(false);
        };
        init();
    }, [router, baiyeId]);

    // Member pool handlers
    const handleAddMember = async (name: string) => {
        try {
            const m = await SupabaseService.addRosterMember(baiyeId, name);
            setMembers((prev) => [...prev, m].sort((a, b) => a.name.localeCompare(b.name)));
        } catch { /* ignore */ }
    };
    const handleRemoveMember = async (id: string) => {
        try { await SupabaseService.removeRosterMember(id); setMembers((prev) => prev.filter((m) => m.id !== id)); }
        catch { /* ignore */ }
    };
    const handleHistoryImport = async () => {
        try {
            const count = await SupabaseService.importMembersFromHistory(baiyeId);
            if (count > 0) {
                setMembers(await SupabaseService.getRosterMembers(baiyeId));
            }
        } catch { /* ignore */ }
    };
    const handleBatchAdd = async (names: string[]) => {
        const count = await SupabaseService.batchAddRosterMembers(baiyeId, names);
        if (count > 0) {
            setMembers(await SupabaseService.getRosterMembers(baiyeId));
        }
    };
    const handleRenameMember = async (id: string, newName: string) => {
        try {
            await SupabaseService.removeRosterMember(id);
            const m = await SupabaseService.addRosterMember(baiyeId, newName);
            setMembers((prev) => prev.filter((x) => x.id !== id).concat(m).sort((a, b) => a.name.localeCompare(b.name)));
        } catch { /* ignore */ }
    };

    // Options handlers
    const handleAddOption = async (label: string, color?: string, category?: string) => {
        try { const o = await SupabaseService.addRosterOption(baiyeId, label, color, category || 'general'); setOptions((prev) => [...prev, o]); }
        catch { /* ignore */ }
    };
    const handleDeleteOption = async (id: string) => {
        try { await SupabaseService.deleteRosterOption(id); setOptions((prev) => prev.filter((o) => o.id !== id)); }
        catch { /* ignore */ }
    };
    const handleUpdateOption = async (id: string, updates: { label?: string; color?: string | null }) => {
        try { await SupabaseService.updateRosterOption(id, updates); setOptions((prev) => prev.map((o) => o.id === id ? { ...o, ...updates } : o)); }
        catch { /* ignore */ }
    };

    // Table data handlers
    const handleAttackColumnsChange = (cols: string[]) => { setRosterData((prev) => ({ ...prev, attackColumns: cols })); setHasChanges(true); };
    const handleDefenseColumnsChange = (cols: string[]) => { setRosterData((prev) => ({ ...prev, columns: cols })); setHasChanges(true); };
    const handleSquadsChange = (section: "attack" | "defense") => (squads: RosterSquad[]) => {
        setRosterData((prev) => ({ ...prev, [section]: squads }));
        setHasChanges(true);
    };
    const handleWallChange = (wall: WallTower[]) => {
        setRosterData((prev) => ({ ...prev, wall }));
        setHasChanges(true);
    };

    // Save (upsert by date)
    const handleSave = async () => {
        if (!user || !rosterDate) return;
        setSaving(true);
        try {
            const r = await SupabaseService.upsertRosterByDate(baiyeId, rosterDate, rosterName, rosterData, user.id);
            setCurrentRosterId(r.id);
            setRosters(await SupabaseService.getRosters(baiyeId));
            setHasChanges(false);
        } catch { /* ignore */ }
        finally { setSaving(false); }
    };

    const handleNew = () => {
        setCurrentRosterId(null); setRosterName("排表"); setRosterDate(todayStr());
        setRosterData(EMPTY_ROSTER_DATA()); setMembers([]); setHasChanges(false);
    };

    const handleDeleteRoster = async (rosterId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!confirm("确定要删除这条历史排表吗？")) return;
        try {
            await SupabaseService.deleteRoster(rosterId);
            setRosters((prev) => prev.filter((r) => r.id !== rosterId));
            if (currentRosterId === rosterId) {
                handleNew();
            }
        } catch { /* ignore */ }
    };

    // Export
    const handleExport = async (section: SectionTab) => {
        const refMap = { attack: attackRef, defense: defenseRef, wall: wallRef };
        const el = refMap[section].current;
        if (!el) return;
        const noExport = el.querySelectorAll("[data-no-export]");
        noExport.forEach((n) => (n as HTMLElement).style.display = "none");
        try {
            const { default: html2canvas } = await import("html2canvas");
            const canvas = await html2canvas(el, { backgroundColor: "#ffffff", scale: 2 });
            const link = document.createElement("a");
            const labels = { attack: "进攻", defense: "防守", wall: "人墙" };
            link.download = `${rosterDate}_${rosterName}_${labels[section]}.png`;
            link.href = canvas.toDataURL("image/png");
            link.click();
        } finally { noExport.forEach((n) => (n as HTMLElement).style.display = ""); }
    };

    const memberNames = members.map((m) => m.name);

    const TAB_CONFIG: { key: SectionTab; label: string; emoji: string; color: string }[] = [
        { key: "attack", label: "进攻", emoji: "⚔️", color: "from-red-600 to-orange-600" },
        { key: "defense", label: "防守", emoji: "🛡️", color: "from-blue-600 to-cyan-600" },
        { key: "wall", label: "人墙", emoji: "🧱", color: "from-purple-600 to-pink-600" },
    ];

    // Format date as MM-DD
    const dateMMDD = rosterDate ? (() => { const parts = rosterDate.split("-"); return parts.length >= 3 ? `${parts[1]}-${parts[2]}` : rosterDate; })() : "";

    if (loading) return <div className="min-h-screen bg-neutral-900 flex items-center justify-center text-white">正在加载...</div>;

    return (
        <main className="min-h-screen bg-neutral-900 text-white">
            <header className="sticky top-0 z-40 bg-neutral-900/95 backdrop-blur border-b-4 border-black px-4 py-3">
                <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                        <button onClick={() => router.push(`/baiye/${baiyeId}/hall`)} className="text-xs text-neutral-500 hover:text-white">← 返回</button>
                        <h1 className="text-xl font-bold text-yellow-500 uppercase">📋 排表工具</h1>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                        {isAdmin && (
                            <input value={rosterName} onChange={(e) => { setRosterName(e.target.value); setHasChanges(true); }}
                                className="w-24 bg-neutral-800 border-2 border-neutral-700 px-2 py-1 text-xs text-white focus:border-yellow-500 outline-none" placeholder="名称" />
                        )}
                        <input type="date" value={rosterDate} onChange={(e) => { setRosterDate(e.target.value); setHasChanges(true); }}
                            className="bg-neutral-800 border-2 border-neutral-700 px-2 py-1 text-xs text-white focus:border-yellow-500 outline-none" />
                        {hasChanges && <span className="text-[10px] text-yellow-500 animate-pulse">● 未保存</span>}
                        {isAdmin && <PixelButton size="sm" onClick={handleSave} isLoading={saving}>💾 保存</PixelButton>}
                        <button onClick={() => handleExport(activeTab)} className="px-2 py-1 text-xs font-bold border-2 border-green-700 bg-green-600 text-white hover:bg-green-500">📷 导出</button>
                    </div>
                </div>
            </header>

            <div className="max-w-7xl mx-auto p-4">
                <div className="flex flex-col lg:flex-row gap-4">
                    <div className="w-full lg:w-48 shrink-0 space-y-3">
                        <div className="lg:sticky lg:top-20 space-y-3 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto">
                            {/* History */}
                            <PixelCard className="bg-neutral-800">
                                <button onClick={() => setShowHistory(!showHistory)}
                                    className="w-full text-left text-sm font-bold text-yellow-400 uppercase flex justify-between items-center">
                                    <span>📅 历史排表</span>
                                    <span className="text-[10px] text-neutral-600">{showHistory ? "▼" : "▶"} {rosters.length}</span>
                                </button>
                                {showHistory && (
                                    <div className="mt-2 space-y-1 max-h-[200px] overflow-y-auto">
                                        {isAdmin && (
                                            <button onClick={handleNew}
                                                className="w-full px-2 py-1.5 text-[10px] font-bold border-2 border-dashed border-neutral-600 text-neutral-400 hover:text-white hover:border-yellow-500">
                                                ＋ 新建空白
                                            </button>
                                        )}
                                        {rosters.map((r) => (
                                            <div key={r.id} className="group relative">
                                                <button onClick={() => loadRoster(r)}
                                                    className={`w-full px-2 py-1.5 text-left text-[11px] border-2 transition-colors ${
                                                        currentRosterId === r.id ? "border-yellow-500 bg-yellow-500/10 text-yellow-400" : "border-neutral-700 text-neutral-400 hover:text-white hover:border-neutral-500"
                                                    }`}>
                                                    <div className="font-bold">{r.roster_date}</div>
                                                    <div className="text-[9px] text-neutral-500">{r.name}</div>
                                                </button>
                                                {isAdmin && (
                                                    <button
                                                        onClick={(e) => handleDeleteRoster(r.id, e)}
                                                        className="absolute top-1 right-1 w-5 h-5 flex items-center justify-center text-[10px] text-neutral-600 hover:text-red-400 hover:bg-red-400/10 rounded opacity-0 group-hover:opacity-100 transition-all"
                                                        title="删除此排表">
                                                        ✕
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                        {rosters.length === 0 && <div className="text-[10px] text-neutral-600 text-center py-2">暂无</div>}
                                    </div>
                                )}
                            </PixelCard>

                            <RosterPlayerPool
                                members={members}
                                assignedNames={globalAssigned}
                                isAdmin={isAdmin}
                                onAddMember={handleAddMember}
                                onRemoveMember={handleRemoveMember}
                                onHistoryImport={handleHistoryImport}
                                onBatchAdd={handleBatchAdd}
                                onRenameMember={handleRenameMember}
                            />
                            {isAdmin && (
                                <RosterOptionsManager options={options} onAdd={handleAddOption} onDelete={handleDeleteOption} onUpdate={handleUpdateOption} />
                            )}
                        </div>
                    </div>

                    <div className="flex-1 min-w-0 space-y-4">
                        <div className="flex gap-1.5" style={{ transition: "all 0.3s ease" }}>
                            {TAB_CONFIG.map((t) => {
                                const isActive = activeTab === t.key;
                                return (
                                    <button key={t.key} onClick={() => setActiveTab(t.key)}
                                        style={{ flex: isActive ? 5 : 1, transition: "flex 0.3s ease" }}
                                        className={`py-2.5 font-bold border-4 border-black shadow-[2px_2px_0_0_#000] active:shadow-none active:translate-x-[1px] active:translate-y-[1px] whitespace-nowrap overflow-hidden ${
                                            isActive ? `bg-gradient-to-r ${t.color} text-white text-base` : "bg-neutral-800 text-neutral-500 hover:text-white text-xs"
                                        }`}>
                                        {isActive
                                            ? <>{t.emoji} {t.label} <span className="ml-1 text-sm opacity-80">{dateMMDD}</span></>
                                            : <>{t.emoji}<span className="hidden sm:inline"> {t.label}</span></>}
                                    </button>
                                );
                            })}
                        </div>
                        <div className="overflow-x-auto">
                            <div style={{ display: activeTab === "attack" ? "block" : "none" }}>
                                <RosterTable ref={attackRef} title="进攻" emoji="⚔️" columns={rosterData.attackColumns || rosterData.columns} squads={rosterData.attack}
                                    isAdmin={isAdmin} options={options} availableMembers={memberNames} globalAssignedNames={globalAssigned}
                                    onColumnsChange={handleAttackColumnsChange} onSquadsChange={handleSquadsChange("attack")} headerColor="#fdd" />
                            </div>
                            <div style={{ display: activeTab === "defense" ? "block" : "none" }}>
                                <RosterTable ref={defenseRef} title="防守" emoji="🛡️" columns={rosterData.columns} squads={rosterData.defense}
                                    isAdmin={isAdmin} options={options} availableMembers={memberNames} globalAssignedNames={globalAssigned}
                                    onColumnsChange={handleDefenseColumnsChange} onSquadsChange={handleSquadsChange("defense")} headerColor="#ddf" />
                            </div>
                            <div style={{ display: activeTab === "wall" ? "block" : "none" }}>
                                <RosterWall ref={wallRef} towers={rosterData.wall} isAdmin={isAdmin}
                                    availableMembers={memberNames} wallAssignedNames={wallAssigned} globalAssignedNames={globalAssigned}
                                    onTowersChange={handleWallChange} />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </main>
    );
}

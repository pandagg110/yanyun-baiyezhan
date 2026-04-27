"use client";

import { RosterOptionsManager } from "@/components/feature/roster-options-manager";
import { RosterPlayerPool } from "@/components/feature/roster-player-pool";
import { RosterTable } from "@/components/feature/roster-table";
import { PixelButton } from "@/components/pixel/pixel-button";
import { PixelCard } from "@/components/pixel/pixel-card";
import { SupabaseService } from "@/services/supabase-service";
import { Baiye, Roster, RosterData, RosterMember, RosterOption, RosterSquad, User } from "@/types/app";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

const DEFAULT_COLUMNS = [
    "守塔", "守跳", "守车", "开局规划",
    "塌掉后守跳", "守车", "铁桶",
    "普通小野", "特殊情况野区规划"
];

const EMPTY_SQUAD = (): RosterSquad => ({ members: [], colorNote: "花脸色标点" });

const EMPTY_ROSTER_DATA = (): RosterData => ({
    columns: [...DEFAULT_COLUMNS],
    attack: [EMPTY_SQUAD(), EMPTY_SQUAD(), EMPTY_SQUAD()],
    defense: [EMPTY_SQUAD(), EMPTY_SQUAD(), EMPTY_SQUAD()],
    wall: [EMPTY_SQUAD(), EMPTY_SQUAD(), EMPTY_SQUAD()],
});

function deepClone<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj));
}

type SectionTab = "attack" | "defense" | "wall";

export default function RosterPage() {
    const params = useParams();
    const baiyeId = params.id as string;
    const router = useRouter();

    const [user, setUser] = useState<User | null>(null);
    const [baiye, setBaiye] = useState<Baiye | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [members, setMembers] = useState<RosterMember[]>([]);
    const [options, setOptions] = useState<RosterOption[]>([]);
    const [rosterData, setRosterData] = useState<RosterData>(EMPTY_ROSTER_DATA());
    const [rosters, setRosters] = useState<Roster[]>([]);
    const [currentRosterId, setCurrentRosterId] = useState<string | null>(null);
    const [rosterName, setRosterName] = useState("排表");
    const [hasChanges, setHasChanges] = useState(false);
    const [activeTab, setActiveTab] = useState<SectionTab>("attack");
    const [showRosterList, setShowRosterList] = useState(false);

    const attackRef = useRef<HTMLDivElement>(null);
    const defenseRef = useRef<HTMLDivElement>(null);
    const wallRef = useRef<HTMLDivElement>(null);

    const isAdmin = user?.role === "admin" || user?.role === "vip";

    useEffect(() => {
        const init = async () => {
            const u = await SupabaseService.getUser();
            if (!u) { router.push("/login"); return; }
            setUser(u);
            const b = await SupabaseService.getBaiye(baiyeId);
            if (!b) { router.push("/baiye"); return; }
            setBaiye(b);
            const [m, o, r] = await Promise.all([
                SupabaseService.getRosterMembers(baiyeId),
                SupabaseService.getRosterOptions(baiyeId),
                SupabaseService.getRosters(baiyeId),
            ]);
            setMembers(m);
            setOptions(o);
            setRosters(r);
            if (r.length > 0) {
                setCurrentRosterId(r[0].id);
                setRosterName(r[0].name);
                setRosterData(r[0].roster_data || EMPTY_ROSTER_DATA());
            }
            setLoading(false);
        };
        init();
    }, [router, baiyeId]);

    // Member pool handlers
    const handleAddMember = async (name: string) => {
        try {
            const m = await SupabaseService.addRosterMember(baiyeId, name);
            setMembers((prev) => [...prev, m].sort((a, b) => a.name.localeCompare(b.name)));
        } catch { alert("添加失败或已存在"); }
    };
    const handleRemoveMember = async (id: string) => {
        try { await SupabaseService.removeRosterMember(id); setMembers((prev) => prev.filter((m) => m.id !== id)); } catch { alert("删除失败"); }
    };
    const handleImport = async () => {
        try {
            const count = await SupabaseService.importMembersFromMatchStats(baiyeId);
            if (count > 0) { alert(`导入 ${count} 名`); setMembers(await SupabaseService.getRosterMembers(baiyeId)); }
            else alert("无新成员可导入");
        } catch { alert("导入失败"); }
    };

    // Options handlers
    const handleAddOption = async (label: string, color?: string) => {
        try {
            const o = await SupabaseService.addRosterOption(baiyeId, label, color);
            setOptions((prev) => [...prev, o]);
        } catch { alert("添加失败或已存在"); }
    };
    const handleDeleteOption = async (id: string) => {
        try { await SupabaseService.deleteRosterOption(id); setOptions((prev) => prev.filter((o) => o.id !== id)); }
        catch { alert("删除失败"); }
    };

    // Table data handlers
    const handleColumnsChange = (cols: string[]) => {
        setRosterData((prev) => ({ ...prev, columns: cols }));
        setHasChanges(true);
    };
    const handleSquadsChange = (section: SectionTab) => (squads: RosterSquad[]) => {
        setRosterData((prev) => ({ ...prev, [section]: squads }));
        setHasChanges(true);
    };

    // Save / Load
    const handleSave = async () => {
        if (!user) return;
        setSaving(true);
        try {
            if (currentRosterId) {
                await SupabaseService.updateRoster(currentRosterId, { name: rosterName, roster_data: rosterData });
            } else {
                const r = await SupabaseService.createRoster(baiyeId, rosterName, rosterData, user.id);
                setCurrentRosterId(r.id);
            }
            setRosters(await SupabaseService.getRosters(baiyeId));
            setHasChanges(false);
            alert("排表已保存！");
        } catch (e: any) { alert("保存失败: " + e.message); }
        finally { setSaving(false); }
    };

    const handleLoad = (r: Roster) => {
        setCurrentRosterId(r.id);
        setRosterName(r.name);
        setRosterData(r.roster_data || EMPTY_ROSTER_DATA());
        setShowRosterList(false);
        setHasChanges(false);
    };
    const handleNew = () => { setCurrentRosterId(null); setRosterName("新排表"); setRosterData(EMPTY_ROSTER_DATA()); setShowRosterList(false); setHasChanges(false); };
    const handleDeleteRoster = async (id: string) => {
        if (!confirm("确定删除？")) return;
        try { await SupabaseService.deleteRoster(id); setRosters(await SupabaseService.getRosters(baiyeId)); if (currentRosterId === id) handleNew(); }
        catch { alert("删除失败"); }
    };

    // Export as image
    const handleExport = async (section: SectionTab) => {
        const refMap = { attack: attackRef, defense: defenseRef, wall: wallRef };
        const el = refMap[section].current;
        if (!el) return;
        // Hide admin-only elements
        const noExport = el.querySelectorAll("[data-no-export]");
        noExport.forEach((n) => (n as HTMLElement).style.display = "none");
        try {
            const { default: html2canvas } = await import("html2canvas");
            const canvas = await html2canvas(el, { backgroundColor: "#ffffff", scale: 2 });
            const link = document.createElement("a");
            const labels = { attack: "进攻", defense: "防守", wall: "人墙" };
            link.download = `${rosterName}_${labels[section]}.png`;
            link.href = canvas.toDataURL("image/png");
            link.click();
        } finally {
            noExport.forEach((n) => (n as HTMLElement).style.display = "");
        }
    };

    const memberNames = members.map((m) => m.name);

    const TAB_CONFIG: { key: SectionTab; label: string; emoji: string; color: string; headerColor: string }[] = [
        { key: "attack", label: "进攻", emoji: "⚔️", color: "from-red-600 to-orange-600", headerColor: "#fdd" },
        { key: "defense", label: "防守", emoji: "🛡️", color: "from-blue-600 to-cyan-600", headerColor: "#ddf" },
        { key: "wall", label: "人墙", emoji: "🧱", color: "from-purple-600 to-pink-600", headerColor: "#ede" },
    ];

    if (loading) return <div className="min-h-screen bg-neutral-900 flex items-center justify-center text-white">正在加载...</div>;

    const tabConf = TAB_CONFIG.find((t) => t.key === activeTab)!;

    return (
        <main className="min-h-screen bg-neutral-900 text-white">
            {/* Roster list modal */}
            {showRosterList && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <PixelCard className="bg-neutral-800 max-w-md w-full space-y-3 max-h-[80vh] overflow-y-auto">
                        <div className="flex justify-between items-center text-lg font-bold text-yellow-400 uppercase border-b-2 border-yellow-400/20 pb-2">
                            <span>📂 排表列表</span>
                            <button onClick={() => setShowRosterList(false)} className="text-neutral-500 hover:text-white text-sm">✕</button>
                        </div>
                        {isAdmin && <button onClick={handleNew} className="w-full px-3 py-2 text-xs font-bold border-2 border-dashed border-neutral-600 text-neutral-400 hover:text-white hover:border-yellow-500 transition-colors">＋ 新建空白排表</button>}
                        {rosters.length === 0 ? <div className="text-xs text-neutral-600 text-center py-4">暂无排表</div> : (
                            <div className="space-y-2">
                                {rosters.map((r) => (
                                    <div key={r.id} className={`border-2 p-2 flex items-center justify-between ${currentRosterId === r.id ? "border-yellow-500 bg-yellow-500/10" : "border-neutral-700"}`}>
                                        <div>
                                            <div className="text-sm font-bold">{r.name}</div>
                                            <div className="text-[10px] text-neutral-500">{new Date(r.updated_at || r.created_at).toLocaleString("zh-CN")}</div>
                                        </div>
                                        <div className="flex gap-1">
                                            <button onClick={() => handleLoad(r)} className="px-2 py-1 text-[10px] font-bold border border-neutral-600 bg-neutral-700 text-white hover:bg-neutral-600">加载</button>
                                            {isAdmin && <button onClick={() => handleDeleteRoster(r.id)} className="px-2 py-1 text-[10px] font-bold border border-red-800 text-red-400 hover:bg-red-900/30">删除</button>}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </PixelCard>
                </div>
            )}

            {/* Header */}
            <header className="sticky top-0 z-40 bg-neutral-900/95 backdrop-blur border-b-4 border-black px-4 py-3">
                <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                        <button onClick={() => router.push(`/baiye/${baiyeId}/hall`)} className="text-xs text-neutral-500 hover:text-white">← 返回</button>
                        <h1 className="text-xl font-bold text-yellow-500 uppercase">📋 排表工具</h1>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                        {isAdmin ? (
                            <input value={rosterName} onChange={(e) => { setRosterName(e.target.value); setHasChanges(true); }}
                                className="w-32 bg-neutral-800 border-2 border-neutral-700 px-2 py-1 text-xs text-white focus:border-yellow-500 outline-none" placeholder="排表名称" />
                        ) : <span className="text-sm text-neutral-300">{rosterName}</span>}
                        {hasChanges && <span className="text-[10px] text-yellow-500">● 未保存</span>}
                        <button onClick={() => setShowRosterList(true)} className="px-2 py-1 text-xs font-bold border-2 border-neutral-600 bg-neutral-700 text-white hover:bg-neutral-600">📂</button>
                        {isAdmin && <PixelButton size="sm" onClick={handleSave} isLoading={saving}>💾 保存</PixelButton>}
                        <button onClick={() => handleExport(activeTab)} className="px-2 py-1 text-xs font-bold border-2 border-green-700 bg-green-600 text-white hover:bg-green-500" title="导出当前页为图片">📷 导出</button>
                    </div>
                </div>
            </header>

            <div className="max-w-7xl mx-auto p-4">
                <div className="flex flex-col lg:flex-row gap-4">
                    {/* Left sidebar */}
                    <div className="w-full lg:w-52 shrink-0 space-y-3">
                        <div className="lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] space-y-3">
                            <RosterPlayerPool
                                members={members}
                                assignedNames={new Set()}
                                isAdmin={isAdmin}
                                onAddMember={handleAddMember}
                                onRemoveMember={handleRemoveMember}
                                onImportFromStats={handleImport}
                            />
                            {isAdmin && (
                                <RosterOptionsManager
                                    options={options}
                                    onAdd={handleAddOption}
                                    onDelete={handleDeleteOption}
                                />
                            )}
                        </div>
                    </div>

                    {/* Main content */}
                    <div className="flex-1 min-w-0 space-y-4">
                        {/* Section tabs */}
                        <div className="flex gap-2">
                            {TAB_CONFIG.map((t) => (
                                <button
                                    key={t.key}
                                    onClick={() => setActiveTab(t.key)}
                                    className={`flex-1 py-2 text-sm font-bold border-4 border-black transition-all shadow-[2px_2px_0_0_#000] active:shadow-none active:translate-x-[1px] active:translate-y-[1px] ${
                                        activeTab === t.key
                                            ? `bg-gradient-to-r ${t.color} text-white`
                                            : "bg-neutral-800 text-neutral-500 hover:text-white"
                                    }`}
                                >
                                    {t.emoji} {t.label}
                                </button>
                            ))}
                        </div>

                        {/* Table */}
                        <div className="overflow-x-auto">
                            <div style={{ display: activeTab === "attack" ? "block" : "none" }}>
                                <RosterTable ref={attackRef} title="进攻" emoji="⚔️" columns={rosterData.columns} squads={rosterData.attack}
                                    isAdmin={isAdmin} options={options} availableMembers={memberNames}
                                    onColumnsChange={handleColumnsChange} onSquadsChange={handleSquadsChange("attack")} headerColor="#fdd" />
                            </div>
                            <div style={{ display: activeTab === "defense" ? "block" : "none" }}>
                                <RosterTable ref={defenseRef} title="防守" emoji="🛡️" columns={rosterData.columns} squads={rosterData.defense}
                                    isAdmin={isAdmin} options={options} availableMembers={memberNames}
                                    onColumnsChange={handleColumnsChange} onSquadsChange={handleSquadsChange("defense")} headerColor="#ddf" />
                            </div>
                            <div style={{ display: activeTab === "wall" ? "block" : "none" }}>
                                <RosterTable ref={wallRef} title="人墙" emoji="🧱" columns={rosterData.columns} squads={rosterData.wall}
                                    isAdmin={isAdmin} options={options} availableMembers={memberNames}
                                    onColumnsChange={handleColumnsChange} onSquadsChange={handleSquadsChange("wall")} headerColor="#ede" />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </main>
    );
}

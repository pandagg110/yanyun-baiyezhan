"use client";

import { PixelButton } from "@/components/pixel/pixel-button";
import { PixelCard } from "@/components/pixel/pixel-card";
import { PixelInput } from "@/components/pixel/pixel-input";
import { SupabaseService } from "@/services/supabase-service";
import { Baiye, Match, OcrMatchResult, User } from "@/types/app";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

type Step = "match-info" | "upload-ocr" | "done";

interface PlayerRow {
    player_name: string;
    kills: number;
    assists: number;
    deaths: number;
    coins: number;
    damage: number;
    damage_taken: number;
    healing: number;
    building_damage: number;
}

const STAT_COLS: { key: keyof PlayerRow; label: string }[] = [
    { key: "kills", label: "击败" },
    { key: "assists", label: "助攻" },
    { key: "deaths", label: "重伤" },
    { key: "coins", label: "逗币" },
    { key: "damage", label: "输出" },
    { key: "damage_taken", label: "承伤" },
    { key: "healing", label: "治疗" },
    { key: "building_damage", label: "建筑" },
];

export default function StatsUploadPage() {
    const params = useParams();
    const baiyeId = params.id as string;
    const router = useRouter();

    const [user, setUser] = useState<User | null>(null);
    const [baiye, setBaiye] = useState<Baiye | null>(null);
    const [loading, setLoading] = useState(true);

    // Step control
    const [step, setStep] = useState<Step>("match-info");

    // Step 1: Match Info
    const [teamA, setTeamA] = useState("");
    const [teamB, setTeamB] = useState("");
    const [startTime, setStartTime] = useState(
        new Date(Date.now() - 30 * 60000).toISOString().slice(0, 16)
    );
    const [winner, setWinner] = useState<string | null>(null);
    const [matchType, setMatchType] = useState("排位");
    const [coinValue, setCoinValue] = useState(660);
    const [notes, setNotes] = useState("");

    const [isChecking, setIsChecking] = useState(false);
    const [checkError, setCheckError] = useState<string | null>(null);
    const [matchRecord, setMatchRecord] = useState<Match | null>(null);
    const [matchStatus, setMatchStatus] = useState<"created" | "exists" | null>(null);
    const [submittedTeams, setSubmittedTeams] = useState<string[]>([]);

    // Step 2: Team selection + Upload + OCR
    const [selectedTeam, setSelectedTeam] = useState<string>(""); // which team we're submitting for
    const [imageFiles, setImageFiles] = useState<File[]>([]);
    const [imagePreviews, setImagePreviews] = useState<string[]>([]);
    const [uploadedUrls, setUploadedUrls] = useState<string[]>([]);
    const [isOcring, setIsOcring] = useState(false);
    const [ocrError, setOcrError] = useState<string | null>(null);
    const [players, setPlayers] = useState<PlayerRow[]>([]);
    const [ocrDone, setOcrDone] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const dropRef = useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = useState(false);

    // Step 3: Done
    const [savedMatchId, setSavedMatchId] = useState<string | null>(null);

    // ── Init ──
    useEffect(() => {
        const init = async () => {
            const u = await SupabaseService.getUser();
            if (!u) { router.push("/login"); return; }
            setUser(u);

            const b = await SupabaseService.getBaiye(baiyeId);
            if (!b) { router.push("/baiye"); return; }
            setBaiye(b);
            setTeamA(b.name);
            setLoading(false);
        };
        init();
    }, [router, baiyeId]);

    // ── File handling ──
    const processFiles = useCallback((files: FileList | File[]) => {
        const fileArray = Array.from(files).filter((f) => f.type.startsWith("image/"));
        if (fileArray.length === 0) return;
        fileArray.forEach((file) => {
            setImageFiles((prev) => [...prev, file]);
            const reader = new FileReader();
            reader.onload = (e) => {
                setImagePreviews((prev) => [...prev, e.target?.result as string]);
            };
            reader.readAsDataURL(file);
        });
    }, []);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) processFiles(e.target.files);
    };
    const removeImage = (index: number) => {
        setImageFiles((prev) => prev.filter((_, i) => i !== index));
        setImagePreviews((prev) => prev.filter((_, i) => i !== index));
    };

    // ── Drag & Drop ──
    const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
    const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); };
    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault(); setIsDragging(false);
        if (e.dataTransfer.files) processFiles(e.dataTransfer.files);
    };

    // ── Step 1: Check/Create Match ──
    const handleCheckMatch = async () => {
        if (!teamA.trim() || !teamB.trim()) return alert("请输入双方百业名称");
        if (!startTime) return alert("请选择对战开始时间");

        setIsChecking(true);
        setCheckError(null);

        try {
            const { data: { session } } = await SupabaseService.getSession();
            const token = session?.access_token;

            const res = await fetch("/api/matches", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({
                    team_a: teamA.trim(),
                    team_b: teamB.trim(),
                    match_start_time: new Date(startTime).toISOString(),
                    match_type: matchType,
                    coin_value: coinValue,
                    winner: winner,
                    baiye_id: baiyeId,
                    notes: notes.trim() || undefined,
                    created_by: user?.id,
                }),
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || `HTTP ${res.status}`);
            }

            const data = await res.json();
            setMatchRecord(data.match);
            setMatchStatus(data.status);
            setSubmittedTeams(data.submitted_teams || []);

            // Pre-select team: default to our baiye name if not yet submitted
            const ourName = teamA.trim();
            if (!data.submitted_teams?.includes(ourName)) {
                setSelectedTeam(ourName);
            } else {
                // Our team already submitted, suggest the other team
                const otherName = teamB.trim();
                if (!data.submitted_teams?.includes(otherName)) {
                    setSelectedTeam(otherName);
                } else {
                    setSelectedTeam(""); // both submitted
                }
            }

            setStep("upload-ocr");
        } catch (err: unknown) {
            setCheckError(err instanceof Error ? err.message : "操作失败");
        } finally {
            setIsChecking(false);
        }
    };

    // ── Step 2: Upload + OCR ──
    const runOcr = async () => {
        if (imageFiles.length === 0) return;
        if (!selectedTeam) return alert("请先选择数据所属队伍");

        setIsOcring(true);
        setOcrError(null);

        try {
            const urls: string[] = [];
            for (const file of imageFiles) {
                const url = await SupabaseService.uploadFile(file, 'screenshots');
                urls.push(url);
            }
            setUploadedUrls(urls);

            const res = await fetch("/api/ocr", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ imageUrls: urls }),
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || `HTTP ${res.status}`);
            }

            const { data } = (await res.json()) as { data: OcrMatchResult };
            if (data.players && data.players.length > 0) {
                setPlayers(data.players.map((p) => ({
                    player_name: p.player_name || "",
                    kills: p.kills || 0,
                    assists: p.assists || 0,
                    deaths: p.deaths || 0,
                    coins: p.coins || 0,
                    damage: p.damage || 0,
                    damage_taken: p.damage_taken || 0,
                    healing: p.healing || 0,
                    building_damage: p.building_damage || 0,
                })));
            }
            setOcrDone(true);
        } catch (err: unknown) {
            setOcrError(err instanceof Error ? err.message : "OCR 失败");
        } finally {
            setIsOcring(false);
        }
    };

    // ── Step 2: Save Stats ──
    const handleSaveStats = async () => {
        if (players.length === 0) return alert("没有玩家数据可保存");
        if (!matchRecord) return;
        if (!selectedTeam) return alert("请先选择数据所属队伍");

        setIsSaving(true);
        setSaveError(null);

        try {
            const { data: { session } } = await SupabaseService.getSession();
            const token = session?.access_token;

            const res = await fetch("/api/matches", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({
                    match_id: matchRecord.id,
                    team_name: selectedTeam,
                    players: players,
                    screenshot_urls: uploadedUrls.length > 0 ? uploadedUrls : undefined,
                }),
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || `HTTP ${res.status}`);
            }

            setSavedMatchId(matchRecord.id);
            setStep("done");
        } catch (err: unknown) {
            setSaveError(err instanceof Error ? err.message : "保存失败");
        } finally {
            setIsSaving(false);
        }
    };

    // Helper: are both teams done?
    const bothTeamsSubmitted = submittedTeams.length >= 2;
    const currentTeamSubmitted = selectedTeam ? submittedTeams.includes(selectedTeam) : false;

    // Permission check: only VIP and Admin can submit
    const canSubmit = user?.role === 'admin' || user?.role === 'vip';

    if (loading) {
        return (
            <div className="min-h-screen bg-neutral-900 flex items-center justify-center text-white">
                正在加载...
            </div>
        );
    }

    if (!canSubmit) {
        return (
            <main className="min-h-screen bg-neutral-900 text-white flex flex-col items-center justify-center p-8">
                <div className="text-5xl mb-6">🔒</div>
                <h2 className="text-2xl font-bold text-yellow-500 mb-3">权限不足</h2>
                <p className="text-neutral-400 text-sm mb-6">仅 VIP 和管理员可以录入对战数据</p>
                <PixelButton onClick={() => router.push(`/baiye/${baiyeId}/hall`)}>
                    ← 返回大厅
                </PixelButton>
            </main>
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
                        📊 百业战录入
                    </h1>
                    <p className="text-xs text-neutral-500">{baiye?.name} · 上传截图自动识别</p>
                </div>
                <span className="text-xs text-neutral-500 font-bold uppercase">
                    [ {user?.character_name} ]
                </span>
            </header>

            {/* Step Indicator */}
            <div className="max-w-6xl mx-auto mb-8">
                <div className="flex items-center gap-2 text-sm">
                    {[
                        { id: "match-info", label: "① 对战信息" },
                        { id: "upload-ocr", label: "② 选队伍 & 上传" },
                        { id: "done", label: "③ 完成" },
                    ].map((s, i) => (
                        <div key={s.id} className="flex items-center gap-2">
                            {i > 0 && <div className="w-8 h-0.5 bg-neutral-700" />}
                            <div className={`px-3 py-1 border-2 font-bold uppercase text-xs transition-all ${step === s.id
                                ? "bg-yellow-500 text-black border-yellow-600"
                                : "bg-neutral-800 text-neutral-600 border-neutral-700"
                                }`}>
                                {s.label}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <div className="max-w-6xl mx-auto">
                {/* ═══════ Step 1: Match Info ═══════ */}
                {step === "match-info" && (
                    <div className="space-y-6">
                        <PixelCard className="bg-neutral-800 space-y-4">
                            <h3 className="text-lg font-bold text-yellow-500 uppercase border-b-2 border-yellow-500/20 pb-2">
                                对战信息
                            </h3>

                            <div className="flex items-center gap-4">
                                <div className="flex-1">
                                    <PixelInput label="百业 A" placeholder="百业A名称" value={teamA} onChange={(e) => setTeamA(e.target.value)} />
                                </div>
                                <div className="text-2xl font-black text-yellow-500 mt-6">VS</div>
                                <div className="flex-1">
                                    <PixelInput label="百业 B" placeholder="输入对手百业名称" value={teamB} onChange={(e) => setTeamB(e.target.value)} />
                                </div>
                            </div>

                            <div>
                                <label className="text-sm font-bold uppercase tracking-wider text-neutral-400 block mb-2">
                                    对战开始时间
                                </label>
                                <input
                                    type="datetime-local"
                                    value={startTime}
                                    onChange={(e) => setStartTime(e.target.value)}
                                    className="w-full bg-neutral-900 border-2 border-neutral-700 rounded p-2 text-sm text-white focus:border-yellow-500 outline-none"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-bold uppercase tracking-wider text-neutral-400">
                                    对战类型
                                </label>
                                <div className="flex gap-2">
                                    {["排位", "正赛", "约战"].map((t) => (
                                        <button
                                            key={t}
                                            onClick={() => setMatchType(t)}
                                            className={`flex-1 py-2.5 text-sm font-bold border-2 transition-all ${matchType === t
                                                ? "bg-yellow-500 border-yellow-600 text-black shadow-[2px_2px_0_0_#000]"
                                                : "bg-neutral-700 text-neutral-400 border-neutral-600 hover:border-neutral-500"
                                                }`}
                                        >
                                            {t === "排位" ? "🏅" : t === "正赛" ? "⚔️" : "🤝"} {t}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-bold uppercase tracking-wider text-neutral-400">
                                    💰 野怪价值
                                </label>
                                <input
                                    type="number"
                                    value={coinValue}
                                    onChange={(e) => setCoinValue(Number(e.target.value) || 660)}
                                    min={0}
                                    step={10}
                                    className="w-full bg-neutral-900 border-2 border-neutral-700 rounded p-2 text-sm text-white focus:border-yellow-500 outline-none"
                                />
                                <p className="text-[10px] text-neutral-600">默认660，后续可能调整</p>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-bold uppercase tracking-wider text-neutral-400">
                                    胜利方
                                </label>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setWinner(teamA.trim() || null)}
                                        className={`flex-1 py-3 text-sm font-bold border-2 transition-all ${winner === teamA.trim() && winner
                                            ? "bg-green-500 border-green-600 text-black shadow-[2px_2px_0_0_#000]"
                                            : "bg-neutral-700 text-neutral-400 border-neutral-600 hover:border-neutral-500"
                                            }`}
                                    >
                                        🏆 {teamA || "A"} 胜
                                    </button>
                                    <button
                                        onClick={() => setWinner(teamB.trim() || null)}
                                        className={`flex-1 py-3 text-sm font-bold border-2 transition-all ${winner === teamB.trim() && winner
                                            ? "bg-green-500 border-green-600 text-black shadow-[2px_2px_0_0_#000]"
                                            : "bg-neutral-700 text-neutral-400 border-neutral-600 hover:border-neutral-500"
                                            }`}
                                    >
                                        🏆 {teamB || "B"} 胜
                                    </button>
                                    <button
                                        onClick={() => setWinner("draw")}
                                        className={`flex-1 py-3 text-sm font-bold border-2 transition-all ${winner === "draw"
                                            ? "bg-yellow-500 border-yellow-600 text-black shadow-[2px_2px_0_0_#000]"
                                            : "bg-neutral-700 text-neutral-400 border-neutral-600 hover:border-neutral-500"
                                            }`}
                                    >
                                        🤝 平局
                                    </button>
                                </div>
                            </div>

                            <div>
                                <label className="text-sm font-bold uppercase tracking-wider text-neutral-400 block mb-2">
                                    备注 (可选)
                                </label>
                                <textarea
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    placeholder="例如：第三轮团战、积分赛..."
                                    rows={2}
                                    className="w-full bg-neutral-900 border-2 border-neutral-700 rounded p-2 text-sm text-white focus:border-yellow-500 outline-none resize-none"
                                />
                            </div>
                        </PixelCard>

                        {checkError && (
                            <div className="bg-red-900/50 border-2 border-red-600 p-3 text-sm text-red-300">
                                ❌ {checkError}
                            </div>
                        )}

                        <PixelButton
                            onClick={handleCheckMatch}
                            isLoading={isChecking}
                            disabled={!teamA.trim() || !teamB.trim() || !startTime}
                        >
                            查找 / 创建对局 →
                        </PixelButton>
                    </div>
                )}

                {/* ═══════ Step 2: Team Select + Upload + OCR ═══════ */}
                {step === "upload-ocr" && matchRecord && (
                    <div className="space-y-6">
                        {/* Match Status Banner */}
                        <div className={`p-4 border-2 font-bold text-sm ${matchStatus === "exists"
                            ? "bg-blue-900/30 border-blue-500 text-blue-300"
                            : "bg-green-900/30 border-green-500 text-green-300"
                            }`}>
                            {matchStatus === "exists"
                                ? `📌 对局已存在：${matchRecord.team_a} vs ${matchRecord.team_b}`
                                : `✅ 对局已创建：${matchRecord.team_a} vs ${matchRecord.team_b}`}
                            {submittedTeams.length > 0 && (
                                <span className="ml-2 text-xs opacity-70">
                                    · 已提交数据：{submittedTeams.join(", ")}
                                </span>
                            )}
                        </div>

                        {/* Team Selector */}
                        <PixelCard className="bg-neutral-800 space-y-3">
                            <h3 className="text-sm font-bold text-yellow-500 uppercase">
                                选择数据所属队伍
                            </h3>
                            <p className="text-xs text-neutral-500">
                                上传的截图数据将归入所选队伍。每个队伍只能提交一次。
                            </p>
                            <div className="flex gap-3">
                                {[matchRecord.team_a, matchRecord.team_b].map((name) => {
                                    const alreadyDone = submittedTeams.includes(name);
                                    return (
                                        <button
                                            key={name}
                                            onClick={() => !alreadyDone && setSelectedTeam(name)}
                                            disabled={alreadyDone}
                                            className={`flex-1 py-4 text-sm font-bold border-2 transition-all relative ${alreadyDone
                                                ? "bg-neutral-900 text-neutral-600 border-neutral-800 cursor-not-allowed"
                                                : selectedTeam === name
                                                    ? "bg-yellow-500 text-black border-yellow-600 shadow-[3px_3px_0_0_#000]"
                                                    : "bg-neutral-700 text-white border-neutral-600 hover:border-yellow-500"
                                                }`}
                                        >
                                            {alreadyDone ? "✅ " : selectedTeam === name ? "▶ " : ""}
                                            {name}
                                            {alreadyDone && (
                                                <div className="text-xs mt-1 text-neutral-600">已提交</div>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </PixelCard>

                        {/* Both teams done */}
                        {bothTeamsSubmitted && (
                            <div className="bg-green-900/30 border-2 border-green-500 p-4 text-center">
                                <p className="text-green-300 font-bold">✅ 双方数据均已提交完成</p>
                                <div className="flex justify-center gap-3 mt-3">
                                    <PixelButton
                                        onClick={() => router.push(`/baiye/${baiyeId}/matches`)}
                                    >
                                        📋 查看对战记录
                                    </PixelButton>
                                    <PixelButton
                                        variant="secondary"
                                        onClick={() => {
                                            resetAll();
                                            setStep("match-info");
                                        }}
                                    >
                                        📷 录入新对局
                                    </PixelButton>
                                </div>
                            </div>
                        )}

                        {/* Upload area - only if team selected & not yet submitted */}
                        {selectedTeam && !currentTeamSubmitted && !bothTeamsSubmitted && (
                            <>
                                {!ocrDone && (
                                    <>
                                        <div className="text-sm text-neutral-300 border-l-4 border-yellow-500 pl-3 py-1">
                                            正在为 <span className="text-yellow-500 font-bold">{selectedTeam}</span> 提交数据
                                        </div>

                                        {/* Drop Zone */}
                                        <div
                                            ref={dropRef}
                                            onDragOver={handleDragOver}
                                            onDragLeave={handleDragLeave}
                                            onDrop={handleDrop}
                                            onClick={() => fileInputRef.current?.click()}
                                            className={`border-4 border-dashed p-12 text-center cursor-pointer transition-all ${isDragging
                                                ? "border-yellow-500 bg-yellow-500/10"
                                                : "border-neutral-700 bg-neutral-800/50 hover:border-neutral-500"
                                                }`}
                                        >
                                            <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleFileSelect} className="hidden" />
                                            <div className="text-4xl mb-4">📷</div>
                                            <p className="text-lg font-bold text-neutral-300 mb-2">拖拽截图到此处 或 点击选择</p>
                                            <p className="text-xs text-neutral-500">支持多张图片同时上传 · PNG / JPG / WEBP</p>
                                        </div>

                                        {/* Image Previews */}
                                        {imagePreviews.length > 0 && (
                                            <div className="space-y-4">
                                                <h3 className="text-sm font-bold uppercase text-neutral-400">已选择 {imagePreviews.length} 张截图</h3>
                                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                                    {imagePreviews.map((src, i) => (
                                                        <div key={i} className="relative group border-2 border-neutral-700 overflow-hidden aspect-video">
                                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                                            <img src={src} alt={`截图 ${i + 1}`} className="w-full h-full object-cover" />
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); removeImage(i); }}
                                                                className="absolute top-1 right-1 w-6 h-6 bg-red-600 hover:bg-red-500 text-white text-xs font-bold border-2 border-black flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                                            >✕</button>
                                                            <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-xs text-center py-0.5 text-neutral-400">#{i + 1}</div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {ocrError && (
                                            <div className="bg-red-900/50 border-2 border-red-600 p-3 text-sm text-red-300">❌ {ocrError}</div>
                                        )}

                                        <PixelButton onClick={runOcr} isLoading={isOcring} disabled={imageFiles.length === 0}>
                                            {isOcring ? "上传识别中..." : "🔍 上传 & AI 识别"}
                                        </PixelButton>

                                        {isOcring && (
                                            <div className="flex items-center gap-3 text-sm text-yellow-500">
                                                <div className="w-4 h-4 border-2 border-yellow-500 border-t-transparent animate-spin" />
                                                正在上传截图并调用 AI 识别数据，大约耗时1分钟...
                                            </div>
                                        )}
                                    </>
                                )}

                                {/* OCR Results (Read-Only) */}
                                {ocrDone && players.length > 0 && (
                                    <PixelCard className="bg-neutral-800 space-y-4">
                                        <div className="flex justify-between items-center border-b-2 border-blue-400/20 pb-2">
                                            <h3 className="text-lg font-bold text-blue-400 uppercase">
                                                {selectedTeam} 的数据 ({players.length}人) — 只读
                                            </h3>
                                            <span className="text-xs text-neutral-500 bg-neutral-700 px-2 py-1 border border-neutral-600">
                                                🔒 数据不可修改
                                            </span>
                                        </div>

                                        <div className="overflow-x-auto -mx-4 px-4">
                                            <table className="w-full text-sm border-collapse min-w-[900px]">
                                                <thead>
                                                    <tr className="border-b-2 border-neutral-700">
                                                        <th className="text-left py-2 px-2 text-neutral-400 uppercase text-xs w-8">#</th>
                                                        <th className="text-left py-2 px-2 text-neutral-400 uppercase text-xs min-w-[120px]">玩家名</th>
                                                        {STAT_COLS.map((col) => (
                                                            <th key={col.key} className="text-center py-2 px-1 text-neutral-400 uppercase text-xs w-[80px]">{col.label}</th>
                                                        ))}
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {players.map((player, rowIdx) => (
                                                        <tr key={rowIdx} className="border-b border-neutral-800 hover:bg-neutral-750">
                                                            <td className="py-1 px-2 text-neutral-600 text-xs">{rowIdx + 1}</td>
                                                            <td className="py-1 px-2 text-white text-xs font-bold">{player.player_name}</td>
                                                            {STAT_COLS.map((col) => (
                                                                <td key={col.key} className="py-1 px-1 text-center text-xs text-neutral-300">
                                                                    {(player[col.key] as number).toLocaleString()}
                                                                </td>
                                                            ))}
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </PixelCard>
                                )}

                                {saveError && (
                                    <div className="bg-red-900/50 border-2 border-red-600 p-3 text-sm text-red-300">❌ {saveError}</div>
                                )}

                                {ocrDone && players.length > 0 && (
                                    <div className="flex gap-3">
                                        <PixelButton onClick={handleSaveStats} isLoading={isSaving}>
                                            ✅ 确认保存 {selectedTeam} 数据 ({players.length} 人)
                                        </PixelButton>
                                        <PixelButton variant="secondary" onClick={() => setStep("match-info")} disabled={isSaving}>
                                            ← 返回
                                        </PixelButton>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                )}

                {/* ═══════ Step 3: Done ═══════ */}
                {step === "done" && (
                    <div className="flex flex-col items-center justify-center py-20 space-y-6">
                        <div className="text-7xl">✅</div>
                        <h2 className="text-2xl font-bold text-green-400 uppercase">数据已保存！</h2>
                        <p className="text-neutral-400 text-sm">
                            {selectedTeam} 的 {players.length} 位玩家数据已录入
                        </p>
                        <p className="text-neutral-500 text-xs">
                            对局 ID: {savedMatchId?.slice(0, 8)}... · {teamA} vs {teamB}
                        </p>
                        <div className="flex gap-3 pt-4">
                            <PixelButton onClick={() => { resetAll(); setStep("match-info"); }}>
                                📷 继续录入
                            </PixelButton>
                            <PixelButton variant="secondary" onClick={() => router.push(`/baiye/${baiyeId}/matches`)}>
                                📋 查看对战记录
                            </PixelButton>
                            <PixelButton variant="secondary" onClick={() => router.push(`/baiye/${baiyeId}/hall`)}>
                                ← 返回大厅
                            </PixelButton>
                        </div>
                    </div>
                )}
            </div>
        </main>
    );

    function resetAll() {
        setTeamB("");
        setStartTime(new Date(Date.now() - 30 * 60000).toISOString().slice(0, 16));
        setWinner(null);
        setNotes("");
        setImageFiles([]);
        setImagePreviews([]);
        setUploadedUrls([]);
        setPlayers([]);
        setOcrDone(false);
        setMatchRecord(null);
        setMatchStatus(null);
        setSubmittedTeams([]);
        setSelectedTeam("");
        setSavedMatchId(null);
        setOcrError(null);
        setSaveError(null);
        setCheckError(null);
    }
}

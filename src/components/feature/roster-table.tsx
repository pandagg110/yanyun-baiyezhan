"use client";

import { RosterCell, RosterOption, RosterSquad } from "@/types/app";
import React, { forwardRef, useCallback, useEffect, useRef, useState } from "react";

interface RosterTableProps {
    title: string;
    emoji: string;
    columns: string[];
    squads: RosterSquad[];
    isAdmin: boolean;
    options: RosterOption[];
    availableMembers: string[];
    globalAssignedNames: Set<string>;
    onColumnsChange: (cols: string[]) => void;
    onSquadsChange: (squads: RosterSquad[]) => void;
    onAddOption?: (label: string, color?: string, category?: string) => void;
    onRenameMember?: (oldName: string, newName: string) => void;
    headerColor?: string;
    sectionKey?: string;
    onCrossSectionSwap?: (fromSection: string, fromSi: number, fromMi: number, toSi: number, toMi: number) => void;
}

const MAX_SQUAD_SIZE = 5;

function deepClone<T>(obj: T): T { return JSON.parse(JSON.stringify(obj)); }

function getColumnCategory(colName: string): string | null {
    if (["守塔", "守鹅", "守车", "打塔", "打鹅", "树团"].includes(colName) || colName.includes("铁桶")) return "守位";
    if (colName.includes("打野")) return "打野";
    if (colName.includes("25分")) return "25分boss";
    if (colName.includes("15分")) return "15分boss";
    return null;
}

/** Get filtered options for a specific column */
function getOptionsForColumn(options: RosterOption[], columnName: string): RosterOption[] {
    const category = getColumnCategory(columnName);
    return options.filter((o) => !category || o.category === category);
}

/* ──── Preset color palette for custom option popup ──── */
const COLOR_PALETTE = [
    "#d4edda", "#c3e6cb", "#bee5eb", "#b8daff",
    "#d6d8db", "#ffeeba", "#f5c6cb", "#e2c6f5",
    "#fdd", "#ddf", "#dfd", "#ffd",
    "#f0e68c", "#ffcccb", "#c1ffc1", "#add8e6",
];

/* ──── Accent color palettes per squad index ──── */
const SQUAD_ACCENTS = [
    { bg: "#fef3c7", border: "#f59e0b", badge: "#d97706", text: "#92400e", light: "#fffbeb" },
    { bg: "#dbeafe", border: "#3b82f6", badge: "#2563eb", text: "#1e40af", light: "#eff6ff" },
    { bg: "#dcfce7", border: "#22c55e", badge: "#16a34a", text: "#166534", light: "#f0fdf4" },
    { bg: "#fce7f3", border: "#ec4899", badge: "#db2777", text: "#9d174d", light: "#fdf2f8" },
    { bg: "#e0e7ff", border: "#6366f1", badge: "#4f46e5", text: "#3730a3", light: "#eef2ff" },
    { bg: "#fed7aa", border: "#f97316", badge: "#ea580c", text: "#9a3412", light: "#fff7ed" },
];

/* ──── Custom option popup ──── */
interface CustomPopupState {
    si: number; mi: number; ci: number; columnName: string;
}

function CustomOptionPopup({ onSave, onCancel }: {
    onSave: (text: string, color: string) => void;
    onCancel: () => void;
}) {
    const [text, setText] = useState("");
    const [color, setColor] = useState(COLOR_PALETTE[0]);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => { inputRef.current?.focus(); }, []);

    const handleSave = () => {
        if (!text.trim()) return;
        onSave(text.trim(), color);
    };

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center" onClick={onCancel}>
            <div className="absolute inset-0 bg-black/40" />
            <div className="relative bg-white rounded-lg shadow-2xl border-2 border-neutral-200 p-4 w-[280px] space-y-3"
                onClick={(e) => e.stopPropagation()}>
                <div className="text-sm font-bold text-neutral-800">✏️ 自定义选项</div>

                {/* Text input */}
                <input ref={inputRef} value={text} onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && text.trim()) handleSave(); if (e.key === "Escape") onCancel(); }}
                    placeholder="输入选项名称..."
                    className="w-full px-3 py-2 text-sm border-2 border-neutral-300 rounded-md outline-none focus:border-blue-500 text-black" />

                {/* Color picker */}
                <div>
                    <div className="text-[11px] text-neutral-500 font-bold mb-1.5">选择颜色</div>
                    <div className="grid grid-cols-8 gap-1.5">
                        {COLOR_PALETTE.map((c) => (
                            <button key={c} onClick={() => setColor(c)}
                                className={`w-6 h-6 rounded border-2 transition-all ${color === c ? "border-blue-500 scale-110 shadow-md" : "border-neutral-300 hover:border-neutral-400"}`}
                                style={{ backgroundColor: c }} />
                        ))}
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                        <input type="color" value={color} onChange={(e) => setColor(e.target.value)}
                            className="w-6 h-6 border border-neutral-300 rounded cursor-pointer" />
                        <span className="text-[10px] text-neutral-400">自定义颜色</span>
                    </div>
                </div>

                {/* Preview */}
                {text.trim() && (
                    <div className="flex items-center gap-2 px-2 py-1.5 rounded border border-neutral-200" style={{ backgroundColor: color }}>
                        <span className="text-xs font-medium text-black">预览: {text.trim()}</span>
                    </div>
                )}

                {/* Buttons */}
                <div className="flex gap-2 justify-end">
                    <button onClick={onCancel}
                        className="px-3 py-1.5 text-xs text-neutral-500 border border-neutral-300 rounded hover:bg-neutral-100">
                        取消
                    </button>
                    <button onClick={handleSave} disabled={!text.trim()}
                        className="px-3 py-1.5 text-xs font-bold text-white bg-blue-500 rounded hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed">
                        确认添加
                    </button>
                </div>
            </div>
        </div>
    );
}

export const RosterTable = forwardRef<HTMLDivElement, RosterTableProps>(
    function RosterTable(
        { title, emoji, columns, squads, isAdmin, options, availableMembers, globalAssignedNames, onColumnsChange, onSquadsChange, onAddOption, onRenameMember, headerColor = "#e8d44d", sectionKey, onCrossSectionSwap },
        ref
    ) {
        const [editingCol, setEditingCol] = useState<number | null>(null);
        const [colEditValue, setColEditValue] = useState("");
        const [dragOverSquad, setDragOverSquad] = useState<number | null>(null);
        const [customPopup, setCustomPopup] = useState<CustomPopupState | null>(null);
        const [editingMember, setEditingMember] = useState<{ si: number; mi: number; value: string } | null>(null);

        /* ── Member name swap drag state ── */
        const [nameDrag, setNameDrag] = useState<{ si: number; mi: number } | null>(null);
        const [nameDropTarget, setNameDropTarget] = useState<{ si: number; mi: number } | null>(null);

        /** Start dragging a member name for swap */
        const handleNameDragStart = useCallback((e: React.DragEvent, si: number, mi: number) => {
            if (!isAdmin) return;
            const memberName = squads[si].members[mi].name;
            if (!memberName) return; // Can't drag empty slots
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("application/roster-name-swap", JSON.stringify({ section: sectionKey || "", si, mi }));
            // Also set text/plain so player pool drop zones can accept it
            e.dataTransfer.setData("text/plain", memberName);
            setNameDrag({ si, mi });
        }, [isAdmin, squads, sectionKey]);

        /** Drag over a member row — highlight as swap target */
        const handleNameDragOver = useCallback((e: React.DragEvent, si: number, mi: number) => {
            if (!isAdmin) return;
            // Accept name-swap drags and player pool drags (text/plain)
            const isNameSwap = e.dataTransfer.types.includes("application/roster-name-swap");
            const isPoolDrag = e.dataTransfer.types.includes("text/plain");
            if (!isNameSwap && !isPoolDrag) return;
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = "move";
            setNameDropTarget((prev) => {
                if (prev?.si === si && prev?.mi === mi) return prev;
                return { si, mi };
            });
        }, [isAdmin]);

        /** Drop on a member row — swap names only, keep cells in place */
        const handleNameDrop = useCallback((e: React.DragEvent, targetSi: number, targetMi: number) => {
            e.preventDefault();
            e.stopPropagation();
            setNameDrag(null);
            setNameDropTarget(null);
            if (!isAdmin) return;

            // Case 1: Name swap between rows (same section or cross-section)
            if (e.dataTransfer.types.includes("application/roster-name-swap")) {
                try {
                    const data = JSON.parse(e.dataTransfer.getData("application/roster-name-swap"));
                    const { section: srcSection, si: srcSi, mi: srcMi } = data as { section: string; si: number; mi: number };

                    // Cross-section swap (e.g. attack ↔ defense)
                    if (srcSection && sectionKey && srcSection !== sectionKey) {
                        if (onCrossSectionSwap) {
                            onCrossSectionSwap(srcSection, srcSi, srcMi, targetSi, targetMi);
                        }
                        return;
                    }

                    // Same-section swap
                    if (srcSi === targetSi && srcMi === targetMi) return; // Same cell
                    const next = deepClone(squads);
                    const srcMember = next[srcSi].members[srcMi];
                    const tgtMember = next[targetSi].members[targetMi];
                    // Swap only names and isLeader, keep cells in place
                    const tmpName = srcMember.name;
                    const tmpLeader = srcMember.isLeader;
                    srcMember.name = tgtMember.name;
                    srcMember.isLeader = tgtMember.isLeader;
                    tgtMember.name = tmpName;
                    tgtMember.isLeader = tmpLeader;
                    onSquadsChange(next);
                } catch { /* ignore */ }
                return;
            }

            // Case 2: Drop from player pool onto an existing row (replace empty name or fill slot)
            const name = e.dataTransfer.getData("text/plain");
            if (!name) return;
            const targetMember = squads[targetSi].members[targetMi];
            if (targetMember.name === name) return; // Already this person
            // Check global uniqueness — auto-relocate if needed
            if (globalAssignedNames.has(name)) {
                const inThisSection = squads.some((sq) => sq.members.some((m) => m.name === name));
                if (!inThisSection) return;
            }
            const next = deepClone(squads);
            // Remove from old position in this section if exists
            for (const sq of next) {
                const idx = sq.members.findIndex((m) => m.name === name);
                if (idx !== -1) {
                    sq.members[idx].name = ""; // Clear old slot
                    break;
                }
            }
            next[targetSi].members[targetMi].name = name;
            onSquadsChange(next);
        }, [isAdmin, squads, onSquadsChange, globalAssignedNames, sectionKey, onCrossSectionSwap]);

        const handleNameDragEnd = useCallback(() => {
            setNameDrag(null);
            setNameDropTarget(null);
        }, []);

        const updateCell = (si: number, mi: number, ci: number, text: string, color?: string | null) => {
            const next = deepClone(squads);
            next[si].members[mi].cells[ci] = { text, color: color ?? next[si].members[mi].cells[ci].color };
            onSquadsChange(next);
        };

        const addMember = (si: number, name: string) => {
            if (globalAssignedNames.has(name)) {
                const inThisSection = squads.some((sq) => sq.members.some((m) => m.name === name));
                if (!inThisSection) return;
            }
            const next = deepClone(squads);
            if (next[si].members.some((m: any) => m.name === name)) return;

            // First try to fill an empty-name slot in this squad
            const emptyIdx = next[si].members.findIndex((m) => !m.name);
            if (emptyIdx !== -1) {
                next[si].members[emptyIdx].name = name;
                onSquadsChange(next);
                return;
            }

            // Otherwise append if not full
            if (next[si].members.length >= MAX_SQUAD_SIZE) return;
            const emptyCells: RosterCell[] = columns.map(() => ({ text: "", color: null }));
            next[si].members.push({ name, isLeader: next[si].members.length === 0, cells: emptyCells });
            onSquadsChange(next);
        };

        /** Remove member: only clear the name, keep cells data intact */
        const removeMember = (si: number, mi: number) => {
            const next = deepClone(squads);
            next[si].members[mi].name = "";
            next[si].members[mi].isLeader = false;
            onSquadsChange(next);
        };

        const setLeader = (si: number, leaderName: string) => {
            const next = deepClone(squads);
            next[si].members.forEach((m: any) => { m.isLeader = m.name === leaderName; });
            onSquadsChange(next);
        };

        const updateColName = (ci: number, newName: string) => {
            const next = [...columns];
            next[ci] = newName;
            onColumnsChange(next);
            setEditingCol(null);
        };

        const handleSquadDragOver = (e: React.DragEvent, si: number) => {
            if (!isAdmin) return;
            // Allow drop if squad has empty-name slots or is not full
            const hasEmptySlot = squads[si].members.some((m) => !m.name);
            if (!hasEmptySlot && squads[si].members.length >= MAX_SQUAD_SIZE) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
            setDragOverSquad(si);
        };
        const handleSquadDragLeave = () => setDragOverSquad(null);
        const handleSquadDrop = (e: React.DragEvent, si: number) => {
            e.preventDefault(); setDragOverSquad(null);
            if (!isAdmin) return;
            // Ignore name-swap drops (those are handled by row-level drop)
            if (e.dataTransfer.types.includes("application/roster-name-swap")) return;
            const name = e.dataTransfer.getData("text/plain");
            if (name) addMember(si, name);
        };

        /** Handle cell select change */
        const handleCellSelect = (si: number, mi: number, ci: number, value: string, columnName: string) => {
            if (value === "__custom__") {
                setCustomPopup({ si, mi, ci, columnName });
            } else if (value === "") {
                updateCell(si, mi, ci, "", null);
            } else {
                const colOptions = getOptionsForColumn(options, columnName);
                const opt = colOptions.find((o) => o.label === value);
                updateCell(si, mi, ci, value, opt?.color || null);
            }
        };

        /** Handle custom popup save — update cell + auto-add to options */
        const handleCustomSave = (text: string, color: string) => {
            if (!customPopup) return;
            const { si, mi, ci, columnName } = customPopup;
            const category = getColumnCategory(columnName) || "general";
            updateCell(si, mi, ci, text, color);
            if (onAddOption) {
                onAddOption(text, color, category);
            }
            setCustomPopup(null);
        };

        /* Calculate fixed column widths */
        const nameColWidth = "100px";

        return (
            <div>
                <div ref={ref} className="bg-white" style={{ padding: 0 }}>
                    {squads.map((squad, si) => {
                        const accent = SQUAD_ACCENTS[si % SQUAD_ACCENTS.length];
                        const leaderName = squad.members.find((m) => m.isLeader)?.name || "";
                        const isFull = squad.members.length >= MAX_SQUAD_SIZE;
                        return (
                            <div key={si} className="mb-2" style={{ borderRadius: 6, border: `2px solid ${accent.border}33` }}>
                                {/* Squad header bar */}
                                <div className="flex items-center justify-between px-3 py-1" style={{ background: `linear-gradient(135deg, ${accent.bg}, ${accent.light})`, borderBottom: `2px solid ${accent.border}44`, borderRadius: "4px 4px 0 0" }}>
                                    <div className="flex items-center gap-2">
                                        <span className="inline-flex items-center justify-center text-white font-black text-[11px] rounded"
                                            style={{ backgroundColor: accent.badge, width: 22, height: 22, lineHeight: "22px" }}>
                                            {si + 1}
                                        </span>
                                        <span className="font-bold text-[13px]" style={{ color: accent.text }}>小队</span>
                                        <span className="text-[11px] px-1.5 py-0.5 rounded font-mono font-bold" style={{ backgroundColor: `${accent.badge}18`, color: accent.badge }}>
                                            {squad.members.length}/{MAX_SQUAD_SIZE}
                                        </span>
                                        {isFull && <span className="text-[9px] px-1.5 py-0.5 rounded-sm font-bold text-white" style={{ backgroundColor: accent.badge }}>已满</span>}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {isAdmin ? (
                                            <select value={leaderName}
                                                onChange={(e) => setLeader(si, e.target.value)}
                                                className="text-[10px] bg-white/80 border border-neutral-300 rounded px-1 py-0.5 text-black cursor-pointer max-w-[80px]"
                                                data-no-export>
                                                <option value="">👑 小队长</option>
                                                {squad.members.map((m) => (
                                                    <option key={m.name} value={m.name}>{m.name}</option>
                                                ))}
                                            </select>
                                        ) : (
                                            leaderName && <span className="text-[10px] font-bold" style={{ color: accent.text }}>👑 {leaderName}</span>
                                        )}
                                    </div>
                                </div>

                                {/* Table */}
                                <table className="w-full border-collapse text-xs" style={{ tableLayout: "fixed" }}>
                                    <colgroup>
                                        <col style={{ width: nameColWidth }} />
                                        {columns.map((_, ci) => (
                                            <col key={ci} />
                                        ))}
                                    </colgroup>
                                    <thead>
                                        <tr>
                                            <th className="border border-neutral-300 px-2 py-2 text-left font-bold text-[11px]"
                                                style={{ backgroundColor: accent.bg, color: accent.text, whiteSpace: "nowrap" }}>
                                                {emoji} 成员
                                            </th>
                                            {columns.map((col, ci) => (
                                                <th key={ci} className="border border-neutral-300 px-1.5 py-2 text-center font-bold text-[11px]"
                                                    style={{
                                                        backgroundColor: accent.bg,
                                                        color: accent.text,
                                                        whiteSpace: "nowrap",
                                                        overflow: "hidden",
                                                        textOverflow: "ellipsis",
                                                    }}>
                                                    {isAdmin && editingCol === ci ? (
                                                        <input value={colEditValue} onChange={(e) => setColEditValue(e.target.value)}
                                                            onBlur={() => updateColName(ci, colEditValue)}
                                                            onKeyDown={(e) => { if (e.key === "Enter") updateColName(ci, colEditValue); if (e.key === "Escape") setEditingCol(null); }}
                                                            className="w-full bg-white text-black text-[11px] px-1 border border-blue-500 outline-none text-center" autoFocus />
                                                    ) : (
                                                        <span className={isAdmin ? "cursor-pointer hover:underline" : ""}
                                                            title={col}
                                                            onClick={() => { if (isAdmin) { setEditingCol(ci); setColEditValue(col); } }}>
                                                            {col}
                                                        </span>
                                                    )}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody onDragOver={(e) => handleSquadDragOver(e, si)} onDragLeave={handleSquadDragLeave} onDrop={(e) => handleSquadDrop(e, si)}>
                                        {squad.members.map((member, mi) => {
                                            const isDragging = nameDrag?.si === si && nameDrag?.mi === mi;
                                            const isSwapTarget = nameDropTarget?.si === si && nameDropTarget?.mi === mi;
                                            const isEmpty = !member.name;
                                            const swapStyle: React.CSSProperties = isSwapTarget
                                                ? { boxShadow: `inset 0 0 0 2px ${accent.badge}`, background: `${accent.bg}` }
                                                : {};
                                            return (
                                            <tr key={mi}
                                                draggable={isAdmin && !!member.name}
                                                onDragStart={(e) => handleNameDragStart(e, si, mi)}
                                                onDragOver={(e) => handleNameDragOver(e, si, mi)}
                                                onDrop={(e) => handleNameDrop(e, si, mi)}
                                                onDragEnd={handleNameDragEnd}
                                                className={`transition-all duration-150 ${isDragging ? "opacity-30 scale-[0.97]" : isSwapTarget ? "" : isEmpty ? "" : "hover:bg-blue-50/30"}`}
                                                style={swapStyle}>
                                                <td className="border border-neutral-300 px-2 py-1.5 font-bold text-[11px]"
                                                    style={{
                                                        backgroundColor: isEmpty ? "#f9f9f9" : member.isLeader ? accent.light : "#fff",
                                                        color: isEmpty ? "#999" : "#000",
                                                        whiteSpace: "nowrap",
                                                        overflow: "hidden",
                                                        textOverflow: "ellipsis",
                                                    }}>
                                                    <div className="flex items-center gap-1">
                                                        {isAdmin && !isEmpty && <span className="cursor-grab active:cursor-grabbing text-[10px] text-neutral-300 hover:text-neutral-500 select-none" data-no-export>⠿</span>}
                                                        {!isEmpty && member.isLeader && <span className="text-[9px] font-bold" style={{ color: accent.badge }}>★</span>}
                                                        {isEmpty ? (
                                                            <span className="text-[10px] italic text-neutral-400 select-none">空位 · 拖入成员</span>
                                                        ) : editingMember?.si === si && editingMember?.mi === mi ? (
                                                            <input
                                                                autoFocus
                                                                value={editingMember.value}
                                                                onChange={(e) => setEditingMember({ ...editingMember, value: e.target.value })}
                                                                onBlur={() => {
                                                                    const newName = editingMember.value.trim();
                                                                    if (newName && newName !== member.name) {
                                                                        onRenameMember?.(member.name, newName);
                                                                    }
                                                                    setEditingMember(null);
                                                                }}
                                                                onKeyDown={(e) => {
                                                                    if (e.key === "Enter") {
                                                                        (e.target as HTMLInputElement).blur();
                                                                    }
                                                                    if (e.key === "Escape") setEditingMember(null);
                                                                }}
                                                                className="flex-1 min-w-0 bg-white text-black text-[11px] px-1 border border-blue-500 outline-none"
                                                                data-no-export
                                                            />
                                                        ) : (
                                                            <span
                                                                className={`truncate ${isAdmin ? "cursor-text" : ""}`}
                                                                onDoubleClick={() => { if (isAdmin) setEditingMember({ si, mi, value: member.name }); }}
                                                                title={isAdmin ? "双击改名" : member.name}
                                                            >{member.name}</span>
                                                        )}
                                                        {isAdmin && !isEmpty && (
                                                            <button onClick={() => removeMember(si, mi)}
                                                                className="text-[9px] text-neutral-400 hover:text-red-500 ml-auto shrink-0" title="清除成员(保留位置数据)" data-no-export>✕</button>
                                                        )}
                                                    </div>
                                                </td>
                                                {member.cells.map((cell, ci) => {
                                                    const columnName = columns[ci] || "";
                                                    const colOptions = getOptionsForColumn(options, columnName);
                                                    const hasMatchingOption = colOptions.some((o) => o.label === cell.text);
                                                    const isCustomValue = cell.text && !hasMatchingOption;
                                                    const hasValue = !!cell.text;

                                                    return (
                                                        <td key={ci}
                                                            className="border border-neutral-300 px-0.5 py-0.5 text-center"
                                                            style={{
                                                                backgroundColor: cell.color || "#fff",
                                                                color: "#000",
                                                            }}>
                                                            {isAdmin ? (
                                                                <select
                                                                    value={isCustomValue ? "__current_custom__" : cell.text}
                                                                    onChange={(e) => handleCellSelect(si, mi, ci, e.target.value, columnName)}
                                                                    className="w-full text-[10px] border-0 outline-none cursor-pointer text-center font-medium"
                                                                    style={{
                                                                        backgroundColor: "transparent",
                                                                        color: "#000",
                                                                        appearance: hasValue ? "none" : "auto",
                                                                        WebkitAppearance: hasValue ? "none" as any : "auto" as any,
                                                                        padding: hasValue ? "2px 4px" : undefined,
                                                                    }}>
                                                                    <option value="">—</option>
                                                                    {isCustomValue && (
                                                                        <option value="__current_custom__">{cell.text}</option>
                                                                    )}
                                                                    {colOptions.map((opt) => (
                                                                        <option key={opt.id} value={opt.label}>{opt.label}</option>
                                                                    ))}
                                                                    <option value="__custom__">✏️ 自定义...</option>
                                                                </select>
                                                            ) : (
                                                                <span className="text-[11px]" title={cell.text}
                                                                    style={{
                                                                        overflow: "hidden",
                                                                        textOverflow: "ellipsis",
                                                                        whiteSpace: "nowrap",
                                                                        display: "block",
                                                                    }}>
                                                                    {cell.text}
                                                                </span>
                                                            )}
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                            );
                                        })}
                                        {/* Drag zone + add member dropdown */}
                                        {isAdmin && (() => {
                                            const hasEmptySlot = squad.members.some((m) => !m.name);
                                            const canAddNew = squad.members.length < MAX_SQUAD_SIZE;
                                            if (!hasEmptySlot && !canAddNew) return null;
                                            const sectionAssigned = new Set(squads.flatMap((sq) => sq.members.map((m) => m.name)).filter(Boolean));
                                            const unassigned = availableMembers.filter((n) => !sectionAssigned.has(n));
                                            const filledCount = squad.members.filter((m) => !!m.name).length;
                                            return (
                                            <tr data-no-export>
                                                <td colSpan={columns.length + 1}
                                                    className={`border border-dashed px-2 py-2 text-center text-[10px] transition-all ${
                                                        dragOverSquad === si
                                                            ? "border-cyan-400 bg-cyan-50 text-cyan-600"
                                                            : "border-neutral-300 text-neutral-400"
                                                    }`}>
                                                    <div className="flex items-center justify-center gap-2 flex-wrap">
                                                        {dragOverSquad === si
                                                            ? <span className="font-bold">📥 放下添加成员</span>
                                                            : <>
                                                                <span className="text-neutral-400">拖拽或选择添加 ({filledCount}/{MAX_SQUAD_SIZE})</span>
                                                                {unassigned.length > 0 && (
                                                                    <select
                                                                        value=""
                                                                        onChange={(e) => { if (e.target.value) addMember(si, e.target.value); }}
                                                                        className="text-[10px] bg-white border border-neutral-300 rounded px-1 py-0.5 text-black cursor-pointer max-w-[100px]"
                                                                    >
                                                                        <option value="">+ 添加成员</option>
                                                                        {unassigned.map((n) => (
                                                                            <option key={n} value={n}>{n}</option>
                                                                        ))}
                                                                    </select>
                                                                )}
                                                            </>}
                                                    </div>
                                                </td>
                                            </tr>
                                            );
                                        })()}
                                    </tbody>
                                </table>
                            </div>
                        );
                    })}
                </div>

                {/* Custom option popup */}
                {customPopup && (
                    <CustomOptionPopup
                        onSave={handleCustomSave}
                        onCancel={() => setCustomPopup(null)}
                    />
                )}
            </div>
        );
    }
);

"use client";

import { RosterCell, RosterOption, RosterSquad } from "@/types/app";
import React, { forwardRef, useEffect, useRef, useState } from "react";

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
    headerColor?: string;
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

function CellEditor({ value, options, columnName, onSave, onCancel }: {
    value: string; options: RosterOption[]; columnName: string;
    onSave: (text: string, color?: string | null) => void; onCancel: () => void;
}) {
    const [text, setText] = useState(value);
    const inputRef = useRef<HTMLInputElement>(null);
    useEffect(() => { inputRef.current?.focus(); inputRef.current?.select(); }, []);

    const category = getColumnCategory(columnName);
    const filtered = options
        .filter((o) => !category || o.category === category)
        .filter((o) => !text || o.label.toLowerCase().includes(text.toLowerCase()));

    return (
        <div className="absolute z-50 left-0 top-0 min-w-[120px]" onClick={(e) => e.stopPropagation()}>
            <input ref={inputRef} value={text} onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") onSave(text, null); if (e.key === "Escape") onCancel(); }}
                onBlur={() => setTimeout(onCancel, 200)}
                className="w-full px-1.5 py-1 text-xs bg-white text-black border-2 border-blue-500 outline-none" />
            {filtered.length > 0 && (
                <div className="absolute left-0 top-full bg-white border border-neutral-300 shadow-lg max-h-[160px] overflow-y-auto w-max min-w-full z-50">
                    {filtered.slice(0, 20).map((opt) => (
                        <button key={opt.id}
                            onMouseDown={(e) => { e.preventDefault(); onSave(opt.label, opt.color); }}
                            className="flex items-center gap-1.5 w-full px-2 py-1 text-xs text-left hover:bg-blue-50 text-black">
                            {opt.color && <span className="inline-block w-3 h-3 border border-neutral-300 shrink-0" style={{ backgroundColor: opt.color }} />}
                            <span>{opt.label}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

/* ──── Accent color palettes per squad index ──── */
const SQUAD_ACCENTS = [
    { bg: "#fef3c7", border: "#f59e0b", badge: "#d97706", text: "#92400e", light: "#fffbeb" },  // amber
    { bg: "#dbeafe", border: "#3b82f6", badge: "#2563eb", text: "#1e40af", light: "#eff6ff" },  // blue
    { bg: "#dcfce7", border: "#22c55e", badge: "#16a34a", text: "#166534", light: "#f0fdf4" },  // green
    { bg: "#fce7f3", border: "#ec4899", badge: "#db2777", text: "#9d174d", light: "#fdf2f8" },  // pink
    { bg: "#e0e7ff", border: "#6366f1", badge: "#4f46e5", text: "#3730a3", light: "#eef2ff" },  // indigo
    { bg: "#fed7aa", border: "#f97316", badge: "#ea580c", text: "#9a3412", light: "#fff7ed" },  // orange
];

export const RosterTable = forwardRef<HTMLDivElement, RosterTableProps>(
    function RosterTable(
        { title, emoji, columns, squads, isAdmin, options, availableMembers, globalAssignedNames, onColumnsChange, onSquadsChange, headerColor = "#e8d44d" },
        ref
    ) {
        const [editingCell, setEditingCell] = useState<string | null>(null);
        const [editingCol, setEditingCol] = useState<number | null>(null);
        const [colEditValue, setColEditValue] = useState("");
        const [dragOverSquad, setDragOverSquad] = useState<number | null>(null);

        const updateCell = (si: number, mi: number, ci: number, text: string, color?: string | null) => {
            const next = deepClone(squads);
            next[si].members[mi].cells[ci] = { text, color: color ?? next[si].members[mi].cells[ci].color };
            onSquadsChange(next);
            setEditingCell(null);
        };

        const addMember = (si: number, name: string) => {
            if (squads[si].members.length >= MAX_SQUAD_SIZE) return;
            if (globalAssignedNames.has(name)) {
                const inThisSection = squads.some((sq) => sq.members.some((m) => m.name === name));
                if (!inThisSection) return;
            }
            const next = deepClone(squads);
            if (next[si].members.some((m: any) => m.name === name)) return;
            const emptyCells: RosterCell[] = columns.map(() => ({ text: "", color: null }));
            next[si].members.push({ name, isLeader: next[si].members.length === 0, cells: emptyCells });
            onSquadsChange(next);
        };

        const removeMember = (si: number, mi: number) => {
            const next = deepClone(squads);
            next[si].members.splice(mi, 1);
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
            if (squads[si].members.length >= MAX_SQUAD_SIZE) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
            setDragOverSquad(si);
        };
        const handleSquadDragLeave = () => setDragOverSquad(null);
        const handleSquadDrop = (e: React.DragEvent, si: number) => {
            e.preventDefault(); setDragOverSquad(null);
            if (!isAdmin) return;
            const name = e.dataTransfer.getData("text/plain");
            if (name) addMember(si, name);
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
                            <div key={si} className="mb-5" style={{ borderRadius: 6, overflow: "hidden", border: `2px solid ${accent.border}33` }}>
                                {/* Squad header bar */}
                                <div className="flex items-center justify-between px-3 py-2" style={{ background: `linear-gradient(135deg, ${accent.bg}, ${accent.light})`, borderBottom: `2px solid ${accent.border}44` }}>
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
                                        {squad.members.map((member, mi) => (
                                            <tr key={mi} className="hover:bg-blue-50/30 transition-colors">
                                                <td className="border border-neutral-300 px-2 py-1.5 font-bold text-[11px]"
                                                    style={{
                                                        backgroundColor: member.isLeader ? accent.light : "#fff",
                                                        color: "#000",
                                                        whiteSpace: "nowrap",
                                                        overflow: "hidden",
                                                        textOverflow: "ellipsis",
                                                    }}>
                                                    <div className="flex items-center gap-1">
                                                        {member.isLeader && <span className="text-[9px] font-bold" style={{ color: accent.badge }}>★</span>}
                                                        <span className="truncate">{member.name}</span>
                                                        {isAdmin && (
                                                            <button onClick={() => removeMember(si, mi)}
                                                                className="text-[9px] text-neutral-400 hover:text-red-500 ml-auto shrink-0" title="移除" data-no-export>✕</button>
                                                        )}
                                                    </div>
                                                </td>
                                                {member.cells.map((cell, ci) => {
                                                    const cellKey = `${si}-${mi}-${ci}`;
                                                    const isEditing = editingCell === cellKey;
                                                    return (
                                                        <td key={ci}
                                                            className={`border border-neutral-300 px-1 py-1 text-center relative ${isAdmin && !isEditing ? "cursor-pointer hover:bg-blue-50" : ""}`}
                                                            style={{
                                                                backgroundColor: cell.color || "#fff",
                                                                color: "#000",
                                                                overflow: "hidden",
                                                                textOverflow: "ellipsis",
                                                                whiteSpace: "nowrap",
                                                            }}
                                                            onClick={() => { if (isAdmin && !isEditing) setEditingCell(cellKey); }}>
                                                            {isEditing ? (
                                                                <CellEditor value={cell.text} options={options} columnName={columns[ci] || ""}
                                                                    onSave={(text, color) => updateCell(si, mi, ci, text, color)}
                                                                    onCancel={() => setEditingCell(null)} />
                                                            ) : (
                                                                <span className="text-[11px]" title={cell.text}>{cell.text}</span>
                                                            )}
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        ))}
                                        {/* Drag zone — only show if squad is NOT full and user is admin */}
                                        {isAdmin && !isFull && (
                                            <tr data-no-export>
                                                <td colSpan={columns.length + 1}
                                                    className={`border border-dashed px-2 py-2.5 text-center text-[10px] transition-all ${
                                                        dragOverSquad === si
                                                            ? "border-cyan-400 bg-cyan-50 text-cyan-600"
                                                            : "border-neutral-300 text-neutral-400"
                                                    }`}>
                                                    {dragOverSquad === si
                                                        ? <span className="font-bold">📥 放下添加成员</span>
                                                        : <span>拖拽人员到此处 ({squad.members.length}/{MAX_SQUAD_SIZE})</span>}
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    }
);

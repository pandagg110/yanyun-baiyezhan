"use client";

import { RosterCell, RosterOption, RosterSquad, RosterSquadMember } from "@/types/app";
import React, { forwardRef, useEffect, useRef, useState } from "react";

interface RosterTableProps {
    title: string;
    emoji: string;
    columns: string[];
    squads: RosterSquad[];
    isAdmin: boolean;
    options: RosterOption[];
    availableMembers: string[];
    onColumnsChange: (cols: string[]) => void;
    onSquadsChange: (squads: RosterSquad[]) => void;
    headerColor?: string;
}

function deepClone<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj));
}

/** Inline cell editor with dropdown suggestions */
function CellEditor({
    value,
    color,
    options,
    onSave,
    onCancel,
}: {
    value: string;
    color?: string | null;
    options: RosterOption[];
    onSave: (text: string, color?: string | null) => void;
    onCancel: () => void;
}) {
    const [text, setText] = useState(value);
    const [showDropdown, setShowDropdown] = useState(true);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
    }, []);

    const filtered = options.filter((o) =>
        !text || o.label.toLowerCase().includes(text.toLowerCase())
    );

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
            onSave(text, null);
        } else if (e.key === "Escape") {
            onCancel();
        }
    };

    return (
        <div className="absolute z-50 left-0 top-0 min-w-[140px]" onClick={(e) => e.stopPropagation()}>
            <input
                ref={inputRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={() => setTimeout(onCancel, 200)}
                className="w-full px-1 py-0.5 text-xs bg-white text-black border-2 border-blue-500 outline-none"
            />
            {showDropdown && filtered.length > 0 && (
                <div className="absolute left-0 top-full bg-white border border-neutral-300 shadow-lg max-h-[160px] overflow-y-auto w-max min-w-full z-50">
                    {filtered.slice(0, 20).map((opt) => (
                        <button
                            key={opt.id}
                            onMouseDown={(e) => {
                                e.preventDefault();
                                onSave(opt.label, opt.color);
                            }}
                            className="flex items-center gap-1.5 w-full px-2 py-1 text-xs text-left hover:bg-blue-50 text-black"
                        >
                            {opt.color && (
                                <span
                                    className="inline-block w-3 h-3 border border-neutral-300 shrink-0"
                                    style={{ backgroundColor: opt.color }}
                                />
                            )}
                            <span>{opt.label}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

export const RosterTable = forwardRef<HTMLDivElement, RosterTableProps>(
    function RosterTable(
        { title, emoji, columns, squads, isAdmin, options, availableMembers, onColumnsChange, onSquadsChange, headerColor = "#e8d44d" },
        ref
    ) {
        const [editingCell, setEditingCell] = useState<string | null>(null); // "si-mi-ci"
        const [editingCol, setEditingCol] = useState<number | null>(null);
        const [colEditValue, setColEditValue] = useState("");
        const [addingMemberSquad, setAddingMemberSquad] = useState<number | null>(null);

        const updateCell = (si: number, mi: number, ci: number, text: string, color?: string | null) => {
            const next = deepClone(squads);
            next[si].members[mi].cells[ci] = { text, color: color ?? next[si].members[mi].cells[ci].color };
            onSquadsChange(next);
            setEditingCell(null);
        };

        const addMember = (si: number, name: string) => {
            const next = deepClone(squads);
            const emptyCells: RosterCell[] = columns.map(() => ({ text: "", color: null }));
            next[si].members.push({ name, isLeader: next[si].members.length === 0, cells: emptyCells });
            onSquadsChange(next);
            setAddingMemberSquad(null);
        };

        const removeMember = (si: number, mi: number) => {
            if (!confirm(`移除 ${squads[si].members[mi].name}？`)) return;
            const next = deepClone(squads);
            next[si].members.splice(mi, 1);
            onSquadsChange(next);
        };

        const toggleLeader = (si: number, mi: number) => {
            const next = deepClone(squads);
            next[si].members.forEach((m, i) => (m.isLeader = i === mi));
            onSquadsChange(next);
        };

        const updateColName = (ci: number, newName: string) => {
            const next = [...columns];
            next[ci] = newName;
            onColumnsChange(next);
            setEditingCol(null);
        };

        const addColumn = () => {
            onColumnsChange([...columns, "新列"]);
            // Add empty cells to all members
            const next = deepClone(squads);
            next.forEach((sq) => sq.members.forEach((m) => m.cells.push({ text: "", color: null })));
            onSquadsChange(next);
        };

        const removeColumn = (ci: number) => {
            if (!confirm(`删除列「${columns[ci]}」？`)) return;
            const next = columns.filter((_, i) => i !== ci);
            onColumnsChange(next);
            const nextSquads = deepClone(squads);
            nextSquads.forEach((sq) => sq.members.forEach((m) => m.cells.splice(ci, 1)));
            onSquadsChange(nextSquads);
        };

        // Members not yet assigned to any squad in this section
        const assignedNames = new Set(squads.flatMap((sq) => sq.members.map((m) => m.name)));
        const unassigned = availableMembers.filter((n) => !assignedNames.has(n));

        return (
            <div>
                {/* Editable table — this div gets exported as image */}
                <div ref={ref} className="bg-white" style={{ padding: 2 }}>
                    {squads.map((squad, si) => (
                        <table
                            key={si}
                            className="w-full border-collapse text-xs mb-3"
                            style={{ borderSpacing: 0 }}
                        >
                            {/* Column headers */}
                            <thead>
                                <tr>
                                    <th
                                        className="border border-neutral-400 px-2 py-1.5 text-left font-bold"
                                        style={{ backgroundColor: headerColor, minWidth: 70, color: "#000" }}
                                    >
                                        {/* Squad label */}
                                    </th>
                                    {columns.map((col, ci) => (
                                        <th
                                            key={ci}
                                            className="border border-neutral-400 px-2 py-1.5 text-center font-bold relative"
                                            style={{ backgroundColor: headerColor, minWidth: 60, color: "#000" }}
                                        >
                                            {isAdmin && editingCol === ci ? (
                                                <input
                                                    value={colEditValue}
                                                    onChange={(e) => setColEditValue(e.target.value)}
                                                    onBlur={() => { updateColName(ci, colEditValue); }}
                                                    onKeyDown={(e) => { if (e.key === "Enter") updateColName(ci, colEditValue); if (e.key === "Escape") setEditingCol(null); }}
                                                    className="w-full bg-white text-black text-xs px-1 py-0 border border-blue-500 outline-none text-center"
                                                    autoFocus
                                                />
                                            ) : (
                                                <span
                                                    className={isAdmin ? "cursor-pointer hover:underline" : ""}
                                                    onClick={() => { if (isAdmin) { setEditingCol(ci); setColEditValue(col); } }}
                                                >
                                                    {col}
                                                </span>
                                            )}
                                            {isAdmin && (
                                                <button
                                                    onClick={() => removeColumn(ci)}
                                                    className="absolute -top-1 -right-1 w-3 h-3 text-[8px] bg-red-500 text-white rounded-full leading-none opacity-0 hover:opacity-100 transition-opacity"
                                                    data-no-export
                                                    title="删除列"
                                                >×</button>
                                            )}
                                        </th>
                                    ))}
                                    {isAdmin && (
                                        <th
                                            className="border border-dashed border-neutral-300 px-1 py-1 text-center"
                                            style={{ backgroundColor: "#f5f5f5", width: 30 }}
                                            data-no-export
                                        >
                                            <button onClick={addColumn} className="text-neutral-400 hover:text-black text-sm" title="添加列">+</button>
                                        </th>
                                    )}
                                </tr>
                                {/* Color note / time note row */}
                                {(squad.colorNote || squad.timeNote) && (
                                    <tr>
                                        <td className="border border-neutral-400 px-1 py-0.5 text-[10px] text-neutral-500" style={{ backgroundColor: "#fafafa" }}></td>
                                        <td
                                            colSpan={columns.length}
                                            className="border border-neutral-400 px-2 py-0.5 text-center text-[10px]"
                                            style={{ backgroundColor: "#fafafa", color: "#888" }}
                                        >
                                            {squad.colorNote && <span className="mr-4">{squad.colorNote}</span>}
                                            {squad.timeNote && <span>{squad.timeNote}</span>}
                                        </td>
                                        {isAdmin && <td data-no-export />}
                                    </tr>
                                )}
                            </thead>
                            <tbody>
                                {squad.members.map((member, mi) => (
                                    <tr key={mi}>
                                        {/* Name cell */}
                                        <td
                                            className="border border-neutral-400 px-2 py-1 font-bold whitespace-nowrap"
                                            style={{ backgroundColor: member.isLeader ? "#fffde7" : "#fff", color: "#000" }}
                                        >
                                            <div className="flex items-center gap-1">
                                                {member.isLeader && (
                                                    <span className="text-[10px] text-orange-600 font-bold">小队长</span>
                                                )}
                                                <span>{member.name}</span>
                                                {isAdmin && (
                                                    <span className="inline-flex gap-0.5 ml-1" data-no-export>
                                                        {!member.isLeader && (
                                                            <button onClick={() => toggleLeader(si, mi)} className="text-[9px] text-neutral-400 hover:text-orange-500" title="设为队长">★</button>
                                                        )}
                                                        <button onClick={() => removeMember(si, mi)} className="text-[9px] text-neutral-400 hover:text-red-500" title="移除">✕</button>
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        {/* Phase cells */}
                                        {member.cells.map((cell, ci) => {
                                            const cellKey = `${si}-${mi}-${ci}`;
                                            const isEditing = editingCell === cellKey;
                                            return (
                                                <td
                                                    key={ci}
                                                    className={`border border-neutral-400 px-1 py-0.5 text-center relative ${isAdmin && !isEditing ? "cursor-pointer hover:bg-blue-50" : ""}`}
                                                    style={{ backgroundColor: cell.color || "#fff", color: "#000", minWidth: 50 }}
                                                    onClick={() => { if (isAdmin && !isEditing) setEditingCell(cellKey); }}
                                                >
                                                    {isEditing ? (
                                                        <CellEditor
                                                            value={cell.text}
                                                            color={cell.color}
                                                            options={options}
                                                            onSave={(text, color) => updateCell(si, mi, ci, text, color)}
                                                            onCancel={() => setEditingCell(null)}
                                                        />
                                                    ) : (
                                                        <span className="text-xs">{cell.text}</span>
                                                    )}
                                                </td>
                                            );
                                        })}
                                        {isAdmin && <td data-no-export />}
                                    </tr>
                                ))}

                                {/* Add member row */}
                                {isAdmin && (
                                    <tr data-no-export>
                                        <td colSpan={columns.length + 2} className="border border-dashed border-neutral-300 px-2 py-1">
                                            {addingMemberSquad === si ? (
                                                <div className="flex flex-wrap gap-1">
                                                    {unassigned.length === 0 ? (
                                                        <span className="text-[10px] text-neutral-400">人员池无可用成员</span>
                                                    ) : (
                                                        unassigned.map((n) => (
                                                            <button
                                                                key={n}
                                                                onClick={() => addMember(si, n)}
                                                                className="px-1.5 py-0.5 text-[10px] bg-neutral-100 text-black border border-neutral-300 hover:bg-blue-100 hover:border-blue-400"
                                                            >
                                                                {n}
                                                            </button>
                                                        ))
                                                    )}
                                                    <button onClick={() => setAddingMemberSquad(null)} className="px-1.5 py-0.5 text-[10px] text-neutral-400 hover:text-black">取消</button>
                                                </div>
                                            ) : (
                                                <button
                                                    onClick={() => setAddingMemberSquad(si)}
                                                    className="text-[10px] text-neutral-400 hover:text-black"
                                                >
                                                    + 添加成员
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    ))}
                </div>
            </div>
        );
    }
);

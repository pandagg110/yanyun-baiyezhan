"use client";

import { PixelCard } from "@/components/pixel/pixel-card";
import { RosterMember } from "@/types/app";
import { useState } from "react";

interface RosterPlayerPoolProps {
    members: RosterMember[];
    assignedNames: Set<string>;
    isAdmin: boolean;
    onAddMember: (name: string) => void;
    onRemoveMember: (id: string) => void;
    onHistoryImport: () => void;
    onBatchAdd: (names: string[]) => void;
    onRenameMember: (id: string, newName: string) => void;
}

/** Parse signup list text into names */
function parseSignupList(text: string): string[] {
    const names: string[] = [];
    for (const line of text.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const stripped = trimmed.replace(/^\d+[\.\、\s]+/, "").trim();
        if (!stripped) continue;
        const name = stripped.split(/[\s（(]/)[0].trim();
        if (name && name.length >= 1) names.push(name);
    }
    return [...new Set(names)];
}

export function RosterPlayerPool({
    members, assignedNames, isAdmin, onAddMember, onRemoveMember, onHistoryImport, onBatchAdd, onRenameMember,
}: RosterPlayerPoolProps) {
    const [newName, setNewName] = useState("");
    const [searchQuery, setSearchQuery] = useState("");
    const [showBatchInput, setShowBatchInput] = useState(false);
    const [batchText, setBatchText] = useState("");
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editValue, setEditValue] = useState("");

    // Sort: unassigned first, assigned at bottom
    const sorted = [...members]
        .filter((m) => m.name.toLowerCase().includes(searchQuery.toLowerCase()))
        .sort((a, b) => {
            const aAssigned = assignedNames.has(a.name) ? 1 : 0;
            const bAssigned = assignedNames.has(b.name) ? 1 : 0;
            if (aAssigned !== bAssigned) return aAssigned - bAssigned;
            return a.name.localeCompare(b.name);
        });

    const handleAdd = () => { if (!newName.trim()) return; onAddMember(newName.trim()); setNewName(""); };
    const handleBatchSubmit = () => {
        const names = parseSignupList(batchText);
        if (names.length === 0) return;
        onBatchAdd(names);
        setBatchText("");
        setShowBatchInput(false);
    };
    const startEdit = (m: RosterMember) => { setEditingId(m.id); setEditValue(m.name); };
    const saveEdit = () => { if (!editingId || !editValue.trim()) return; onRenameMember(editingId, editValue.trim()); setEditingId(null); };

    const handleDragStart = (e: React.DragEvent, name: string) => {
        e.dataTransfer.setData("text/plain", name);
        e.dataTransfer.effectAllowed = "copyMove";
    };

    const unassignedCount = members.filter((m) => !assignedNames.has(m.name)).length;

    return (
        <PixelCard className="bg-neutral-800 flex flex-col" style={{ maxHeight: "calc(50vh)" }}>
            <div className="text-sm font-bold text-cyan-400 uppercase border-b-2 border-cyan-400/20 pb-1.5 shrink-0">
                👥 人员池 <span className="text-[10px] text-neutral-500 normal-case">{unassignedCount}/{members.length}</span>
            </div>

            <div className="shrink-0 mt-1.5">
                <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="搜索..."
                    className="w-full bg-neutral-900 border-2 border-neutral-700 rounded px-2 py-1 text-[11px] text-white focus:border-cyan-500 outline-none placeholder:text-neutral-600" />
            </div>

            {isAdmin && (
                <div className="flex gap-1 shrink-0 mt-1">
                    <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                        placeholder="添加..."
                        className="flex-1 min-w-0 bg-neutral-900 border-2 border-neutral-700 rounded px-2 py-1 text-[11px] text-white focus:border-cyan-500 outline-none placeholder:text-neutral-600" />
                    <button onClick={handleAdd} className="px-2 py-1 text-xs font-bold border-2 border-cyan-600 bg-cyan-500 text-black hover:bg-cyan-400 shrink-0">+</button>
                </div>
            )}

            {isAdmin && (
                <div className="flex gap-1 shrink-0 mt-1">
                    <button onClick={() => setShowBatchInput(!showBatchInput)}
                        className="flex-1 px-1 py-1 text-[10px] font-bold border-2 border-neutral-600 bg-neutral-700 text-neutral-300 hover:bg-neutral-600 uppercase">
                        📋 批量添加
                    </button>
                    <button onClick={onHistoryImport}
                        className="flex-1 px-1 py-1 text-[10px] font-bold border-2 border-neutral-600 bg-neutral-700 text-neutral-300 hover:bg-neutral-600 uppercase">
                        🕰️ 历史导入
                    </button>
                </div>
            )}

            {isAdmin && showBatchInput && (
                <div className="shrink-0 mt-1 space-y-1">
                    <textarea value={batchText} onChange={(e) => setBatchText(e.target.value)}
                        placeholder={"粘贴报名列表，如：\n1. 凉风\n2. 余明昭 陌刀"}
                        rows={5}
                        className="w-full bg-neutral-900 border-2 border-neutral-700 rounded px-2 py-1 text-[10px] text-white focus:border-cyan-500 outline-none placeholder:text-neutral-600 resize-none" />
                    <div className="flex gap-1">
                        <button onClick={handleBatchSubmit}
                            className="flex-1 px-2 py-1 text-[10px] font-bold border-2 border-green-600 bg-green-500 text-black hover:bg-green-400">确认导入</button>
                        <button onClick={() => { setShowBatchInput(false); setBatchText(""); }}
                            className="px-2 py-1 text-[10px] font-bold border-2 border-neutral-600 bg-neutral-700 text-neutral-300 hover:bg-neutral-600">取消</button>
                    </div>
                </div>
            )}

            <div className="flex-1 overflow-y-auto space-y-0.5 min-h-0 mt-1.5">
                {sorted.length === 0 ? (
                    <div className="text-[10px] text-neutral-600 text-center py-2">{searchQuery ? "无匹配" : "暂无"}</div>
                ) : (
                    sorted.map((member) => {
                        const isAssigned = assignedNames.has(member.name);
                        const isEditingThis = editingId === member.id;
                        return (
                            <div key={member.id}
                                draggable={isAdmin && !isEditingThis && !isAssigned}
                                onDragStart={(e) => handleDragStart(e, member.name)}
                                className={`group flex items-center justify-between px-1.5 py-1 border-2 text-[11px] transition-all
                                    ${isAdmin && !isEditingThis && !isAssigned ? "cursor-grab active:cursor-grabbing" : "cursor-default"}
                                    ${isAssigned
                                        ? "border-neutral-700/50 bg-neutral-800/30 text-neutral-600"
                                        : "border-neutral-600 bg-neutral-700 text-white hover:border-cyan-500/50"}`}>
                                {isEditingThis ? (
                                    <div className="flex items-center gap-1 w-full">
                                        <input value={editValue} onChange={(e) => setEditValue(e.target.value)}
                                            onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") setEditingId(null); }}
                                            className="flex-1 min-w-0 bg-neutral-900 text-white text-[11px] px-1 py-0 border border-cyan-500 outline-none" autoFocus />
                                        <button onClick={saveEdit} className="text-[9px] text-green-400">✓</button>
                                        <button onClick={() => setEditingId(null)} className="text-[9px] text-neutral-500">✕</button>
                                    </div>
                                ) : (
                                    <>
                                        <div className="flex items-center gap-1 min-w-0">
                                            <span className="text-[9px]">{isAssigned ? "✅" : "⬜"}</span>
                                            <span className="truncate">{member.name}</span>
                                        </div>
                                        {isAdmin && (
                                            <span className="inline-flex gap-0.5 shrink-0 ml-1 opacity-0 group-hover:opacity-100">
                                                <button onClick={() => startEdit(member)} className="text-[9px] text-neutral-500 hover:text-cyan-400" title="编辑">✎</button>
                                                <button onClick={() => onRemoveMember(member.id)} className="text-[9px] text-neutral-500 hover:text-red-400" title="删除">✕</button>
                                            </span>
                                        )}
                                    </>
                                )}
                            </div>
                        );
                    })
                )}
            </div>
        </PixelCard>
    );
}

"use client";

import { RosterOption } from "@/types/app";
import { useState } from "react";

interface RosterOptionsManagerProps {
    options: RosterOption[];
    onAdd: (label: string, color?: string, category?: string) => void;
    onDelete: (id: string) => void;
    onUpdate: (id: string, updates: { label?: string; color?: string | null }) => void;
}

const CATEGORIES = [
    { key: "守位", label: "守塔/守鹅/守车/铁桶" },
    { key: "打野", label: "打野" },
    { key: "25分boss", label: "25分boss" },
    { key: "15分boss", label: "15分boss" },
    { key: "general", label: "通用" },
];

export function RosterOptionsManager({ options, onAdd, onDelete, onUpdate }: RosterOptionsManagerProps) {
    const [newLabel, setNewLabel] = useState("");
    const [newColor, setNewColor] = useState("#d4edda");
    const [newCategory, setNewCategory] = useState("general");
    const [expanded, setExpanded] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editLabel, setEditLabel] = useState("");
    const [editColor, setEditColor] = useState("");

    const handleAdd = () => {
        if (!newLabel.trim()) return;
        onAdd(newLabel.trim(), newColor || undefined, newCategory);
        setNewLabel("");
    };

    const startEdit = (opt: RosterOption) => {
        setEditingId(opt.id);
        setEditLabel(opt.label);
        setEditColor(opt.color || "#ffffff");
    };
    const saveEdit = () => {
        if (!editingId) return;
        onUpdate(editingId, { label: editLabel, color: editColor });
        setEditingId(null);
    };
    const cancelEdit = () => setEditingId(null);

    const grouped = CATEGORIES.map((cat) => ({
        ...cat,
        items: options.filter((o) => o.category === cat.key),
    }));

    return (
        <div className="border-4 border-black bg-neutral-800 p-3 shadow-[4px_4px_0_0_#000] space-y-2">
            <button
                onClick={() => setExpanded(!expanded)}
                className="w-full text-left text-sm font-bold text-purple-400 uppercase flex justify-between items-center"
            >
                <span>🎨 选项管理</span>
                <span className="text-[10px] text-neutral-600">{expanded ? "▼" : "▶"} {options.length}项</span>
            </button>

            {expanded && (
                <div className="space-y-2 pt-1">
                    {/* Add new */}
                    <div className="space-y-1">
                        <div className="flex gap-1">
                            <select value={newCategory} onChange={(e) => setNewCategory(e.target.value)}
                                className="flex-1 min-w-0 bg-neutral-900 border-2 border-neutral-700 rounded px-1 py-1 text-[10px] text-white focus:border-purple-500 outline-none">
                                {CATEGORIES.map((c) => (<option key={c.key} value={c.key}>{c.label}</option>))}
                            </select>
                            <input type="color" value={newColor} onChange={(e) => setNewColor(e.target.value)}
                                className="w-7 h-7 border-2 border-neutral-700 bg-transparent cursor-pointer shrink-0" />
                        </div>
                        <div className="flex gap-1">
                            <input value={newLabel} onChange={(e) => setNewLabel(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                                placeholder="选项名..."
                                className="flex-1 min-w-0 bg-neutral-900 border-2 border-neutral-700 rounded px-2 py-1 text-[11px] text-white focus:border-purple-500 outline-none" />
                            <button onClick={handleAdd}
                                className="px-2 py-1 text-xs font-bold border-2 border-purple-600 bg-purple-500 text-black hover:bg-purple-400 shrink-0">+</button>
                        </div>
                    </div>

                    {/* Options grouped by category */}
                    <div className="max-h-[250px] overflow-y-auto space-y-2">
                        {grouped.map((group) =>
                            group.items.length > 0 && (
                                <div key={group.key}>
                                    <div className="text-[9px] text-neutral-500 uppercase font-bold mb-0.5">{group.label}</div>
                                    <div className="space-y-0.5">
                                        {group.items.map((opt) => (
                                            <div key={opt.id} className="group">
                                                {editingId === opt.id ? (
                                                    <div className="flex items-center gap-1 bg-neutral-900 p-1 rounded">
                                                        <input type="color" value={editColor} onChange={(e) => setEditColor(e.target.value)}
                                                            className="w-5 h-5 border border-neutral-600 bg-transparent cursor-pointer shrink-0" />
                                                        <input value={editLabel} onChange={(e) => setEditLabel(e.target.value)}
                                                            onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") cancelEdit(); }}
                                                            className="flex-1 min-w-0 bg-neutral-800 text-white text-[11px] px-1 py-0.5 border border-neutral-600 outline-none" autoFocus />
                                                        <button onClick={saveEdit} className="text-[9px] text-green-400 hover:text-green-300 shrink-0">✓</button>
                                                        <button onClick={cancelEdit} className="text-[9px] text-neutral-500 hover:text-white shrink-0">✕</button>
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center gap-1">
                                                        <span className="w-2.5 h-2.5 border border-neutral-600 shrink-0 cursor-pointer"
                                                            style={{ backgroundColor: opt.color || "transparent" }}
                                                            onClick={() => startEdit(opt)} />
                                                        <span className="flex-1 text-[11px] text-neutral-300 truncate cursor-pointer hover:text-white"
                                                            onClick={() => startEdit(opt)}>{opt.label}</span>
                                                        <button onClick={() => onDelete(opt.id)}
                                                            className="text-[9px] text-neutral-600 hover:text-red-400 opacity-0 group-hover:opacity-100 shrink-0">✕</button>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )
                        )}
                        {options.length === 0 && <div className="text-[10px] text-neutral-600 text-center py-2">暂无选项</div>}
                    </div>
                </div>
            )}
        </div>
    );
}

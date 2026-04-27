"use client";

import { RosterOption } from "@/types/app";
import { useState } from "react";

interface RosterOptionsManagerProps {
    options: RosterOption[];
    onAdd: (label: string, color?: string) => void;
    onDelete: (id: string) => void;
}

export function RosterOptionsManager({ options, onAdd, onDelete }: RosterOptionsManagerProps) {
    const [newLabel, setNewLabel] = useState("");
    const [newColor, setNewColor] = useState("#d4edda");
    const [expanded, setExpanded] = useState(false);

    const handleAdd = () => {
        if (!newLabel.trim()) return;
        onAdd(newLabel.trim(), newColor || undefined);
        setNewLabel("");
    };

    return (
        <div className="border-4 border-black bg-neutral-800 p-3 shadow-[4px_4px_0_0_#000] space-y-2">
            <button
                onClick={() => setExpanded(!expanded)}
                className="w-full text-left text-sm font-bold text-purple-400 uppercase flex justify-between items-center"
            >
                <span>🎨 下拉选项管理</span>
                <span className="text-[10px] text-neutral-600">{expanded ? "▼" : "▶"} {options.length}项</span>
            </button>

            {expanded && (
                <div className="space-y-2 pt-1">
                    {/* Add new */}
                    <div className="flex gap-1">
                        <input
                            value={newLabel}
                            onChange={(e) => setNewLabel(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                            placeholder="选项名..."
                            className="flex-1 bg-neutral-900 border-2 border-neutral-700 rounded px-2 py-1 text-xs text-white focus:border-purple-500 outline-none"
                        />
                        <input
                            type="color"
                            value={newColor}
                            onChange={(e) => setNewColor(e.target.value)}
                            className="w-8 h-8 border-2 border-neutral-700 bg-transparent cursor-pointer"
                        />
                        <button
                            onClick={handleAdd}
                            className="px-2 py-1 text-xs font-bold border-2 border-purple-600 bg-purple-500 text-black hover:bg-purple-400"
                        >
                            +
                        </button>
                    </div>

                    {/* Options list */}
                    <div className="max-h-[200px] overflow-y-auto space-y-0.5">
                        {options.map((opt) => (
                            <div key={opt.id} className="flex items-center gap-1.5 group">
                                <span
                                    className="w-3 h-3 border border-neutral-600 shrink-0"
                                    style={{ backgroundColor: opt.color || "transparent" }}
                                />
                                <span className="flex-1 text-xs text-neutral-300 truncate">{opt.label}</span>
                                <button
                                    onClick={() => onDelete(opt.id)}
                                    className="text-[10px] text-neutral-600 hover:text-red-400 opacity-0 group-hover:opacity-100"
                                >
                                    ✕
                                </button>
                            </div>
                        ))}
                        {options.length === 0 && (
                            <div className="text-[10px] text-neutral-600 text-center py-2">暂无选项，请添加</div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

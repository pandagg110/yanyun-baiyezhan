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
    onImportFromStats: () => void;
}

export function RosterPlayerPool({
    members,
    assignedNames,
    isAdmin,
    onAddMember,
    onRemoveMember,
    onImportFromStats,
}: RosterPlayerPoolProps) {
    const [newName, setNewName] = useState("");
    const [searchQuery, setSearchQuery] = useState("");

    const filtered = members.filter(m =>
        m.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const handleAdd = () => {
        if (!newName.trim()) return;
        onAddMember(newName.trim());
        setNewName("");
    };

    const handleDragStart = (e: React.DragEvent, name: string) => {
        e.dataTransfer.setData("text/plain", name);
        e.dataTransfer.setData("source", "pool");
        e.dataTransfer.effectAllowed = "copyMove";
    };

    return (
        <PixelCard className="bg-neutral-800 space-y-3 h-full flex flex-col">
            <div className="text-lg font-bold text-cyan-400 uppercase border-b-2 border-cyan-400/20 pb-2 shrink-0">
                👥 人员池
                <span className="text-xs text-neutral-500 ml-2 normal-case">
                    {members.length}人
                </span>
            </div>

            {/* Search */}
            <div className="shrink-0">
                <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="搜索成员..."
                    className="w-full bg-neutral-900 border-2 border-neutral-700 rounded px-2 py-1.5 text-xs text-white focus:border-cyan-500 outline-none placeholder:text-neutral-600"
                />
            </div>

            {/* Add Member (admin only) */}
            {isAdmin && (
                <div className="flex gap-1 shrink-0">
                    <input
                        type="text"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                        placeholder="添加成员..."
                        className="flex-1 bg-neutral-900 border-2 border-neutral-700 rounded px-2 py-1.5 text-xs text-white focus:border-cyan-500 outline-none placeholder:text-neutral-600"
                    />
                    <button
                        onClick={handleAdd}
                        className="px-2 py-1 text-xs font-bold border-2 border-cyan-600 bg-cyan-500 text-black hover:bg-cyan-400 transition-colors shrink-0"
                    >
                        +
                    </button>
                </div>
            )}

            {/* Import Button */}
            {isAdmin && (
                <button
                    onClick={onImportFromStats}
                    className="w-full px-2 py-1.5 text-[10px] font-bold border-2 border-neutral-600 bg-neutral-700 text-neutral-300 hover:bg-neutral-600 transition-colors uppercase tracking-wider"
                >
                    📥 从战绩导入
                </button>
            )}

            {/* Member List */}
            <div className="flex-1 overflow-y-auto space-y-1 min-h-0">
                {filtered.length === 0 ? (
                    <div className="text-xs text-neutral-600 text-center py-4">
                        {searchQuery ? "没有匹配的成员" : "暂无成员，请添加"}
                    </div>
                ) : (
                    filtered.map((member) => {
                        const isAssigned = assignedNames.has(member.name);
                        return (
                            <div
                                key={member.id}
                                draggable={isAdmin}
                                onDragStart={(e) => handleDragStart(e, member.name)}
                                className={`
                                    group flex items-center justify-between px-2 py-1.5 border-2 text-xs transition-all
                                    ${isAdmin ? "cursor-grab active:cursor-grabbing" : "cursor-default"}
                                    ${isAssigned
                                        ? "border-neutral-700 bg-neutral-800/50 text-neutral-500"
                                        : "border-neutral-600 bg-neutral-700 text-white hover:border-cyan-500/50"
                                    }
                                `}
                            >
                                <div className="flex items-center gap-1.5 min-w-0">
                                    <span className="text-[10px]">
                                        {isAssigned ? "✅" : "⬜"}
                                    </span>
                                    <span className="truncate">{member.name}</span>
                                </div>
                                {isAdmin && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onRemoveMember(member.id);
                                        }}
                                        className="text-[10px] text-neutral-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 shrink-0 ml-1"
                                        title="移除"
                                    >
                                        ✕
                                    </button>
                                )}
                            </div>
                        );
                    })
                )}
            </div>

            {/* Stats */}
            <div className="text-[10px] text-neutral-600 shrink-0 border-t border-neutral-700 pt-2">
                已分配 {assignedNames.size} / {members.length}
            </div>
        </PixelCard>
    );
}

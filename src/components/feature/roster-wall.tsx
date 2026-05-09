"use client";

import { WallTower } from "@/types/app";
import React, { forwardRef, useState } from "react";

interface RosterWallProps {
    towers: WallTower[];
    isAdmin: boolean;
    availableMembers: string[];
    wallAssignedNames: Set<string>;
    globalAssignedNames: Set<string>;
    onTowersChange: (towers: WallTower[]) => void;
}

const TOWER_COLORS: Record<string, string> = {
    "上塔": "#f3e0d0",
    "中塔": "#d0e0f3",
    "下塔": "#d0f3d8",
};

const TOWER_EMOJI: Record<string, string> = {
    "上塔": "🔺",
    "中塔": "🔷",
    "下塔": "🔻",
};

export const RosterWall = forwardRef<HTMLDivElement, RosterWallProps>(
    function RosterWall({ towers, isAdmin, availableMembers, wallAssignedNames, globalAssignedNames, onTowersChange }, ref) {
        const [dragOverTower, setDragOverTower] = useState<number | null>(null);

        const addMember = (ti: number, name: string) => {
            if (towers[ti].members.length >= 3) return;
            if (wallAssignedNames.has(name)) return;
            const next = towers.map((t, i) => i === ti ? { ...t, members: [...t.members, name] } : { ...t });
            onTowersChange(next);
        };

        const removeMember = (ti: number, mi: number) => {
            const next = towers.map((t, i) =>
                i === ti ? { ...t, members: t.members.filter((_, j) => j !== mi) } : { ...t }
            );
            onTowersChange(next);
        };

        const handleDragOver = (e: React.DragEvent, ti: number) => {
            if (!isAdmin) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
            setDragOverTower(ti);
        };

        const handleDrop = (e: React.DragEvent, ti: number) => {
            e.preventDefault();
            setDragOverTower(null);
            if (!isAdmin) return;
            const name = e.dataTransfer.getData("text/plain");
            if (name) addMember(ti, name);
        };

        return (
            <div ref={ref} className="bg-white p-3">
                {/* Title */}
                <div className="text-center font-bold text-lg mb-3" style={{ color: "#333" }}>
                    🧱 人墙站位
                </div>

                {/* Visual map with positions */}
                <div className="flex items-stretch gap-0 mb-2" style={{ minHeight: 180 }}>


                    {/* Towers */}
                    <div className="flex-1 flex gap-2">
                        {towers.map((tower, ti) => {
                            const bgColor = TOWER_COLORS[tower.name] || "#f0f0f0";
                            const emoji = TOWER_EMOJI[tower.name] || "🏰";
                            const isDragOver = dragOverTower === ti;
                            return (
                                <div key={ti} className="flex-1 flex flex-col"
                                    onDragOver={(e) => handleDragOver(e, ti)}
                                    onDragLeave={() => setDragOverTower(null)}
                                    onDrop={(e) => handleDrop(e, ti)}>
                                    {/* Tower header */}
                                    <div className="text-center font-bold py-1.5 border-2 border-b-0 rounded-t"
                                        style={{ backgroundColor: bgColor, borderColor: "#bbb", color: "#333", fontSize: 13 }}>
                                        {emoji} {tower.name}
                                    </div>
                                    {/* Slots */}
                                    <div className={`flex-1 border-2 rounded-b flex flex-col transition-colors ${isDragOver ? "border-cyan-400 bg-cyan-50" : ""}`}
                                        style={{ borderColor: isDragOver ? undefined : "#bbb", backgroundColor: isDragOver ? undefined : "#fafafa" }}>
                                        {[0, 1, 2].map((row) => {
                                            const member = tower.members[row];
                                            return (
                                                <div key={row} className="flex-1 flex items-center justify-center border-b last:border-b-0"
                                                    style={{ borderColor: "#e0e0e0", minHeight: 38 }}>
                                                    {member ? (
                                                        <div className="flex items-center gap-1">
                                                            <span className="font-bold text-[12px]" style={{ color: "#222" }}>{member}</span>
                                                            {isAdmin && (
                                                                <button onClick={() => removeMember(ti, row)}
                                                                    className="text-[9px] text-neutral-400 hover:text-red-500" data-no-export>✕</button>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <span className="text-[10px]" style={{ color: isDragOver ? "#0891b2" : "#ccc" }}>
                                                            {isDragOver ? "📥" : `位置${row + 1}`}
                                                        </span>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Legend */}
                <div className="flex justify-center gap-4 text-[10px]" style={{ color: "#999" }}>
                    {towers.map((t) => (
                        <span key={t.name} className="flex items-center gap-1">
                            <span className="inline-block w-3 h-3 border" style={{ backgroundColor: TOWER_COLORS[t.name], borderColor: "#ccc" }} />
                            {t.name} ({t.members.length}/3)
                        </span>
                    ))}
                </div>
            </div>
        );
    }
);

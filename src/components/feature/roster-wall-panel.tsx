"use client";

import { PixelCard } from "@/components/pixel/pixel-card";
import React, { useState } from "react";

interface RosterWallPanelProps {
    wall: { top: string[]; mid: string[]; bottom: string[] };
    isAdmin: boolean;
    onDrop: (lane: "top" | "mid" | "bottom", name: string) => void;
    onRemove: (lane: "top" | "mid" | "bottom", name: string) => void;
}

const LANE_CONFIG: { key: "top" | "mid" | "bottom"; label: string; emoji: string }[] = [
    { key: "top", label: "上路", emoji: "🔼" },
    { key: "mid", label: "中路", emoji: "⏺️" },
    { key: "bottom", label: "下路", emoji: "🔽" },
];

const MAX_PER_LANE = 3;

function LaneSlot({
    config,
    members,
    isAdmin,
    onDrop,
    onRemove,
}: {
    config: (typeof LANE_CONFIG)[0];
    members: string[];
    isAdmin: boolean;
    onDrop: (lane: "top" | "mid" | "bottom", name: string) => void;
    onRemove: (lane: "top" | "mid" | "bottom", name: string) => void;
}) {
    const [isDragOver, setIsDragOver] = useState(false);
    const isFull = members.length >= MAX_PER_LANE;

    const handleDragOver = (e: React.DragEvent) => {
        if (!isAdmin || isFull) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        setIsDragOver(true);
    };

    const handleDragLeave = () => setIsDragOver(false);

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);
        if (!isAdmin || isFull) return;
        const name = e.dataTransfer.getData("text/plain");
        if (!name) return;
        onDrop(config.key, name);
    };

    const handleMemberDragStart = (e: React.DragEvent, name: string) => {
        e.dataTransfer.setData("text/plain", name);
        e.dataTransfer.setData("source", `wall:${config.key}`);
        e.dataTransfer.effectAllowed = "move";
    };

    return (
        <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`
                border-2 p-2 transition-colors min-h-[80px]
                ${isDragOver ? "border-purple-400 bg-purple-500/10" : "border-neutral-700"}
            `}
        >
            <div className="text-[10px] font-bold uppercase tracking-wider mb-1.5 text-purple-400 flex items-center justify-between">
                <span>{config.emoji} {config.label}</span>
                <span className="text-neutral-600">
                    {members.length}/{MAX_PER_LANE}
                </span>
            </div>

            <div className="space-y-1">
                {members.map((name, i) => (
                    <div
                        key={`${name}-${i}`}
                        draggable={isAdmin}
                        onDragStart={(e) => handleMemberDragStart(e, name)}
                        className={`
                            group flex items-center justify-between px-1.5 py-1 text-xs border transition-all
                            ${isAdmin ? "cursor-grab active:cursor-grabbing" : "cursor-default"}
                            border-purple-500/30 bg-purple-500/10 text-purple-200
                        `}
                    >
                        <span className="truncate">{name}</span>
                        {isAdmin && (
                            <button
                                onClick={() => onRemove(config.key, name)}
                                className="text-[10px] text-neutral-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 shrink-0 ml-1"
                            >
                                ✕
                            </button>
                        )}
                    </div>
                ))}

                {/* Empty slots */}
                {Array.from({ length: MAX_PER_LANE - members.length }).map((_, i) => (
                    <div
                        key={`empty-${i}`}
                        className="px-1.5 py-1 text-[10px] text-neutral-700 border border-dashed border-neutral-800"
                    >
                        空位
                    </div>
                ))}
            </div>
        </div>
    );
}

export function RosterWallPanel({
    wall,
    isAdmin,
    onDrop,
    onRemove,
}: RosterWallPanelProps) {
    return (
        <PixelCard className="bg-neutral-800 space-y-2">
            <div className="text-lg font-bold text-purple-400 uppercase border-b-2 border-purple-400/20 pb-2">
                🧱 人墙
            </div>
            <div className="text-[10px] text-neutral-500 mb-1">
                每路最多3人，可与阶段区复用
            </div>
            <div className="grid grid-cols-3 gap-2">
                {LANE_CONFIG.map((config) => (
                    <LaneSlot
                        key={config.key}
                        config={config}
                        members={wall[config.key]}
                        isAdmin={isAdmin}
                        onDrop={onDrop}
                        onRemove={onRemove}
                    />
                ))}
            </div>
        </PixelCard>
    );
}

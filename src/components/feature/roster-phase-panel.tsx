"use client";

import { PixelCard } from "@/components/pixel/pixel-card";
import React, { useState } from "react";

interface RosterPhasePanelProps {
    phases: Record<string, string[]>;
    isAdmin: boolean;
    onDrop: (phaseKey: string, name: string) => void;
    onRemove: (phaseKey: string, name: string) => void;
}

const PHASE_CONFIG: { key: string; label: string; emoji: string; color: string }[] = [
    { key: "guard_tower", label: "守塔", emoji: "🏰", color: "text-amber-400" },
    { key: "guard_extra", label: "守额", emoji: "💰", color: "text-yellow-400" },
    { key: "guard_cart", label: "守车", emoji: "🚗", color: "text-orange-400" },
    { key: "opening_plan", label: "开局规划", emoji: "📋", color: "text-green-400" },
    { key: "iron_barrel", label: "铁桶", emoji: "🛢️", color: "text-purple-400" },
    { key: "jungling", label: "打野", emoji: "🌿", color: "text-emerald-400" },
    { key: "disadvantage", label: "劣势野区规划", emoji: "⚠️", color: "text-red-400" },
];

function PhaseBlock({
    config,
    members,
    isAdmin,
    onDrop,
    onRemove,
}: {
    config: (typeof PHASE_CONFIG)[0];
    members: string[];
    isAdmin: boolean;
    onDrop: (phaseKey: string, name: string) => void;
    onRemove: (phaseKey: string, name: string) => void;
}) {
    const [isDragOver, setIsDragOver] = useState(false);
    const [collapsed, setCollapsed] = useState(false);

    const handleDragOver = (e: React.DragEvent) => {
        if (!isAdmin) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        setIsDragOver(true);
    };

    const handleDragLeave = () => setIsDragOver(false);

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);
        if (!isAdmin) return;
        const name = e.dataTransfer.getData("text/plain");
        if (!name) return;
        onDrop(config.key, name);
    };

    const handleMemberDragStart = (e: React.DragEvent, name: string) => {
        e.dataTransfer.setData("text/plain", name);
        e.dataTransfer.setData("source", `phase:${config.key}`);
        e.dataTransfer.effectAllowed = "move";
    };

    return (
        <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`
                border-2 transition-colors
                ${isDragOver ? "border-yellow-400 bg-yellow-500/5" : "border-neutral-700 bg-neutral-800/50"}
            `}
        >
            {/* Header */}
            <button
                onClick={() => setCollapsed(!collapsed)}
                className="w-full flex items-center justify-between px-2.5 py-2 text-left"
            >
                <div className="flex items-center gap-1.5">
                    <span className="text-sm">{config.emoji}</span>
                    <span className={`text-xs font-bold uppercase ${config.color}`}>
                        {config.label}
                    </span>
                    {members.length > 0 && (
                        <span className="text-[10px] bg-neutral-700 px-1.5 py-0.5 rounded text-neutral-300">
                            {members.length}
                        </span>
                    )}
                </div>
                <span className="text-[10px] text-neutral-600">
                    {collapsed ? "▶" : "▼"}
                </span>
            </button>

            {/* Body */}
            {!collapsed && (
                <div className="px-2.5 pb-2 min-h-[40px]">
                    {members.length === 0 ? (
                        <div className="text-[10px] text-neutral-700 py-1">
                            {isAdmin ? "拖入人员..." : "无人员"}
                        </div>
                    ) : (
                        <div className="flex flex-wrap gap-1">
                            {members.map((name, i) => (
                                <div
                                    key={`${name}-${i}`}
                                    draggable={isAdmin}
                                    onDragStart={(e) => handleMemberDragStart(e, name)}
                                    className={`
                                        group inline-flex items-center gap-1 px-2 py-0.5 text-xs border transition-all
                                        ${isAdmin ? "cursor-grab active:cursor-grabbing" : "cursor-default"}
                                        border-neutral-600 bg-neutral-700 text-neutral-200
                                    `}
                                >
                                    <span>{name}</span>
                                    {isAdmin && (
                                        <button
                                            onClick={() => onRemove(config.key, name)}
                                            className="text-[10px] text-neutral-500 hover:text-red-400 transition-colors"
                                        >
                                            ✕
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export function RosterPhasePanel({
    phases,
    isAdmin,
    onDrop,
    onRemove,
}: RosterPhasePanelProps) {
    return (
        <PixelCard className="bg-neutral-800 space-y-2">
            <div className="text-lg font-bold text-yellow-400 uppercase border-b-2 border-yellow-400/20 pb-2">
                📊 阶段战术
            </div>
            <div className="text-[10px] text-neutral-500 mb-1">
                同一人可出现在多个阶段（允许复用）
            </div>
            <div className="space-y-1.5">
                {PHASE_CONFIG.map((config) => (
                    <PhaseBlock
                        key={config.key}
                        config={config}
                        members={phases[config.key] || []}
                        isAdmin={isAdmin}
                        onDrop={onDrop}
                        onRemove={onRemove}
                    />
                ))}
            </div>
        </PixelCard>
    );
}

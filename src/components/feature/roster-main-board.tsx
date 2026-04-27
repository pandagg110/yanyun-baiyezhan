"use client";

import { PixelCard } from "@/components/pixel/pixel-card";
import React, { useState } from "react";

interface RosterMainBoardProps {
    attack: { squad_1: string[]; squad_2: string[]; squad_3: string[] };
    defense: { squad_1: string[]; squad_2: string[]; squad_3: string[] };
    isAdmin: boolean;
    onDrop: (side: "attack" | "defense", squad: string, name: string) => void;
    onRemove: (side: "attack" | "defense", squad: string, name: string) => void;
    onSwap: (
        fromSide: "attack" | "defense", fromSquad: string, name: string,
        toSide: "attack" | "defense", toSquad: string
    ) => void;
}

const SQUAD_LABELS: Record<string, string> = {
    squad_1: "1队",
    squad_2: "2队",
    squad_3: "3队",
};

const MAX_PER_SQUAD = 5;

function SquadSlot({
    side,
    squadKey,
    members,
    isAdmin,
    onDrop,
    onRemove,
}: {
    side: "attack" | "defense";
    squadKey: string;
    members: string[];
    isAdmin: boolean;
    onDrop: (side: "attack" | "defense", squad: string, name: string) => void;
    onRemove: (side: "attack" | "defense", squad: string, name: string) => void;
}) {
    const [isDragOver, setIsDragOver] = useState(false);
    const isFull = members.length >= MAX_PER_SQUAD;

    const handleDragOver = (e: React.DragEvent) => {
        if (!isAdmin) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setIsDragOver(true);
    };

    const handleDragLeave = () => setIsDragOver(false);

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);
        if (!isAdmin) return;
        const name = e.dataTransfer.getData("text/plain");
        if (!name) return;
        onDrop(side, squadKey, name);
    };

    const handleMemberDragStart = (e: React.DragEvent, name: string) => {
        e.dataTransfer.setData("text/plain", name);
        e.dataTransfer.setData("source", `board:${side}:${squadKey}`);
        e.dataTransfer.effectAllowed = "move";
    };

    const sideColor = side === "attack" ? "red" : "blue";
    const borderColor = isDragOver
        ? (side === "attack" ? "border-red-400" : "border-blue-400")
        : "border-neutral-700";
    const bgHighlight = isDragOver
        ? (side === "attack" ? "bg-red-500/10" : "bg-blue-500/10")
        : "";

    return (
        <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`border-2 ${borderColor} ${bgHighlight} p-2 transition-colors min-h-[120px]`}
        >
            <div className={`text-[10px] font-bold uppercase tracking-wider mb-1.5 ${
                side === "attack" ? "text-red-400" : "text-blue-400"
            }`}>
                {SQUAD_LABELS[squadKey]}
                <span className="text-neutral-600 ml-1">
                    {members.length}/{MAX_PER_SQUAD}
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
                            ${side === "attack"
                                ? "border-red-500/30 bg-red-500/10 text-red-200"
                                : "border-blue-500/30 bg-blue-500/10 text-blue-200"
                            }
                        `}
                    >
                        <span className="truncate">{name}</span>
                        {isAdmin && (
                            <button
                                onClick={() => onRemove(side, squadKey, name)}
                                className="text-[10px] text-neutral-600 hover:text-white transition-colors opacity-0 group-hover:opacity-100 shrink-0 ml-1"
                            >
                                ✕
                            </button>
                        )}
                    </div>
                ))}

                {/* Empty slots */}
                {Array.from({ length: MAX_PER_SQUAD - members.length }).map((_, i) => (
                    <div
                        key={`empty-${i}`}
                        className="px-1.5 py-1 text-[10px] text-neutral-700 border border-dashed border-neutral-800"
                    >
                        空位
                    </div>
                ))}
            </div>

            {isFull && (
                <div className={`text-[10px] mt-1 ${
                    side === "attack" ? "text-red-500/60" : "text-blue-500/60"
                }`}>
                    已满
                </div>
            )}
        </div>
    );
}

export function RosterMainBoard({
    attack,
    defense,
    isAdmin,
    onDrop,
    onRemove,
    onSwap,
}: RosterMainBoardProps) {
    const attackTotal = attack.squad_1.length + attack.squad_2.length + attack.squad_3.length;
    const defenseTotal = defense.squad_1.length + defense.squad_2.length + defense.squad_3.length;

    return (
        <div className="space-y-4">
            {/* Attack Section */}
            <PixelCard className="bg-neutral-800 space-y-2">
                <div className="flex items-center justify-between border-b-2 border-red-500/20 pb-2">
                    <div className="text-lg font-bold text-red-400 uppercase">
                        ⚔️ 进攻
                    </div>
                    <div className="text-xs text-neutral-500">
                        {attackTotal}/15
                    </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                    {(["squad_1", "squad_2", "squad_3"] as const).map((sq) => (
                        <SquadSlot
                            key={sq}
                            side="attack"
                            squadKey={sq}
                            members={attack[sq]}
                            isAdmin={isAdmin}
                            onDrop={onDrop}
                            onRemove={onRemove}
                        />
                    ))}
                </div>
            </PixelCard>

            {/* Defense Section */}
            <PixelCard className="bg-neutral-800 space-y-2">
                <div className="flex items-center justify-between border-b-2 border-blue-500/20 pb-2">
                    <div className="text-lg font-bold text-blue-400 uppercase">
                        🛡️ 防守
                    </div>
                    <div className="text-xs text-neutral-500">
                        {defenseTotal}/15
                    </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                    {(["squad_1", "squad_2", "squad_3"] as const).map((sq) => (
                        <SquadSlot
                            key={sq}
                            side="defense"
                            squadKey={sq}
                            members={defense[sq]}
                            isAdmin={isAdmin}
                            onDrop={onDrop}
                            onRemove={onRemove}
                        />
                    ))}
                </div>
            </PixelCard>
        </div>
    );
}

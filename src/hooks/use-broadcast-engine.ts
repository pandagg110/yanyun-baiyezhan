import { useState, useEffect } from 'react';

export interface BroadcastConfig {
    roundDuration: number; // in seconds
    broadcastInterval: number; // in seconds
    memberCount: number;
}

export interface BroadcastState {
    currentTick: number; // 0, 1, 2...
    currentAssigneeIndex: number | null; // Who should act now?
    roundStatus: 'WAITING' | 'ACTIVE' | 'COOLDOWN' | 'COMPLETED';
    progress: number; // 0-100% of the current interval
    elapsed: number; // total seconds elapsed in round
    isMyTurn: boolean;
    nextTickIn: number; // seconds until next tick
}

/**
 * The "Local Deduction" Engine.
 * Calculates state purely based on (Now - StartTime).
 */
export function useBroadcastEngine(
    startTime: number | null, // timestamp in ms. null means not running.
    config: BroadcastConfig,
    myOrderIndex?: number
): BroadcastState {
    const [now, setNow] = useState(Date.now());

    // High-frequency update loop
    useEffect(() => {
        if (!startTime) return;

        const intervalId = setInterval(() => {
            setNow(Date.now());
        }, 100); // 10Hz updates for smooth progress bars

        return () => clearInterval(intervalId);
    }, [startTime]);

    if (!startTime) {
        return {
            currentTick: 0,
            currentAssigneeIndex: null,
            roundStatus: 'WAITING',
            progress: 0,
            elapsed: 0,
            isMyTurn: false,
            nextTickIn: 0,
        };
    }

    const elapsedMs = now - startTime;
    const elapsedSeconds = elapsedMs / 1000;
    const roundDuration = config.roundDuration;

    // Calculate Round Status & Loop logic
    // PRD: "round_start_time += round_duration" implies infinite looping.
    // We can simulate this by modulo if we want continuous loops, 
    // or we can handle just one loop and let the parent component update the "startTime" for the next round.
    // PRD A: "elapsed >= round_duration -> round_start_time += round_duration" -> This suggests the SERVER time updates? 
    // OR the client treats it as a modulus.
    // "Local Deduction" implies we should treat it as (TotalElapsed % RoundDuration).

    // However, PRD says "Truth Source: round_start_time ... unless owner resets".
    // And "Auto enter next round".
    // So effective local elapsed = (TotalElapsed % RoundDuration).

    const currentRoundElapsed = elapsedSeconds % roundDuration;
    const tick = Math.floor(currentRoundElapsed / config.broadcastInterval);

    const isCooldown = tick >= config.memberCount;

    // Calculate progress within current interval
    const intervalProgress = (currentRoundElapsed % config.broadcastInterval) / config.broadcastInterval;

    // Calculate time remaining in current tick
    const nextTickIn = config.broadcastInterval - (currentRoundElapsed % config.broadcastInterval);

    return {
        currentTick: tick,
        currentAssigneeIndex: isCooldown ? null : tick, // If tick < memberCount, index is tick.
        roundStatus: 'ACTIVE', // Always active once started, until paused (startTime = null)
        progress: intervalProgress * 100,
        elapsed: currentRoundElapsed,
        isMyTurn: myOrderIndex !== undefined && tick === myOrderIndex && !isCooldown,
        nextTickIn,
    };
}

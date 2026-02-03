import { useState, useEffect, useRef } from 'react';

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
 * 
 * Uses Web Worker for timer to prevent Chrome background tab throttling.
 */
export function useBroadcastEngine(
    startTime: number | null, // timestamp in ms. null means not running.
    config: BroadcastConfig,
    myOrderIndex?: number,
    mode: 'auto' | 'manual' = 'auto'
): BroadcastState {
    const [now, setNow] = useState(() => Date.now());
    const workerRef = useRef<Worker | null>(null);

    // High-frequency update loop using Web Worker (immune to background throttling)
    useEffect(() => {
        if (startTime === null) {
            // Stop worker if not running
            if (workerRef.current) {
                workerRef.current.postMessage({ command: 'stop' });
                workerRef.current.terminate();
                workerRef.current = null;
            }
            return;
        }

        // Create Web Worker for timer
        const worker = new Worker('/workers/timer-worker.js');
        workerRef.current = worker;

        worker.onmessage = (e) => {
            if (e.data.type === 'tick') {
                setNow(Date.now());
            }
        };

        // Start timer at 10Hz for smooth progress bars
        worker.postMessage({ command: 'start', interval: 100 });

        return () => {
            worker.postMessage({ command: 'stop' });
            worker.terminate();
            workerRef.current = null;
        };
    }, [startTime]);

    console.log("Hooks Debug:", { startTime, mode });
    if (startTime === null) {
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

    // --- LOGIC BRANCHING ---
    let tick: number;
    let nextTickIn: number;
    let intervalProgress: number;
    let isCooldown: boolean;

    if (mode === 'manual') {
        // MANUAL MODE
        // Tick is controlled by server via 'round_start_time' column (overloaded).
        // startTime is the raw value from that column.
        tick = startTime ?? 0;
        isCooldown = tick >= config.memberCount;

        // In manual mode, progress can be just visual or based on some timeout if we had one.
        // For now let's just make it full or pulsating? 
        // Let's just set it to 100% to show active.
        intervalProgress = 1;
        nextTickIn = 0;

    } else {
        // AUTO MODE (Legacy)
        const currentRoundElapsed = elapsedSeconds % roundDuration;
        tick = Math.floor(currentRoundElapsed / config.broadcastInterval);
        isCooldown = tick >= config.memberCount;

        // Calculate progress within current interval
        intervalProgress = (currentRoundElapsed % config.broadcastInterval) / config.broadcastInterval;

        // Calculate time remaining in current tick
        nextTickIn = config.broadcastInterval - (currentRoundElapsed % config.broadcastInterval);
    }

    // Safety clamp (though tick logic above handles it for auto)
    if (isCooldown) {
        // maybe visual feedback?
    }

    return {
        currentTick: tick,
        currentAssigneeIndex: isCooldown ? null : tick, // If tick < memberCount, index is tick.
        roundStatus: 'ACTIVE', // Always active once started, until paused (startTime = null)
        progress: intervalProgress * 100,
        elapsed: elapsedSeconds, // Only correct for auto really, but useful for debug
        isMyTurn: myOrderIndex !== undefined && tick === myOrderIndex && !isCooldown,
        nextTickIn,
    };
}

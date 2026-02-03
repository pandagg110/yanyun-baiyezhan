import { useEffect, useRef, useCallback } from 'react';

/**
 * A hook that provides a timer using Web Workers.
 * Unlike setInterval in the main thread, this timer continues to run
 * reliably even when the browser tab is in the background or minimized.
 * 
 * This is how apps like Discord/Kook maintain background functionality.
 */
export function useWorkerTimer(
    callback: () => void,
    interval: number = 100,
    enabled: boolean = true
) {
    const workerRef = useRef<Worker | null>(null);
    const callbackRef = useRef(callback);

    // Keep callback ref updated
    useEffect(() => {
        callbackRef.current = callback;
    }, [callback]);

    // Initialize and manage worker
    useEffect(() => {
        if (!enabled) {
            // Stop worker if disabled
            if (workerRef.current) {
                workerRef.current.postMessage({ command: 'stop' });
                workerRef.current.terminate();
                workerRef.current = null;
            }
            return;
        }

        // Create worker
        const worker = new Worker('/workers/timer-worker.js');
        workerRef.current = worker;

        // Handle messages from worker
        worker.onmessage = (e) => {
            if (e.data.type === 'tick') {
                callbackRef.current();
            }
        };

        // Start the timer
        worker.postMessage({ command: 'start', interval });

        // Cleanup
        return () => {
            worker.postMessage({ command: 'stop' });
            worker.terminate();
            workerRef.current = null;
        };
    }, [interval, enabled]);

    // Return a manual trigger function if needed
    const trigger = useCallback(() => {
        callbackRef.current();
    }, []);

    return { trigger };
}

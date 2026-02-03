// Timer Worker - runs in background thread, immune to tab throttling
let intervalId = null;

self.onmessage = function (e) {
    const { command, interval } = e.data;

    if (command === 'start') {
        // Clear any existing interval
        if (intervalId) {
            clearInterval(intervalId);
        }

        // Start new interval - this runs reliably even when tab is in background
        intervalId = setInterval(() => {
            self.postMessage({ type: 'tick', timestamp: Date.now() });
        }, interval || 100);

        // Send immediate first tick
        self.postMessage({ type: 'tick', timestamp: Date.now() });

    } else if (command === 'stop') {
        if (intervalId) {
            clearInterval(intervalId);
            intervalId = null;
        }
    }
};

/**
 * Backup clock for `GameEngine.loop` when `requestAnimationFrame` stalls.
 *
 * Browsers stop or throttle animation frames for hidden pages (minimized windows, background
 * tabs, hidden embedded browser panes). The simulation ticks on rAF, and in co-op the host's
 * ticks drive everyone, so a stalled host froze the whole battle. This clock calls back at a
 * steady interval so the engine can tell when rAF has gone quiet and step the simulation itself.
 *
 * It prefers a dedicated Web Worker timer: main-thread timers in hidden pages are throttled to
 * about 1 Hz (and lower after a few minutes), while worker timers keep their rate. It falls back
 * to `setInterval` where workers are unavailable (tests, node).
 */

export type StopLoopClock = () => void;

const WORKER_SOURCE = `let id = null;
onmessage = (e) => {
    if (id != null) clearInterval(id);
    id = e.data > 0 ? setInterval(() => postMessage(0), e.data) : null;
};`;

function startWorkerClock(intervalMs: number, onTick: () => void): StopLoopClock | null {
    if (typeof Worker === 'undefined' || typeof Blob === 'undefined' || typeof URL?.createObjectURL !== 'function') {
        return null;
    }
    try {
        const url = URL.createObjectURL(new Blob([WORKER_SOURCE], { type: 'text/javascript' }));
        const worker = new Worker(url);
        URL.revokeObjectURL(url);
        worker.onmessage = () => onTick();
        worker.postMessage(intervalMs);
        return () => {
            worker.onmessage = null;
            worker.terminate();
        };
    } catch {
        // CSP or sandbox without blob workers: use the main-thread timer.
        return null;
    }
}

export function startLoopClock(intervalMs: number, onTick: () => void): StopLoopClock {
    const stopWorker = startWorkerClock(intervalMs, onTick);
    if (stopWorker) return stopWorker;
    const id = setInterval(onTick, intervalMs);
    return () => clearInterval(id);
}

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    PERFORMANCE_HISTORY_CAPACITY,
    PERFORMANCE_LOG_DESCRIPTION,
    TickPerformanceTracker,
} from './tickPerformanceTracker';

describe('TickPerformanceTracker', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('is a no-op when disabled', () => {
        const tracker = new TickPerformanceTracker();
        tracker.measure(['engine', 'units'], () => undefined);
        expect(tracker.finalizeLastGameTick()).toBeNull();
        expect(tracker.getLastPerformanceLog()).toBeNull();
    });

    it('builds nested inclusive totals for the last game tick', () => {
        const tracker = new TickPerformanceTracker();
        tracker.setEnabled(true);

        let now = 1000;
        vi.spyOn(performance, 'now').mockImplementation(() => now);

        tracker.begin('engine');
        now += 10;
        tracker.begin('units');
        now += 40;
        tracker.end(); // units = 40
        now += 10;
        tracker.begin('projectiles');
        now += 20;
        tracker.end(); // projectiles = 20
        now += 5;
        tracker.end(); // engine inclusive = 10+40+10+20+5 = 85

        tracker.measure(['ui', 'canvas', 'units'], () => {
            now += 15;
        });

        const log = tracker.finalizeLastGameTick();
        expect(log).not.toBeNull();
        expect(log!.description).toBe(PERFORMANCE_LOG_DESCRIPTION);
        expect(log!.engine).toMatchObject({
            totalTimeTaken: 85,
            units: { totalTimeTaken: 40 },
            projectiles: { totalTimeTaken: 20 },
        });
        expect(log!.ui).toMatchObject({
            totalTimeTaken: 15,
            canvas: {
                totalTimeTaken: 15,
                units: { totalTimeTaken: 15 },
            },
        });
        expect(log!.totalTimeTaken).toBe(100);
        expect(tracker.getLastPerformanceLog()).toBe(log);

        // Accumulator clears; last log remains until the next finalize.
        expect(tracker.finalizeLastGameTick()?.totalTimeTaken).toBe(0);
    });

    it('accumulates repeated samples under the same path', () => {
        const tracker = new TickPerformanceTracker();
        tracker.setEnabled(true);

        let now = 0;
        vi.spyOn(performance, 'now').mockImplementation(() => now);

        tracker.measure(['ui', 'canvas'], () => {
            now += 10;
        });
        tracker.measure(['ui', 'canvas'], () => {
            now += 7;
        });

        const log = tracker.finalizeLastGameTick();
        expect(log!.ui).toMatchObject({
            totalTimeTaken: 17,
            canvas: { totalTimeTaken: 17 },
        });
    });

    it('clears state when disabled', () => {
        const tracker = new TickPerformanceTracker();
        tracker.setEnabled(true);
        tracker.addAbsolute(['engine'], 12);
        tracker.finalizeLastGameTick(5);
        expect(tracker.getLastPerformanceLog()?.totalTimeTaken).toBe(12);
        expect(tracker.getHistory()).toHaveLength(1);

        tracker.setEnabled(false);
        expect(tracker.getLastPerformanceLog()).toBeNull();
        expect(tracker.getHistory()).toHaveLength(0);
    });

    it('keeps a ring buffer of the last PERFORMANCE_HISTORY_CAPACITY ticks', () => {
        const tracker = new TickPerformanceTracker();
        tracker.setEnabled(true);
        for (let i = 1; i <= PERFORMANCE_HISTORY_CAPACITY + 3; i++) {
            tracker.addAbsolute(['engine'], i);
            tracker.finalizeLastGameTick(i);
        }
        const history = tracker.getHistory();
        expect(history).toHaveLength(PERFORMANCE_HISTORY_CAPACITY);
        expect(history[0]!.gameTick).toBe(4);
        expect(history[history.length - 1]!.gameTick).toBe(PERFORMANCE_HISTORY_CAPACITY + 3);
    });
});

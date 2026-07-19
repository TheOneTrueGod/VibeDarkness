import { describe, expect, it } from 'vitest';
import {
    PERFORMANCE_WINDOW_SIZE,
    aggregatePerformanceWindow,
    buildPerformanceWindows,
    extractPerformanceSample,
    samplesToChartRows,
} from './performanceArchive';
import { PERFORMANCE_LOG_DESCRIPTION } from '../../../games/minion_battles/game/performance/tickPerformanceTracker';

describe('performanceArchive', () => {
    it('extractPerformanceSample reads nested timing fields', () => {
        const sample = extractPerformanceSample({
            tick: 120,
            game_state: {
                performanceLog: {
                    description: PERFORMANCE_LOG_DESCRIPTION,
                    totalTimeTaken: 10,
                    engine: {
                        totalTimeTaken: 6,
                        units: { totalTimeTaken: 4 },
                    },
                    ui: {
                        totalTimeTaken: 4,
                        react: { totalTimeTaken: 1 },
                        canvas: { totalTimeTaken: 3, units: { totalTimeTaken: 2 } },
                    },
                },
            },
        });
        expect(sample).toEqual({
            tick: 120,
            totalMs: 10,
            engineMs: 6,
            uiMs: 4,
            canvasMs: 3,
            reactMs: 1,
            categories: {
                engine: 6,
                'engine.units': 4,
                ui: 4,
                'ui.react': 1,
                'ui.canvas': 3,
                'ui.canvas.units': 2,
            },
        });
    });

    it('extractPerformanceSample returns null without performanceLog', () => {
        expect(extractPerformanceSample({ tick: 1, game_state: { gameTick: 1 } })).toBeNull();
        expect(extractPerformanceSample(null)).toBeNull();
    });

    it('buildPerformanceWindows uses 25-tick batches', () => {
        expect(PERFORMANCE_WINDOW_SIZE).toBe(25);
        expect(buildPerformanceWindows(52)).toEqual([
            { fromTick: 0, toTick: 24 },
            { fromTick: 25, toTick: 49 },
            { fromTick: 50, toTick: 52 },
        ]);
    });

    it('aggregatePerformanceWindow computes avg/max/p95 and spike tick', () => {
        const samples = [1, 2, 3, 4, 5, 10].map((totalMs, i) => ({
            tick: 10 + i,
            totalMs,
            engineMs: totalMs / 2,
            uiMs: totalMs / 2,
            canvasMs: totalMs / 4,
            reactMs: 0,
            categories: {},
        }));
        const stats = aggregatePerformanceWindow(samples, 10, 20);
        expect(stats.sampleCount).toBe(6);
        expect(stats.avgTotalMs).toBeCloseTo(25 / 6);
        expect(stats.maxTotalMs).toBe(10);
        expect(stats.spikeTick).toBe(15);
        expect(stats.p95TotalMs).toBe(10);
    });

    it('samplesToChartRows sorts by tick', () => {
        const rows = samplesToChartRows([
            {
                tick: 2,
                totalMs: 2,
                engineMs: 1,
                uiMs: 1,
                canvasMs: 0.5,
                reactMs: 0.5,
                categories: {},
            },
            {
                tick: 1,
                totalMs: 1,
                engineMs: 0.5,
                uiMs: 0.5,
                canvasMs: 0.2,
                reactMs: 0.3,
                categories: {},
            },
        ]);
        expect(rows.map((r) => r.tick)).toEqual([1, 2]);
    });
});

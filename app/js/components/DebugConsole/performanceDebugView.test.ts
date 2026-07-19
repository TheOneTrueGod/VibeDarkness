import { describe, expect, it } from 'vitest';
import {
    PERFORMANCE_LOG_DESCRIPTION,
    type PerformanceLog,
    type PerformanceTickRecord,
} from '../../games/minion_battles/game/performance/tickPerformanceTracker';
import {
    buildPerformanceStackChartRows,
    getPerformanceNodeAtPath,
    listPerformanceChildCategories,
} from './performanceDebugView';

function makeLog(): PerformanceLog {
    return {
        description: PERFORMANCE_LOG_DESCRIPTION,
        totalTimeTaken: 10,
        engine: {
            totalTimeTaken: 6,
            units: { totalTimeTaken: 4 },
            projectiles: { totalTimeTaken: 2 },
        },
        ui: {
            totalTimeTaken: 4,
            canvas: {
                totalTimeTaken: 3,
                units: { totalTimeTaken: 2 },
                pixiPresent: { totalTimeTaken: 1 },
            },
            react: { totalTimeTaken: 1 },
        },
    };
}

describe('performanceDebugView', () => {
    it('lists top-level categories sorted by ms', () => {
        const rows = listPerformanceChildCategories(makeLog());
        expect(rows.map((r) => r.key)).toEqual(['engine', 'ui']);
        expect(rows[0]!.hasChildren).toBe(true);
        expect(rows[1]!.hasChildren).toBe(true);
    });

    it('resolves nested paths', () => {
        const canvas = getPerformanceNodeAtPath(makeLog(), ['ui', 'canvas']);
        expect(canvas?.totalTimeTaken).toBe(3);
        expect(listPerformanceChildCategories(canvas).map((r) => r.key)).toEqual(['units', 'pixiPresent']);
    });

    it('builds stacked chart series for the current path', () => {
        const history: PerformanceTickRecord[] = [
            { gameTick: 1, log: makeLog() },
            {
                gameTick: 2,
                log: {
                    ...makeLog(),
                    engine: { totalTimeTaken: 8, units: { totalTimeTaken: 5 }, projectiles: { totalTimeTaken: 3 } },
                },
            },
        ];
        const root = buildPerformanceStackChartRows(history, []);
        expect(root.seriesKeys).toEqual(['engine', 'ui']);
        expect(root.rows[0]).toMatchObject({ tick: 1, engine: 6, ui: 4 });

        const engine = buildPerformanceStackChartRows(history, ['engine']);
        expect(engine.seriesKeys).toEqual(['projectiles', 'units']);
        expect(engine.rows[1]).toMatchObject({ tick: 2, units: 5, projectiles: 3 });
    });
});

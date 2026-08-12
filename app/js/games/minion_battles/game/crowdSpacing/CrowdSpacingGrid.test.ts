import { describe, expect, it } from 'vitest';
import {
    CROWD_SPACING_FALLBACK_CELL_SIZE,
    crowdSpacingCellSizeFromMaxRadius,
} from './crowdSpacingConstants';
import { CrowdSpacingGrid, type CrowdSpacingParticipant } from './CrowdSpacingGrid';

const SMALL_RADIUS = 10;
const LARGE_RADIUS = 40;
/** Far enough that two small units do not share cells at fallback cell size. */
const FAR_APART = CROWD_SPACING_FALLBACK_CELL_SIZE * 4;

function participant(
    id: string,
    x: number,
    y: number,
    radius: number = SMALL_RADIUS,
): CrowdSpacingParticipant {
    return { id, x, y, radius };
}

describe('CrowdSpacingGrid', () => {
    it('queryNeighbors finds units whose circles share cells', () => {
        const grid = new CrowdSpacingGrid();
        grid.rebuild([
            participant('a', 0, 0),
            participant('b', SMALL_RADIUS, 0),
            participant('c', FAR_APART, 0),
        ]);

        const nearA = grid.queryNeighbors(0, 0, SMALL_RADIUS);
        expect(nearA).toContain('a');
        expect(nearA).toContain('b');
        expect(nearA).not.toContain('c');
    });

    it('rebuild chooses cell size from max participating radius', () => {
        const grid = new CrowdSpacingGrid();
        grid.rebuild([
            participant('small', 0, 0, SMALL_RADIUS),
            participant('large', 100, 0, LARGE_RADIUS),
        ]);
        expect(grid.cellSize).toBe(crowdSpacingCellSizeFromMaxRadius(LARGE_RADIUS));
    });

    it('rebuild with empty list uses fallback cell size', () => {
        const grid = new CrowdSpacingGrid();
        grid.rebuild([]);
        expect(grid.cellSize).toBe(CROWD_SPACING_FALLBACK_CELL_SIZE);
    });

    it('updateUnit moves a unit into new cells', () => {
        const grid = new CrowdSpacingGrid();
        grid.rebuild([
            participant('a', 0, 0),
            participant('b', FAR_APART, 0),
        ]);

        expect(grid.queryNeighbors(0, 0, SMALL_RADIUS)).not.toContain('b');

        grid.updateUnit('b', SMALL_RADIUS, 0, SMALL_RADIUS);
        const nearA = grid.queryNeighbors(0, 0, SMALL_RADIUS);
        expect(nearA).toContain('a');
        expect(nearA).toContain('b');
    });

    it('removeUnit clears the unit from queries', () => {
        const grid = new CrowdSpacingGrid();
        grid.rebuild([
            participant('a', 0, 0),
            participant('b', SMALL_RADIUS, 0),
        ]);
        grid.removeUnit('b');
        expect(grid.queryNeighbors(0, 0, SMALL_RADIUS)).toEqual(['a']);
    });

    it('rebuild from list matches incremental end state for the same positions', () => {
        const poses = [
            participant('a', 0, 0),
            participant('b', SMALL_RADIUS * 1.5, 0),
            participant('c', FAR_APART, FAR_APART),
        ];
        const cellSize = crowdSpacingCellSizeFromMaxRadius(SMALL_RADIUS);

        const rebuilt = new CrowdSpacingGrid();
        rebuilt.rebuild(poses, cellSize);

        const incremental = new CrowdSpacingGrid();
        incremental.rebuild([], cellSize);
        for (const p of poses) {
            incremental.updateUnit(p.id, p.x, p.y, p.radius);
        }

        for (const p of poses) {
            expect(incremental.queryNeighbors(p.x, p.y, p.radius)).toEqual(
                rebuilt.queryNeighbors(p.x, p.y, p.radius),
            );
        }
    });

    it('a large radius spans multiple cells and is still queryable', () => {
        const cellSize = SMALL_RADIUS;
        const grid = new CrowdSpacingGrid();
        const bigR = cellSize * 1.5;
        grid.rebuild([participant('big', 0, 0, bigR)], cellSize);

        // Query from a neighboring cell that the large circle overlaps.
        const hits = grid.queryNeighbors(cellSize, 0, SMALL_RADIUS);
        expect(hits).toContain('big');
    });
});

import { describe, expect, it } from 'vitest';
import { Unit } from '../units/Unit';
import { UnitTag } from '../units/unitTag';
import { TerrainGrid, CELL_SIZE } from '../../terrain/TerrainGrid';
import { TerrainManager } from '../../terrain/TerrainManager';
import { TerrainType } from '../../terrain/TerrainType';
import { TerrainLayerManager } from '../TerrainLayerManager';
import { CROWD_SPACING_OVERLAP_EPSILON } from './crowdSpacingConstants';
import { CrowdSpacingGrid } from './CrowdSpacingGrid';
import { resolveCrowdSpacingPass } from './resolveCrowdSpacing';

const SMALL_RADIUS = 20;
const LARGE_RADIUS = 40;
/** Centers this far apart still overlap by more than epsilon for SMALL_RADIUS. */
const OVERLAP_GAP = SMALL_RADIUS * 0.5;

function makeSoft(
    id: string,
    x: number,
    y: number,
    radius: number = SMALL_RADIUS,
): Unit {
    return new Unit({
        id,
        x,
        y,
        hp: 100,
        speed: 40,
        teamId: 'enemy',
        ownerId: 'ai',
        characterId: 'alpha_wolf',
        name: id,
        radius,
        abilities: [],
    });
}

function makeAnchor(
    id: string,
    x: number,
    y: number,
    radius: number = SMALL_RADIUS,
): Unit {
    const unit = makeSoft(id, x, y, radius);
    unit.tags = [UnitTag.CrowdSpacingAnchor];
    return unit;
}

function makeGrassManager(cols: number, rows: number): TerrainManager {
    const grid = TerrainGrid.createFilledTerrain(cols, rows, CELL_SIZE, TerrainType.Grass);
    const manager = new TerrainManager(grid);
    manager.setTerrainLayers(new TerrainLayerManager());
    return manager;
}

function rebuildAndResolve(
    units: Unit[],
    terrain?: { terrainManager?: TerrainManager; terrainGrid?: TerrainGrid },
): CrowdSpacingGrid {
    const grid = new CrowdSpacingGrid();
    grid.rebuild(
        units.map((u) => ({ id: u.id, x: u.x, y: u.y, radius: u.radius })),
    );
    resolveCrowdSpacingPass({
        units,
        grid,
        terrainManager: terrain?.terrainManager,
        terrainGrid: terrain?.terrainGrid,
    });
    return grid;
}

describe('resolveCrowdSpacingPass', () => {
    it('pushes two overlapping softs apart along their axis', () => {
        const a = makeSoft('a', 0, 0);
        const b = makeSoft('b', OVERLAP_GAP, 0);
        const distBefore = Math.hypot(b.x - a.x, b.y - a.y);
        expect(distBefore).toBeLessThan(a.radius + b.radius - CROWD_SPACING_OVERLAP_EPSILON);

        rebuildAndResolve([a, b]);

        const distAfter = Math.hypot(b.x - a.x, b.y - a.y);
        expect(distAfter).toBeGreaterThan(distBefore);
        expect(a.x).toBeLessThan(0);
        expect(b.x).toBeGreaterThan(OVERLAP_GAP);
        expect(a.y).toBe(0);
        expect(b.y).toBe(0);
    });

    it('moves the larger-radius soft less than the smaller one', () => {
        const small = makeSoft('small', 0, 0, SMALL_RADIUS);
        const large = makeSoft('large', OVERLAP_GAP, 0, LARGE_RADIUS);
        const smallStart = small.x;
        const largeStart = large.x;

        rebuildAndResolve([small, large]);

        const smallMove = Math.abs(small.x - smallStart);
        const largeMove = Math.abs(large.x - largeStart);
        expect(smallMove).toBeGreaterThan(largeMove);
        expect(largeMove).toBeGreaterThan(0);
    });

    it('soft yields fully to an anchor; anchor stays put', () => {
        const soft = makeSoft('soft', 0, 0);
        const anchor = makeAnchor('anchor', OVERLAP_GAP, 0);
        const softStart = { x: soft.x, y: soft.y };
        const anchorStart = { x: anchor.x, y: anchor.y };
        const overlap = soft.radius + anchor.radius - OVERLAP_GAP;

        rebuildAndResolve([soft, anchor]);

        expect(anchor.x).toBe(anchorStart.x);
        expect(anchor.y).toBe(anchorStart.y);
        expect(soft.x).toBeCloseTo(softStart.x - overlap, 5);
        expect(soft.y).toBe(softStart.y);
    });

    it('terrain clamp blocks soft push into impassable rock', () => {
        const terrainManager = makeGrassManager(8, 4);
        // Wall immediately to the left of the soft's start cell.
        terrainManager.grid.set(1, 2, TerrainType.Rock);

        const softX = CELL_SIZE * 2.5;
        const softY = CELL_SIZE * 2.5;
        const soft = makeSoft('soft', softX, softY);
        // Anchor to the right so soft is pushed left toward the rock.
        const anchor = makeAnchor('anchor', softX + OVERLAP_GAP, softY);

        rebuildAndResolve([soft, anchor], {
            terrainManager,
            terrainGrid: terrainManager.grid,
        });

        expect(anchor.x).toBe(softX + OVERLAP_GAP);
        expect(soft.x).toBeLessThan(softX);
        expect(terrainManager.isPassable(soft.x, soft.y)).toBe(true);
        expect(Math.floor(soft.x / CELL_SIZE)).toBeGreaterThanOrEqual(2);
    });

    it('runs a single accumulate sweep (soft between anchors keeps residual overlap)', () => {
        // Soft deeply overlapping two anchors on opposite sides: pair corrections cancel,
        // so one pass cannot clear both overlaps — proves no internal multi-pass loop.
        const left = makeAnchor('left', 0, 0);
        const soft = makeSoft('soft', SMALL_RADIUS * 0.25, 0);
        const right = makeAnchor('right', SMALL_RADIUS * 0.5, 0);
        const softStartX = soft.x;

        rebuildAndResolve([left, soft, right]);

        expect(left.x).toBe(0);
        expect(right.x).toBe(SMALL_RADIUS * 0.5);
        expect(soft.x).toBeCloseTo(softStartX, 5);

        const distLeft = Math.hypot(soft.x - left.x, soft.y - left.y);
        const distRight = Math.hypot(soft.x - right.x, soft.y - right.y);
        expect(distLeft).toBeLessThan(soft.radius + left.radius - CROWD_SPACING_OVERLAP_EPSILON);
        expect(distRight).toBeLessThan(soft.radius + right.radius - CROWD_SPACING_OVERLAP_EPSILON);
    });

    it('ignores overlaps at or below the epsilon', () => {
        const gap = SMALL_RADIUS * 2 - CROWD_SPACING_OVERLAP_EPSILON * 0.5;
        const a = makeSoft('a', 0, 0);
        const b = makeSoft('b', gap, 0);
        const ax = a.x;
        const bx = b.x;

        rebuildAndResolve([a, b]);

        expect(a.x).toBe(ax);
        expect(b.x).toBe(bx);
    });

    it('anchor–anchor pairs are a no-op', () => {
        const a = makeAnchor('a', 0, 0);
        const b = makeAnchor('b', OVERLAP_GAP, 0);

        rebuildAndResolve([a, b]);

        expect(a.x).toBe(0);
        expect(b.x).toBe(OVERLAP_GAP);
    });
});

/**
 * Tests for sparse waypoint movement: long straight lines, diagonal slides, and pursuit steering.
 * Unlike the dense corner-cut test, these tests use sparse waypoints (far apart) and validate
 * that the movement system works correctly with both slide detection and final-waypoint pursuit.
 */

import { describe, it, expect } from 'vitest';
import { Unit } from './Unit';
import { updateUnit } from './unitMovementTick';
import { TerrainGrid, CELL_SIZE } from '../../terrain/TerrainGrid';
import { TerrainManager } from '../../terrain/TerrainManager';
import { TerrainType } from '../../terrain/TerrainType';
import { CellOccupancyManager } from '../managers/CellOccupancyManager';

function makeUnit(id: string, x: number, y: number, characterId: string = 'swarmling'): Unit {
    return new Unit({
        id,
        x,
        y,
        hp: 4,
        maxHp: 4,
        speed: 90,
        teamId: 'player',
        ownerId: 'player1',
        characterId,
        name: characterId,
        abilities: [],
    });
}

function makeEngine(terrainManager: TerrainManager, units: Unit[]) {
    return {
        gameTime: 0,
        roundNumber: 1,
        terrainManager,
        eventBus: { emit: () => {} },
        units,
        cellOccupancyManager: new CellOccupancyManager(),
        getUnit: (id: string) => units.find((u) => u.id === id),
    };
}

/** Three swarmlings fill a cell (maxPerTile 3). */
function fillCell(col: number, row: number): Unit[] {
    return [5, 10, 15].map((offset, i) =>
        makeUnit(`blocker_${col}_${row}_${i}`, col * CELL_SIZE + offset, row * CELL_SIZE + offset));
}

describe('unitMovementTick - sparse waypoints', () => {
    it('a unit given ONE far waypoint across open ground travels in a straight line', () => {
        const terrainManager = new TerrainManager(new TerrainGrid(20, 20, CELL_SIZE, TerrainType.Grass));
        const startX = 1 * CELL_SIZE + CELL_SIZE / 2;
        const startY = 1 * CELL_SIZE + CELL_SIZE / 2;
        const unit = makeUnit('u1', startX, startY);
        unit.moveJitter = 0;
        unit.setMovement([{ col: 7, row: 4 }], undefined, 0);
        const engine = makeEngine(terrainManager, [unit]);

        const positions: { x: number; y: number }[] = [];
        for (let i = 0; i < 400 && unit.movement; i++) {
            updateUnit(unit, 1 / 60, engine);
            positions.push({ x: unit.x, y: unit.y });
        }

        expect(unit.movement).toBeNull();
        expect(Math.floor(unit.x / CELL_SIZE)).toBe(7);
        expect(Math.floor(unit.y / CELL_SIZE)).toBe(4);

        // Every intermediate position lies on the line from the start to where it ended up.
        const lx = unit.x - startX;
        const ly = unit.y - startY;
        const len = Math.hypot(lx, ly);
        expect(positions.length).toBeGreaterThan(50);
        for (const p of positions) {
            const perpendicular = Math.abs((p.x - startX) * ly - (p.y - startY) * lx) / len;
            expect(perpendicular).toBeLessThan(0.5);
        }
    });

    it('dense path regression: a unit given an adjacent-cell-by-cell path still arrives at the last cell', () => {
        const terrainManager = new TerrainManager(new TerrainGrid(20, 20, CELL_SIZE, TerrainType.Grass));
        const unit = makeUnit('u1', 1 * CELL_SIZE + CELL_SIZE / 2, 1 * CELL_SIZE + CELL_SIZE / 2);
        unit.moveJitter = 0;
        unit.setMovement([{ col: 2, row: 1 }, { col: 3, row: 2 }, { col: 4, row: 3 }, { col: 5, row: 4 }], undefined, 0);
        const engine = makeEngine(terrainManager, [unit]);

        for (let i = 0; i < 400 && unit.movement; i++) updateUnit(unit, 1 / 60, engine);

        expect(unit.movement).toBeNull();
        expect(Math.floor(unit.x / CELL_SIZE)).toBe(5);
        expect(Math.floor(unit.y / CELL_SIZE)).toBe(4);
    });

    it('slide: a managed unit about to enter a full cell on the way to a far waypoint detours diagonally', () => {
        const terrainManager = new TerrainManager(new TerrainGrid(20, 20, CELL_SIZE, TerrainType.Grass));
        // One pixel short of the boundary into (2,1), heading for a waypoint three cells further on.
        const startX = 2 * CELL_SIZE - 1;
        const startY = 1 * CELL_SIZE + CELL_SIZE / 2;
        const unit = makeUnit('u1', startX, startY);
        unit.moveJitter = 0;
        unit.setMovement([{ col: 5, row: 1 }], undefined, 0);

        const all = [unit, ...fillCell(2, 1)];
        const engine = makeEngine(terrainManager, all);
        engine.cellOccupancyManager.rebuild(all);

        updateUnit(unit, 1 / 60, engine);

        // Detour inserted in front; original waypoint kept; unit did not step into the full cell.
        expect(unit.movement!.path).toHaveLength(2);
        expect(unit.movement!.path[1]).toEqual({ col: 5, row: 1 });
        expect(unit.movement!.navEpoch).toBe(-1);
        expect(unit.x).toBe(startX);
        const slide = unit.movement!.path[0];
        // Adjacent to both the current cell (1,1) and the full cell (2,1), and neither of them.
        expect([[1, 0], [2, 0], [1, 2], [2, 2]]).toContainEqual([slide.col, slide.row]);

        // And it actually walks there next.
        for (let i = 0; i < 120 && unit.movement!.path.length === 2; i++) updateUnit(unit, 1 / 60, engine);
        expect(unit.movement!.path).toHaveLength(1);
        expect(Math.floor(unit.x / CELL_SIZE)).toBe(slide.col);
        expect(Math.floor(unit.y / CELL_SIZE)).toBe(slide.row);
    });

    it('slide never selects an impassable cell: with only rock alongside, the unit pushes on', () => {
        const grid = new TerrainGrid(20, 20, CELL_SIZE, TerrainType.Grass);
        // Every cell adjacent to both (1,1) and (2,1) is rock: a one-wide corridor along row 1.
        for (const [c, r] of [[1, 0], [2, 0], [1, 2], [2, 2]]) grid.set(c, r, TerrainType.Rock);
        const terrainManager = new TerrainManager(grid);

        const startX = 2 * CELL_SIZE - 1;
        const unit = makeUnit('u1', startX, 1 * CELL_SIZE + CELL_SIZE / 2);
        unit.moveJitter = 0;
        unit.setMovement([{ col: 5, row: 1 }], undefined, 0);

        const all = [unit, ...fillCell(2, 1)];
        const engine = makeEngine(terrainManager, all);
        engine.cellOccupancyManager.rebuild(all);

        updateUnit(unit, 1 / 60, engine);

        expect(unit.movement!.path).toEqual([{ col: 5, row: 1 }]);
        expect(unit.movement!.navEpoch).toBeUndefined();
        expect(unit.x).toBeGreaterThan(startX);
    });

    it('a pursuer does not orbit a full destination cell', () => {
        const terrainManager = new TerrainManager(new TerrainGrid(20, 20, CELL_SIZE, TerrainType.Grass));
        const startX = 2 * CELL_SIZE - 1;
        const pursuer = makeUnit('u1', startX, 1 * CELL_SIZE + CELL_SIZE / 2);
        pursuer.moveJitter = 0;
        const blockers = fillCell(2, 1);
        pursuer.setMovement([{ col: 2, row: 1 }], blockers[0].id, 0, undefined, 1);

        const all = [pursuer, ...blockers];
        const engine = makeEngine(terrainManager, all);
        engine.cellOccupancyManager.rebuild(all);

        updateUnit(pursuer, 1 / 60, engine);

        expect(pursuer.movement!.path).toEqual([{ col: 2, row: 1 }]);
        expect(pursuer.x).toBeGreaterThan(startX);
    });

    it('pursuit with one waypoint steers at the live target position, not the cell centre', () => {
        const terrainManager = new TerrainManager(new TerrainGrid(20, 20, CELL_SIZE, TerrainType.Grass));
        const pursuer = makeUnit('pursuer', 1 * CELL_SIZE + CELL_SIZE / 2, 1 * CELL_SIZE + CELL_SIZE / 2);
        pursuer.moveJitter = 0;

        // Target sits in (2,2), well off-centre. Heading for the cell centre would end ~11px away.
        const target = makeUnit('target', 2 * CELL_SIZE + CELL_SIZE / 2 + 12, 2 * CELL_SIZE + CELL_SIZE / 2 - 9);
        const stopRange = 4;
        pursuer.setMovement([{ col: 2, row: 2 }], 'target', 0, undefined, stopRange);
        const engine = makeEngine(terrainManager, [pursuer, target]);

        for (let i = 0; i < 500 && pursuer.movement; i++) updateUnit(pursuer, 1 / 60, engine);

        expect(pursuer.movement).toBeNull();
        expect(Math.hypot(target.x - pursuer.x, target.y - pursuer.y)).toBeLessThanOrEqual(stopRange);
    });

    it('slides along a wall instead of clipping a rock corner on a straight segment', () => {
        const grid = new TerrainGrid(20, 20, CELL_SIZE, TerrainType.Grass);
        // Column 14 is rock except a one-cell gap at row 7.
        for (let row = 0; row < 20; row++) if (row !== 7) grid.set(14, row, TerrainType.Rock);
        const terrainManager = new TerrainManager(grid);

        // Standing in row 6 just left of the wall: the straight line to (15,7) clips rock (14,6).
        const unit = makeUnit('u1', 14 * CELL_SIZE - 0.5, 6 * CELL_SIZE + 34);
        unit.moveJitter = 0;
        unit.setMovement([{ col: 15, row: 7 }, { col: 18, row: 7 }], undefined, 0);
        const engine = makeEngine(terrainManager, [unit]);

        for (let i = 0; i < 400 && unit.movement; i++) {
            updateUnit(unit, 1 / 60, engine);
            const col = Math.floor(unit.x / CELL_SIZE);
            const row = Math.floor(unit.y / CELL_SIZE);
            expect(terrainManager.nav.isPassable('default', col, row), `in rock at (${col},${row}) tick ${i}`).toBe(true);
        }
        expect(unit.movement).toBeNull();
        expect(Math.floor(unit.x / CELL_SIZE)).toBe(18);
        expect(Math.floor(unit.y / CELL_SIZE)).toBe(7);
    });

    it('stopRange round-trips through toJSON/fromJSON for both movement and walkIntent', () => {
        const unit = makeUnit('u1', 5 * CELL_SIZE, 5 * CELL_SIZE);
        const stopRange = 50;
        unit.setMovement([{ col: 10, row: 10 }], 'someTarget', 0, undefined, stopRange);

        // Serialize
        const json = unit.toJSON(0);
        const jsonStr = JSON.stringify(json);

        // Deserialize into a new unit using static method
        const unit2 = Unit.fromJSON(JSON.parse(jsonStr), { emit: () => {} } as any, 0);

        // Check that stopRange is preserved in both movement and walkIntent
        expect(unit2.movement?.stopRange).toBe(stopRange);
        expect(unit2.walkIntent?.stopRange).toBe(stopRange);
    });
});

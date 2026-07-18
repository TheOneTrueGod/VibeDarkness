/**
 * Regression test for the defensive corner-cutting guard in updateUnit (unitMovementTick.ts).
 *
 * Movement interpolates a straight line toward `movement.path[0]`'s cell center every tick with
 * no terrain check along the way. A malformed path — e.g. the onPathfindingRetrigger double-slice
 * bug fixed alongside this test, which silently dropped the real next waypoint — could otherwise
 * hand it a diagonal step that corner-cuts a wall, walking a unit straight through it. See
 * isValidAdjacentPathStep in unitMovementTick.ts.
 */
import { describe, it, expect } from 'vitest';
import { Unit } from './Unit';
import { updateUnit } from './unitMovementTick';
import { TerrainGrid, CELL_SIZE } from '../../terrain/TerrainGrid';
import { TerrainManager } from '../../terrain/TerrainManager';
import { TerrainType } from '../../terrain/TerrainType';

function makeUnit(x: number, y: number): Unit {
    return new Unit({
        id: 'u1',
        x,
        y,
        hp: 4,
        maxHp: 4,
        speed: 90,
        teamId: 'enemy',
        ownerId: 'ai',
        characterId: 'swarmling',
        name: 'Swarmling',
        abilities: [],
    });
}

function makeEngine(terrainManager: TerrainManager, unit: Unit) {
    return {
        gameTime: 0,
        roundNumber: 1,
        terrainManager,
        eventBus: { emit: () => {} },
        units: [unit],
    };
}

describe('updateUnit - corner-cutting path guard', () => {
    it('discards a diagonal path step that corner-cuts a wall instead of walking through it', () => {
        // Rock at (2,1) sits on the diagonal corner between the unit's cell (1,1) and its
        // (malformed) target (2,2) — a legal-looking single step that would clip the wall.
        const grid = new TerrainGrid(10, 10, CELL_SIZE, TerrainType.Grass);
        grid.set(2, 1, TerrainType.Rock);
        const terrainManager = new TerrainManager(grid);

        const startX = 1 * CELL_SIZE + 20;
        const startY = 1 * CELL_SIZE + 20;
        const unit = makeUnit(startX, startY);
        unit.setMovement([{ col: 2, row: 2 }], undefined, 0);

        updateUnit(unit, 1 / 60, makeEngine(terrainManager, unit));

        expect(unit.movement).toBeNull();
        expect(unit.pathInvalidated).toBe(true);
        expect(unit.x).toBeCloseTo(startX, 5);
        expect(unit.y).toBeCloseTo(startY, 5);
    });

    it('allows a legitimate diagonal step when both flanking cells are open', () => {
        const grid = new TerrainGrid(10, 10, CELL_SIZE, TerrainType.Grass);
        const terrainManager = new TerrainManager(grid);

        const startX = 1 * CELL_SIZE + 20;
        const startY = 1 * CELL_SIZE + 20;
        const unit = makeUnit(startX, startY);
        unit.setMovement([{ col: 2, row: 2 }], undefined, 0);

        updateUnit(unit, 1 / 60, makeEngine(terrainManager, unit));

        expect(unit.movement).not.toBeNull();
        expect(unit.x).not.toBeCloseTo(startX, 5);
    });

    it('leaves a long, non-adjacent hop untouched (player click-to-move can jump straight to a validated distant cell)', () => {
        const grid = new TerrainGrid(10, 10, CELL_SIZE, TerrainType.Grass);
        grid.set(2, 1, TerrainType.Rock);
        const terrainManager = new TerrainManager(grid);

        const startX = 1 * CELL_SIZE + 20;
        const startY = 1 * CELL_SIZE + 20;
        const unit = makeUnit(startX, startY);
        // Five cells away — the ≤1-cell adjacency check should not even evaluate this step.
        unit.setMovement([{ col: 6, row: 1 }], undefined, 0);

        updateUnit(unit, 1 / 60, makeEngine(terrainManager, unit));

        expect(unit.movement).not.toBeNull();
        expect(unit.x).not.toBeCloseTo(startX, 5);
    });
});

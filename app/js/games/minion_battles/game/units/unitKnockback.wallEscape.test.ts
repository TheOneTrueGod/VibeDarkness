/**
 * Knockback that starts inside a wall (e.g. rock raised under the unit on the same tick) moves through
 * terrain until the unit is on passable ground, then collides normally. Each tick only covers a few
 * pixels, so the escape has to span ticks rather than search within one tick's segment.
 */
import { describe, expect, it } from 'vitest';
import { Unit } from './Unit';
import { EventBus } from '../EventBus';
import { applyKnockbackToUnit, updateUnitKnockback } from './unitKnockback';
import { TerrainGrid, CELL_SIZE } from '../../terrain/TerrainGrid';
import { TerrainManager } from '../../terrain/TerrainManager';
import { TerrainType } from '../../terrain/TerrainType';
import { TerrainLayerManager } from '../TerrainLayerManager';

const DT = 1 / 60;
const ROW = 2;

function makeTerrainManager(cols: number, rows: number): TerrainManager {
    const grid = TerrainGrid.createFilledTerrain(cols, rows, CELL_SIZE, TerrainType.Grass);
    const manager = new TerrainManager(grid);
    manager.setTerrainLayers(new TerrainLayerManager());
    return manager;
}

function tileCentreX(col: number): number {
    return col * CELL_SIZE + CELL_SIZE / 2;
}

function makeUnitAt(x: number, y: number): Unit {
    return new Unit({
        id: 'u1',
        x,
        y,
        hp: 100,
        maxHp: 100,
        speed: 100,
        teamId: 'enemy',
        ownerId: 'ai',
        characterId: 'slime',
        name: 'Slime',
    });
}

/** Eastward knockback. Total displacement is 1.5 x `airDistance` (air, then half again while sliding). */
function knockEast(unit: Unit, airDistance: number): void {
    applyKnockbackToUnit(unit, {
        knockbackVector: { x: airDistance, y: 0 },
        knockbackAirTime: 0.2,
        knockbackSlideTime: 0.1,
        knockbackSource: { unitId: 'caster', abilityId: 'test' },
    }, new EventBus());
}

function tickToCompletion(unit: Unit, tm: TerrainManager): number {
    let ticks = 0;
    while (unit.knockback && ticks < 600) {
        updateUnitKnockback(unit, DT, tm.grid, tm);
        ticks++;
    }
    return ticks;
}

describe('updateUnitKnockback wall escape', () => {
    it('carries a unit out of the rock tile it starts in, across several ticks', () => {
        const tm = makeTerrainManager(10, 5);
        tm.grid.set(3, ROW, TerrainType.Rock);
        const unit = makeUnitAt(tileCentreX(3), tileCentreX(ROW));
        expect(tm.isPassable(unit.x, unit.y)).toBe(false);

        // 42px total: enough to cross the 20px from the tile centre to its edge.
        knockEast(unit, 28);

        updateUnitKnockback(unit, DT, tm.grid, tm);
        // One tick moves only a few pixels, still inside the rock, and the knockback is not cancelled.
        expect(unit.knockback).not.toBeNull();
        expect(unit.x).toBeGreaterThan(tileCentreX(3));
        expect(tm.isPassable(unit.x, unit.y)).toBe(false);

        tickToCompletion(unit, tm);

        expect(unit.knockback).toBeNull();
        expect(tm.isPassable(unit.x, unit.y)).toBe(true);
        expect(Math.floor(unit.x / CELL_SIZE)).toBe(4);
    });

    it('leaves the unit inside the wall when the knockback ends before it gets out', () => {
        const tm = makeTerrainManager(10, 5);
        tm.grid.set(3, ROW, TerrainType.Rock);
        const startX = tileCentreX(3);
        const unit = makeUnitAt(startX, tileCentreX(ROW));

        // 12px total: short of the 20px to the tile edge. tickWallUnstick handles the rest.
        knockEast(unit, 8);
        tickToCompletion(unit, tm);

        expect(unit.knockback).toBeNull();
        expect(unit.x).toBeCloseTo(startX + 12, 5);
        expect(tm.isPassable(unit.x, unit.y)).toBe(false);
    });

    it('collides normally again once it has escaped onto passable ground', () => {
        const tm = makeTerrainManager(10, 5);
        tm.grid.set(3, ROW, TerrainType.Rock);
        tm.grid.set(5, ROW, TerrainType.Rock);
        const unit = makeUnitAt(tileCentreX(3), tileCentreX(ROW));

        // 120px total would reach column 6 if terrain were ignored the whole way.
        knockEast(unit, 80);
        tickToCompletion(unit, tm);

        expect(tm.isPassable(unit.x, unit.y)).toBe(true);
        expect(Math.floor(unit.x / CELL_SIZE)).toBe(4);
    });

    it('still stops a knockback that starts on passable ground at the first wall', () => {
        const tm = makeTerrainManager(10, 5);
        tm.grid.set(4, ROW, TerrainType.Rock);
        const unit = makeUnitAt(tileCentreX(2), tileCentreX(ROW));

        knockEast(unit, 80);
        tickToCompletion(unit, tm);

        expect(tm.isPassable(unit.x, unit.y)).toBe(true);
        expect(Math.floor(unit.x / CELL_SIZE)).toBe(3);
    });
});

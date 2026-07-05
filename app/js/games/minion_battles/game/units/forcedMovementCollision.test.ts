import { describe, expect, it, vi } from 'vitest';
import { Unit } from './Unit';
import { EventBus } from '../EventBus';
import type {
    ForcedMovementTerrainCollisionEvent,
    ForcedMovementUnitCollisionEvent,
} from '../EventBus';
import { applyKnockbackToUnit, updateUnitKnockback } from './unitKnockback';
import { DEFAULT_UNIT_RADIUS } from './unit_defs/unitConstants';
import { KNOCKBACK_TOTAL_DISPLACEMENT_FACTOR } from '../../crowdControl/knockbackKeywords';
import { TerrainGrid, CELL_SIZE } from '../../terrain/TerrainGrid';
import { TerrainManager } from '../../terrain/TerrainManager';
import { TerrainType } from '../../terrain/TerrainType';
import { TerrainLayerManager } from '../TerrainLayerManager';
import type { KnockbackSource } from './unitTypes';

const COLLISION_SOURCE: KnockbackSource = { unitId: 'caster', abilityId: '0902' };

const KNOCKBACK_AIR_TIME = 0.5;
const KNOCKBACK_SLIDE_TIME = 0.3;
const KNOCKBACK_TICK_DT = 0.02;

/** Large rightward vector so the mover reaches the struck unit in one air phase. */
const RIGHTWARD_KNOCKBACK_VECTOR = { x: 200, y: 0 };

const MOVER_START_X = 100;
const STRUCK_CENTER_X = 200;
const SHARED_Y = 100;

/** Centers at contact when edge-to-edge radii touch. */
const EXPECTED_CONTACT_X = STRUCK_CENTER_X - 2 * DEFAULT_UNIT_RADIUS;

function makeUnit(overrides: Partial<ConstructorParameters<typeof Unit>[0]> = {}): Unit {
    return new Unit({
        id: 'u1',
        x: MOVER_START_X,
        y: SHARED_Y,
        hp: 100,
        maxHp: 100,
        speed: 100,
        teamId: 'player',
        ownerId: 'p1',
        characterId: 'player',
        name: 'Unit',
        radius: DEFAULT_UNIT_RADIUS,
        ...overrides,
    });
}

function makeTerrainManager(cols: number, rows: number): TerrainManager {
    const grid = TerrainGrid.createFilledTerrain(cols, rows, CELL_SIZE, TerrainType.Grass);
    const manager = new TerrainManager(grid);
    manager.setTerrainLayers(new TerrainLayerManager());
    return manager;
}

function applyTestKnockback(
    unit: Unit,
    opts: {
        collideWithUnits?: boolean;
        bounceOffTerrain?: boolean;
        unitCollisionStartFraction?: number;
    } = {},
): EventBus {
    const eventBus = new EventBus();
    applyKnockbackToUnit(
        unit,
        {
            knockbackVector: { ...RIGHTWARD_KNOCKBACK_VECTOR },
            knockbackAirTime: KNOCKBACK_AIR_TIME,
            knockbackSlideTime: KNOCKBACK_SLIDE_TIME,
            knockbackSource: COLLISION_SOURCE,
            collideWithUnits: opts.collideWithUnits,
            bounceOffTerrain: opts.bounceOffTerrain,
            unitCollisionStartFraction: opts.unitCollisionStartFraction,
        },
        eventBus,
    );
    return eventBus;
}

function tickKnockback(
    unit: Unit,
    eventBus: EventBus,
    units: Unit[],
    terrainManager: TerrainManager | null,
    dt = KNOCKBACK_TICK_DT,
): void {
    const grid = terrainManager?.grid ?? null;
    updateUnitKnockback(unit, dt, grid, terrainManager, { eventBus, units });
}

describe('forced movement unit collision', () => {
    it('stops the mover and emits the event with both ids and the impact point', () => {
        const mover = makeUnit({ id: 'mover' });
        const struck = makeUnit({
            id: 'struck',
            x: STRUCK_CENTER_X,
            y: SHARED_Y,
            teamId: 'enemy',
        });
        const units = [mover, struck];
        const eventBus = applyTestKnockback(mover, { collideWithUnits: true });

        const unitCollisions: ForcedMovementUnitCollisionEvent[] = [];
        eventBus.on('forced_movement_unit_collision', (data) => unitCollisions.push(data));

        while (mover.knockback) {
            tickKnockback(mover, eventBus, units, null);
        }

        expect(unitCollisions).toHaveLength(1);
        expect(unitCollisions[0].movingUnitId).toBe('mover');
        expect(unitCollisions[0].struckUnitId).toBe('struck');
        expect(unitCollisions[0].source).toEqual(COLLISION_SOURCE);
        expect(unitCollisions[0].impact.x).toBeCloseTo(EXPECTED_CONTACT_X, 4);
        expect(unitCollisions[0].impact.y).toBeCloseTo(SHARED_Y, 4);
        expect(mover.x).toBeCloseTo(EXPECTED_CONTACT_X, 4);
        expect(struck.x).toBe(STRUCK_CENTER_X);
    });

    it('does not move when already touching a blocker with no collision grace', () => {
        const mover = makeUnit({ id: 'mover', x: EXPECTED_CONTACT_X, y: SHARED_Y });
        const struck = makeUnit({
            id: 'struck',
            x: STRUCK_CENTER_X,
            y: SHARED_Y,
            teamId: 'enemy',
        });
        const units = [mover, struck];
        const startX = mover.x;
        const eventBus = applyTestKnockback(mover, { collideWithUnits: true });

        while (mover.knockback) {
            tickKnockback(mover, eventBus, units, null);
        }

        expect(mover.x).toBeCloseTo(startX, 4);
    });

    it('travels through grace distance before unit collision when already touching a blocker', () => {
        const graceFraction = 0.25;
        const totalDisplacement =
            Math.hypot(RIGHTWARD_KNOCKBACK_VECTOR.x, RIGHTWARD_KNOCKBACK_VECTOR.y)
            * KNOCKBACK_TOTAL_DISPLACEMENT_FACTOR;
        const graceDistance = totalDisplacement * graceFraction;

        const mover = makeUnit({ id: 'mover', x: EXPECTED_CONTACT_X, y: SHARED_Y });
        const struck = makeUnit({
            id: 'struck',
            x: STRUCK_CENTER_X,
            y: SHARED_Y,
            teamId: 'enemy',
        });
        const units = [mover, struck];
        const startX = mover.x;
        const eventBus = applyTestKnockback(mover, {
            collideWithUnits: true,
            unitCollisionStartFraction: graceFraction,
        });

        while (mover.knockback) {
            tickKnockback(mover, eventBus, units, null);
        }

        expect(mover.x - startX).toBeGreaterThan(graceDistance * 0.9);
    });
});

describe('forced movement terrain bounce', () => {
    it('does not emit terrain collision on all-grass knockback ticks', () => {
        const terrainManager = makeTerrainManager(20, 20);
        const unit = makeUnit({ x: 450, y: 370 });
        const eventBus = applyTestKnockback(unit, {
            bounceOffTerrain: true,
            collideWithUnits: false,
        });
        unit.knockback!.knockbackVector = { x: -30.676273442308, y: -78.1982496459655 };
        unit.knockback!.knockbackAirTime = 0.5;
        unit.knockback!.knockbackSlideTime = 0.3;

        const terrainCollisions: ForcedMovementTerrainCollisionEvent[] = [];
        eventBus.on('forced_movement_terrain_collision', (data) => terrainCollisions.push(data));

        while (unit.knockback) {
            tickKnockback(unit, eventBus, [unit], terrainManager);
        }

        expect(terrainCollisions).toHaveLength(0);
        expect(terrainManager.isPassable(unit.x, unit.y)).toBe(true);
    });

    it('reflects the vector and emits the tile event', () => {
        const terrainManager = makeTerrainManager(8, 4);
        terrainManager.grid.set(3, 2, TerrainType.Rock);

        const unit = makeUnit({
            x: CELL_SIZE * 1.5,
            y: CELL_SIZE * 2.5,
        });
        const eventBus = applyTestKnockback(unit, { bounceOffTerrain: true });

        const terrainCollisions: ForcedMovementTerrainCollisionEvent[] = [];
        eventBus.on('forced_movement_terrain_collision', (data) => terrainCollisions.push(data));

        const startX = unit.x;
        let reflectedVectorX: number | null = null;

        while (unit.knockback) {
            tickKnockback(unit, eventBus, [unit], terrainManager);
            if (terrainCollisions.length === 1 && reflectedVectorX === null) {
                reflectedVectorX = unit.knockback?.knockbackVector.x ?? null;
            }
        }

        expect(terrainCollisions.length).toBeGreaterThanOrEqual(1);
        expect(terrainCollisions[0].unitId).toBe(unit.id);
        expect(terrainCollisions[0].source).toEqual(COLLISION_SOURCE);
        expect(terrainCollisions[0].tile.col).toBe(2);
        expect(terrainCollisions[0].tile.row).toBe(2);
        expect(reflectedVectorX).toBeLessThan(0);
        expect(unit.x).toBeLessThan(startX);
    });
});

describe('default knockback (no collision flags)', () => {
    it('halts at a wall with no events emitted', () => {
        const terrainManager = makeTerrainManager(8, 4);
        terrainManager.grid.set(3, 2, TerrainType.Rock);

        const unit = makeUnit({
            x: CELL_SIZE * 1.5,
            y: CELL_SIZE * 2.5,
        });
        const eventBus = applyTestKnockback(unit);

        const unitHandler = vi.fn();
        const terrainHandler = vi.fn();
        eventBus.on('forced_movement_unit_collision', unitHandler);
        eventBus.on('forced_movement_terrain_collision', terrainHandler);

        while (unit.knockback) {
            tickKnockback(unit, eventBus, [unit], terrainManager);
        }

        expect(unitHandler).not.toHaveBeenCalled();
        expect(terrainHandler).not.toHaveBeenCalled();
        expect(terrainManager.isPassable(unit.x, unit.y)).toBe(true);
        expect(unit.x).toBeLessThan(CELL_SIZE * 3);
    });
});

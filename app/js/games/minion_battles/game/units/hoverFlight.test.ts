import { describe, expect, it } from 'vitest';
import { EventBus } from '../EventBus';
import { Unit } from './Unit';
import { UnitTag } from './unitTag';
import { TerrainGrid, CELL_SIZE } from '../../terrain/TerrainGrid';
import { TerrainManager } from '../../terrain/TerrainManager';
import { TerrainType } from '../../terrain/TerrainType';
import { TerrainLayerManager } from '../TerrainLayerManager';
import { DEFAULT_UNIT_RADIUS } from './unit_defs/unitConstants';
import { FIXED_DT } from '../gameConstants';
import {
    beginHoverLift,
    cancelHoverFlight,
    hoverFlightFromJSON,
    launchHoverFlight,
    serializeHoverFlight,
    updateHoverFlight,
    type HoverFlightEngine,
} from './hoverFlight';

const SPEED = 270;
const DISTANCE = 5 * CELL_SIZE;
const HOVER_HEIGHT = 14;
const LIFT_DURATION = 0.2;
const FALL_DURATION = 0.12;

function makeUnit(id: string, x: number, teamId: 'player' | 'enemy' = 'enemy'): Unit {
    return new Unit({
        id,
        x,
        y: 100,
        hp: 100,
        maxHp: 100,
        speed: 100,
        teamId,
        ownerId: teamId === 'player' ? 'p1' : 'ai',
        characterId: teamId === 'player' ? 'player' : 'dark_wolf',
        name: id,
        radius: DEFAULT_UNIT_RADIUS,
    });
}

function lift(unit: Unit, casterId = 'caster'): boolean {
    return beginHoverLift(unit, {
        hoverHeight: HOVER_HEIGHT,
        liftDuration: LIFT_DURATION,
        fallDuration: FALL_DURATION,
        collisionRadius: DEFAULT_UNIT_RADIUS,
        collisionGrace: DEFAULT_UNIT_RADIUS,
        source: { unitId: casterId, abilityId: 'test_hover' },
        casterTeamId: 'player',
    });
}

function engineFor(units: Unit[], terrain: TerrainManager | null = null): HoverFlightEngine {
    return {
        gameTime: 0,
        eventBus: new EventBus(),
        units,
        terrainManager: terrain,
    };
}

function fly(unit: Unit, seconds: number, engine: HoverFlightEngine): void {
    const steps = Math.ceil(seconds / FIXED_DT);
    for (let i = 0; i < steps; i++) {
        updateHoverFlight(unit, FIXED_DT, engine);
        for (const other of engine.units ?? []) {
            if (other !== unit) updateHoverFlight(other, FIXED_DT, engine);
        }
    }
}

describe('hoverFlight', () => {
    it('holds a lift in place until it is launched', () => {
        const unit = makeUnit('flung', 100);
        expect(lift(unit)).toBe(true);
        const engine = engineFor([unit]);
        fly(unit, LIFT_DURATION * 3, engine);
        expect(unit.hoverFlight?.phase).toBe('lift');
        expect(unit.x).toBe(100);
    });

    it('refuses to lift a structure', () => {
        const nest = makeUnit('nest', 100);
        nest.tags.push(UnitTag.Structure);
        expect(lift(nest)).toBe(false);
        expect(nest.hoverFlight).toBeNull();
    });

    it('travels at the launched speed and then falls', () => {
        const unit = makeUnit('flung', 100);
        lift(unit);
        expect(launchHoverFlight(unit, { x: 1, y: 0 }, SPEED, DISTANCE)).toBe(true);
        const engine = engineFor([unit]);
        updateHoverFlight(unit, FIXED_DT, engine);
        expect(unit.x).toBeCloseTo(100 + SPEED * FIXED_DT, 4);
        fly(unit, DISTANCE / SPEED + FALL_DURATION + FIXED_DT, engine);
        expect(unit.x).toBeCloseTo(100 + DISTANCE, 1);
        expect(unit.hoverFlight).toBeNull();
    });

    it('passes through an enemy and keeps its speed', () => {
        const flung = makeUnit('flung', 100);
        const enemy = makeUnit('enemy', 180);
        lift(flung);
        launchHoverFlight(flung, { x: 1, y: 0 }, SPEED, DISTANCE);
        const engine = engineFor([flung, enemy]);
        fly(flung, DISTANCE / SPEED + FALL_DURATION + FIXED_DT, engine);
        expect(flung.x).toBeGreaterThan(enemy.x);
        expect(flung.hoverFlight).toBeNull();
    });

    it('ricochets off an ally and travels back', () => {
        const flung = makeUnit('flung', 100);
        const ally = makeUnit('ally', 180, 'player');
        lift(flung);
        launchHoverFlight(flung, { x: 1, y: 0 }, SPEED, DISTANCE);
        const engine = engineFor([flung, ally]);
        fly(flung, DISTANCE / SPEED + FALL_DURATION, engine);
        expect(flung.x).toBeLessThan(100);
    });

    it('stops on a wall and drops the flight', () => {
        const grid = TerrainGrid.createFilledTerrain(12, 6, CELL_SIZE, TerrainType.Grass);
        const terrain = new TerrainManager(grid);
        terrain.setTerrainLayers(new TerrainLayerManager());
        const rockCol = 4;
        terrain.grid.set(rockCol, Math.floor(100 / CELL_SIZE), TerrainType.Rock);

        const unit = makeUnit('flung', 100);
        lift(unit);
        launchHoverFlight(unit, { x: 1, y: 0 }, SPEED, DISTANCE);
        const engine = engineFor([unit], terrain);
        fly(unit, DISTANCE / SPEED, engine);
        expect(unit.hoverFlight).toBeNull();
        expect(unit.x).toBeLessThan(rockCol * CELL_SIZE);
    });

    it('a cancelled lift falls in place', () => {
        const unit = makeUnit('flung', 100);
        lift(unit);
        cancelHoverFlight(unit);
        expect(unit.hoverFlight?.phase).toBe('fall');
        fly(unit, FALL_DURATION + FIXED_DT, engineFor([unit]));
        expect(unit.x).toBe(100);
        expect(unit.hoverFlight).toBeNull();
    });

    it('round-trips through JSON', () => {
        const unit = makeUnit('flung', 100);
        lift(unit);
        launchHoverFlight(unit, { x: 3, y: 4 }, SPEED, DISTANCE);
        unit.hoverFlight!.passedUnitIds.push('already');
        const restored = hoverFlightFromJSON(serializeHoverFlight(unit.hoverFlight!));
        expect(restored).toEqual(unit.hoverFlight);
        expect(restored?.passedUnitIds).not.toBe(unit.hoverFlight?.passedUnitIds);
    });
});

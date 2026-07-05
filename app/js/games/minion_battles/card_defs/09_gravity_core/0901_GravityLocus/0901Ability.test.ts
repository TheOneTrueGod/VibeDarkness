import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '../../../game/EventBus';
import { Unit } from '../../../game/units/Unit';
import type { EngineContext } from '../../../game/EngineContext';
import { executeUnitAbility } from '../../../game/units/unitAbilityLifecycle';
import { tickUnitActiveAbilities } from '../../../game/units/unitAbilityTick';
import { updateUnit } from '../../../game/units/unitMovementTick';
import { Gravity } from '../../../resources/Gravity';
import {
    GRAVITY_ABILITY_MODE_PULL,
    GRAVITY_ABILITY_MODE_PUSH,
    GRAVITY_LOCUS_GRAVITY_COST,
    GRAVITY_LOCUS_PREFIRE_TIME,
} from '../gravityConstants';
import { TerrainLayerManager } from '../../../game/TerrainLayerManager';
import { TerrainGrid, CELL_SIZE } from '../../../terrain/TerrainGrid';
import { TerrainManager } from '../../../terrain/TerrainManager';
import { TerrainType } from '../../../terrain/TerrainType';
import { GravityLocusAbility } from './0901Ability';

const CARD_ID = GravityLocusAbility.id;
const LOCUS = { x: 100, y: 100 };
const TICK_DT = 0.01;

function makeCaster(initialGravity: number): Unit {
    const unit = new Unit({
        id: 'caster',
        x: 80,
        y: 100,
        hp: 100,
        maxHp: 100,
        speed: 100,
        teamId: 'player',
        ownerId: 'p1',
        characterId: 'player',
        name: 'Caster',
        abilities: [CARD_ID],
    });
    unit.abilityRuntime[CARD_ID] = {
        currentUses: 1,
        maxUses: 1,
        recoveryChargesByType: {},
        active: true,
        replacedAbilityId: null,
    };
    const gravity = new Gravity();
    gravity.add(initialGravity);
    gravity.attach(unit, new EventBus());
    unit.resources.push(gravity);
    return unit;
}

function makeEnemy(id: string, x: number, y: number): Unit {
    return new Unit({
        id,
        x,
        y,
        hp: 100,
        maxHp: 100,
        speed: 100,
        teamId: 'enemy',
        ownerId: 'ai',
        characterId: 'dark_wolf',
        name: id,
    });
}

function makeEngine(units: Unit[], terrainManager?: TerrainManager): EngineContext {
    const eventBus = new EventBus();
    return {
        gameTime: 0,
        gameTick: 0,
        roundNumber: 1,
        eventBus,
        units,
        terrainManager: terrainManager ?? null,
        getUnit: (id: string) => units.find((u) => u.id === id),
        trackAbilityUse: vi.fn(),
        addEffectEmitter: vi.fn(),
        addEffect: vi.fn(),
    } as unknown as EngineContext;
}

function makeTerrainManager(cols: number, rows: number): TerrainManager {
    const grid = TerrainGrid.createFilledTerrain(cols, rows, CELL_SIZE, TerrainType.Grass);
    const manager = new TerrainManager(grid);
    manager.setTerrainLayers(new TerrainLayerManager());
    return manager;
}

function advanceSimulation(
    units: Unit[],
    engine: EngineContext,
    totalSeconds: number,
    abilityTickUnits: Unit[] = units,
): void {
    const steps = Math.ceil(totalSeconds / TICK_DT);
    for (let i = 0; i < steps; i++) {
        engine.gameTime += TICK_DT;
        for (const unit of abilityTickUnits) {
            tickUnitActiveAbilities(unit, TICK_DT, engine, vi.fn());
        }
        for (const unit of units) {
            updateUnit(unit, TICK_DT, engine);
        }
    }
}

describe('GravityLocusAbility', () => {
    it('push mode moves enemies outward without interrupting an enemy mid-windup', () => {
        const caster = makeCaster(100);
        const enemy = makeEnemy('enemy', 120, 100);
        enemy.activeAbilities = [{
            abilityId: 'windup_test',
            startTime: 0,
            targets: [],
            fired: false,
        }];
        const engine = makeEngine([caster, enemy]);
        const startX = enemy.x;

        executeUnitAbility(
            caster,
            GravityLocusAbility,
            [{ type: 'pixel', position: { ...LOCUS } }],
            engine,
            GRAVITY_ABILITY_MODE_PUSH,
        );

        advanceSimulation([caster, enemy], engine, GRAVITY_LOCUS_PREFIRE_TIME + 0.5, [caster]);

        expect(enemy.x).toBeGreaterThan(startX);
        expect(enemy.activeAbilities).toHaveLength(1);
        expect(enemy.activeAbilities[0]?.abilityId).toBe('windup_test');
    });

    it('pull mode draws enemies inward and they stop at the locus', () => {
        const caster = makeCaster(100);
        const enemy = makeEnemy('enemy', 140, 100);
        const engine = makeEngine([caster, enemy]);

        executeUnitAbility(
            caster,
            GravityLocusAbility,
            [{ type: 'pixel', position: { ...LOCUS } }],
            engine,
            GRAVITY_ABILITY_MODE_PULL,
        );

        advanceSimulation([caster, enemy], engine, GRAVITY_LOCUS_PREFIRE_TIME + 1.2, [caster]);

        expect(enemy.x).toBeLessThan(140);
        expect(Math.hypot(enemy.x - LOCUS.x, enemy.y - LOCUS.y)).toBeLessThan(3);
    });

    it('push mode does not nudge enemies through rock terrain', () => {
        const terrainManager = makeTerrainManager(12, 6);
        terrainManager.grid.set(5, 3, TerrainType.Rock);

        const caster = makeCaster(100);
        const locusX = CELL_SIZE * 3.5;
        const enemyX = CELL_SIZE * 4.5;
        const rowY = CELL_SIZE * 3.5;
        const enemy = makeEnemy('enemy', enemyX, rowY);
        const engine = makeEngine([caster, enemy], terrainManager);
        const startX = enemy.x;

        executeUnitAbility(
            caster,
            GravityLocusAbility,
            [{ type: 'pixel', position: { x: locusX, y: rowY } }],
            engine,
            GRAVITY_ABILITY_MODE_PUSH,
        );

        advanceSimulation([caster, enemy], engine, GRAVITY_LOCUS_PREFIRE_TIME + 1.2, [caster]);

        expect(enemy.x).toBeGreaterThan(startX);
        expect(terrainManager.isPassable(enemy.x, enemy.y)).toBe(true);
        expect(enemy.x).toBeLessThan(CELL_SIZE * 5);
    });

    it('casting spends gravity', () => {
        const initialGravity = GRAVITY_LOCUS_GRAVITY_COST + 25;
        const caster = makeCaster(initialGravity);
        const engine = makeEngine([caster]);

        executeUnitAbility(
            caster,
            GravityLocusAbility,
            [{ type: 'pixel', position: { ...LOCUS } }],
            engine,
        );

        expect(caster.getResource('gravity')?.current).toBe(initialGravity - GRAVITY_LOCUS_GRAVITY_COST);
    });
});

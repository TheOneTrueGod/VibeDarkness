import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '../../../game/EventBus';
import { Unit } from '../../../game/units/Unit';
import type { EngineContext } from '../../../game/EngineContext';
import { executeUnitAbility } from '../../../game/units/unitAbilityLifecycle';
import { tickUnitActiveAbilities } from '../../../game/units/unitAbilityTick';
import { updateUnit } from '../../../game/units/unitMovementTick';
import { updateUnitKnockback } from '../../../game/units/unitKnockback';
import { DEFAULT_UNIT_RADIUS } from '../../../game/units/unit_defs/unitConstants';
import { TerrainGrid, CELL_SIZE } from '../../../terrain/TerrainGrid';
import { TerrainManager } from '../../../terrain/TerrainManager';
import { TerrainType } from '../../../terrain/TerrainType';
import { TerrainLayerManager } from '../../../game/TerrainLayerManager';
import type { TeamId } from '../../../game/teams';
import { Gravity } from '../../../resources/Gravity';
import type { ResolvedTarget } from '../../../game/types';
import {
    FORCE_PUSH_COLLISION_DAMAGE,
    FORCE_PUSH_COOLDOWN_DURATION,
    FORCE_PUSH_LANDING_MAX_DISTANCE,
    FORCE_PUSH_PREFIRE_TIME,
    FORCE_PUSH_SELECT_GAP,
    FORCE_PUSH_TERRAIN_DAMAGE,
    FORCE_PUSH_ACTIVE_DURATION,
} from '../gravityConstants';
import { ForcePushAbility } from './0902Ability';

const CARD_ID = ForcePushAbility.id;
const TICK_DT = 0.01;
const KNOCKBACK_TICK_DT = 0.02;

const MOVER_START_X = 100;
const STRUCK_CENTER_X = 200;
const SHARED_Y = 100;

const LAUNCH_ADVANCE = FORCE_PUSH_PREFIRE_TIME + FORCE_PUSH_SELECT_GAP + 0.02;

const TOTAL_CAST_DURATION =
    FORCE_PUSH_PREFIRE_TIME + FORCE_PUSH_ACTIVE_DURATION + FORCE_PUSH_COOLDOWN_DURATION;

function forcePushTargets(
    flung: Unit,
    landing: { x: number; y: number },
): ResolvedTarget[] {
    return [
        { type: 'unit', unitId: flung.id },
        { type: 'pixel', position: landing },
    ];
}

function landingAwayFromCaster(flung: Unit, caster: Unit): { x: number; y: number } {
    const dx = flung.x - caster.x;
    const dy = flung.y - caster.y;
    const dist = Math.hypot(dx, dy);
    const dirX = dist < 1e-6 ? 1 : dx / dist;
    const dirY = dist < 1e-6 ? 0 : dy / dist;
    return {
        x: flung.x + dirX * FORCE_PUSH_LANDING_MAX_DISTANCE,
        y: flung.y + dirY * FORCE_PUSH_LANDING_MAX_DISTANCE,
    };
}

function makeCaster(initialGravity: number): Unit {
    const unit = new Unit({
        id: 'caster',
        x: 50,
        y: SHARED_Y,
        hp: 100,
        maxHp: 100,
        speed: 100,
        teamId: 'player',
        ownerId: 'p1',
        characterId: 'player',
        name: 'Caster',
        abilities: [CARD_ID],
        radius: DEFAULT_UNIT_RADIUS,
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

function makeUnit(
    id: string,
    x: number,
    y: number,
    teamId: TeamId,
): Unit {
    return new Unit({
        id,
        x,
        y,
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

function makeTerrainManager(cols: number, rows: number): TerrainManager {
    const grid = TerrainGrid.createFilledTerrain(cols, rows, CELL_SIZE, TerrainType.Grass);
    const manager = new TerrainManager(grid);
    manager.setTerrainLayers(new TerrainLayerManager());
    return manager;
}

function makeEngine(units: Unit[], terrainManager: TerrainManager | null = null): EngineContext {
    const eventBus = new EventBus();
    return {
        gameTime: 0,
        gameTick: 0,
        roundNumber: 1,
        eventBus,
        units,
        terrainManager,
        getUnit: (id: string) => units.find((u) => u.id === id),
        trackAbilityUse: vi.fn(),
        addEffectEmitter: vi.fn(),
        addEffect: vi.fn(),
    } as unknown as EngineContext;
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

function tickAllKnockback(
    units: Unit[],
    engine: EngineContext,
    terrainManager: TerrainManager | null = null,
    maxSteps = 200,
): void {
    const grid = terrainManager?.grid ?? null;
    for (let i = 0; i < maxSteps; i++) {
        let anyKnockback = false;
        for (const unit of units) {
            if (!unit.knockback) continue;
            anyKnockback = true;
            updateUnitKnockback(unit, KNOCKBACK_TICK_DT, grid, terrainManager, {
                eventBus: engine.eventBus,
                units,
            });
        }
        if (!anyKnockback) break;
    }
}

describe('ForcePushAbility', () => {
    it('flung enemy into second enemy damages both units', () => {
        const caster = makeCaster(100);
        const flung = makeUnit('flung', MOVER_START_X, SHARED_Y, 'enemy');
        const struck = makeUnit('struck', STRUCK_CENTER_X, SHARED_Y, 'enemy');
        const engine = makeEngine([caster, flung, struck]);

        executeUnitAbility(
            caster,
            ForcePushAbility,
            forcePushTargets(flung, landingAwayFromCaster(flung, caster)),
            engine,
        );

        advanceSimulation([caster, flung, struck], engine, LAUNCH_ADVANCE, [caster]);
        tickAllKnockback([caster, flung, struck], engine);

        expect(flung.hp).toBe(100 - FORCE_PUSH_COLLISION_DAMAGE);
        expect(struck.hp).toBe(100 - FORCE_PUSH_COLLISION_DAMAGE);
    });

    it('flung enemy into an ally damages only the flung unit', () => {
        const caster = makeCaster(100);
        const flung = makeUnit('flung', MOVER_START_X, SHARED_Y, 'enemy');
        const ally = makeUnit('ally', STRUCK_CENTER_X, SHARED_Y, 'player');
        const engine = makeEngine([caster, flung, ally]);

        executeUnitAbility(
            caster,
            ForcePushAbility,
            forcePushTargets(flung, landingAwayFromCaster(flung, caster)),
            engine,
        );

        advanceSimulation([caster, flung, ally], engine, LAUNCH_ADVANCE, [caster]);
        tickAllKnockback([caster, flung, ally], engine);

        expect(flung.hp).toBe(100 - FORCE_PUSH_COLLISION_DAMAGE);
        expect(ally.hp).toBe(100);
    });

    it('wall bounce damages the flung unit', () => {
        const terrainManager = makeTerrainManager(12, 4);
        // Rock one column ahead of the ~50px fling from MOVER_START_X (caster at x=50).
        terrainManager.grid.set(3, 2, TerrainType.Rock);

        const caster = makeCaster(100);
        const flung = makeUnit('flung', MOVER_START_X, SHARED_Y, 'enemy');
        const engine = makeEngine([caster, flung], terrainManager);

        const terrainCollisions: unknown[] = [];
        engine.eventBus.on('forced_movement_terrain_collision', (data) => {
            terrainCollisions.push(data);
        });

        executeUnitAbility(
            caster,
            ForcePushAbility,
            forcePushTargets(flung, landingAwayFromCaster(flung, caster)),
            engine,
        );

        advanceSimulation([caster, flung], engine, LAUNCH_ADVANCE, [caster]);
        tickAllKnockback([flung], engine, terrainManager);

        expect(terrainCollisions.length).toBeGreaterThanOrEqual(1);
        expect(flung.hp).toBe(100 - FORCE_PUSH_TERRAIN_DAMAGE);
    });

    it('flung unit travels toward the aimed landing on open terrain', () => {
        const openX = 300;
        const openY = 300;
        const caster = makeCaster(100);
        caster.x = openX - 60;
        caster.y = openY;
        const flung = makeUnit('flung', openX, openY, 'enemy');
        const engine = makeEngine([caster, flung]);

        const landing = landingAwayFromCaster(flung, caster);
        executeUnitAbility(
            caster,
            ForcePushAbility,
            forcePushTargets(flung, landing),
            engine,
        );

        advanceSimulation([caster, flung], engine, LAUNCH_ADVANCE, [caster]);
        tickAllKnockback([flung], engine);

        expect(flung.x).toBeGreaterThan(openX + 40);
    });

    it('cleans up collision listeners after the cast ends', () => {
        const caster = makeCaster(100);
        const flung = makeUnit('flung', MOVER_START_X, SHARED_Y, 'enemy');
        const struck = makeUnit('struck', STRUCK_CENTER_X, SHARED_Y, 'enemy');
        const engine = makeEngine([caster, flung, struck]);

        executeUnitAbility(
            caster,
            ForcePushAbility,
            forcePushTargets(flung, landingAwayFromCaster(flung, caster)),
            engine,
        );

        advanceSimulation([caster, flung, struck], engine, TOTAL_CAST_DURATION + 0.1, [caster]);

        const hpBefore = flung.hp;
        engine.eventBus.emit('forced_movement_unit_collision', {
            movingUnitId: flung.id,
            struckUnitId: struck.id,
            impact: { x: flung.x, y: flung.y },
            source: { unitId: caster.id, abilityId: CARD_ID },
        });

        expect(flung.hp).toBe(hpBefore);
    });
});

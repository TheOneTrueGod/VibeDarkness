/**
 * Def-level render options: what a plated unit, a burrowing unit and a fused body resolve to for the renderer. Pure
 * resolvers only (no Pixi); the painters just draw what these return.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
    buildTinyBattleEngine,
    spawnTinyPlayerUnit,
    TINY_BATTLE_PLAYER_ID,
} from '../testing/harness/buildTinyBattleEngine';
import { createTargetDummyAtWorld } from '../testing/fixtures/targetDummies';
import type { GameEngine } from './GameEngine';
import type { Unit } from './units/Unit';
import { CELL_SIZE } from '../terrain/TerrainGrid';
import { createUnitFromSpawnConfig } from './units/index';
import { getUnitDefEntry } from './units/unit_defs/unitDef';
import { ENEMY_GARDEN_HEART, ENEMY_THORNSPITTER } from '../constants/enemyConstants';
import { linkNodeChild } from './units/components/nodeTree';
import { spawnFusedBody } from './units/components/fusedBodySpawn';
import { burrowPreset, type UnitPhaseDef } from './units/components/phaseDef';
import {
    BURROW_GROUND_LINE_RADII,
    BURROW_SINK_RADII,
    DEFAULT_BURROW_DIRT_COLOR,
    DEFAULT_TELEGRAPH_COLOR,
    resolveBurrowRender,
    resolveFusedBodyTelegraph,
    resolvePlatedLook,
} from './units/unitRenderOptions';
import { GARDEN_NODE_RENDER_OPTIONS } from '../card_defs/16_enemy_garden_heart/gardenHeartConstants';
import { halfEllipsePoints } from './GameRenderer/renderers/unitRenderOptionsVisual';

const P = TINY_BATTLE_PLAYER_ID;
const TICKS_PER_SEC = 60;
const cell = (n: number): number => n * CELL_SIZE + CELL_SIZE / 2;

function makeEngine(): GameEngine {
    const engine = buildTinyBattleEngine({ gridW: 24, gridH: 16, localPlayerId: P, grass: true });
    spawnTinyPlayerUnit(engine, { playerId: P, x: cell(0), y: cell(0), abilities: [] });
    engine.enemyScalingPlayerCount = 1;
    return engine;
}

function step(engine: GameEngine, seconds: number): void {
    const ticks = Math.round(seconds * TICKS_PER_SEC);
    for (let i = 0; i < ticks; i++) {
        const batch = engine.waitingForOrders;
        if (batch) {
            for (const waiter of batch.waiters) {
                engine.state.orderMgr.applyOrder({ unitId: waiter.unitId, abilityId: 'wait', targets: [], endTurn: true });
            }
            engine.tryResumeParallel();
        }
        engine.stepSimulationFixedTicks(1);
    }
}

function addGarden(engine: GameEngine, def: typeof ENEMY_GARDEN_HEART, x: number, y: number): Unit {
    const u = createUnitFromSpawnConfig({ ...def, x, y, ownerId: 'ai', unitAITreeId: 'none' }, engine.eventBus, engine);
    engine.addUnit(u, 'initialGameSpawn');
    return u;
}

describe('plated look', () => {
    it('is closed while the Shell is up and open once the last child dies', () => {
        const engine = makeEngine();
        const heart = addGarden(engine, ENEMY_GARDEN_HEART, cell(12), cell(8));
        const bud = addGarden(engine, ENEMY_THORNSPITTER, cell(14), cell(8));
        expect(resolvePlatedLook(heart)?.state).toBe('open'); // no children yet
        linkNodeChild(heart, bud);
        expect(resolvePlatedLook(heart)?.state).toBe('closed');
        expect(resolvePlatedLook(bud)?.state).toBe('open'); // a leaf has no Shell
        bud.takeDamage(99999, null, engine.eventBus);
        engine.stepSimulationFixedTicks(2);
        expect(resolvePlatedLook(heart)?.state).toBe('open');
        engine.destroy();
    });

    it('uses the def palette and is null for a unit with no plated option', () => {
        const engine = makeEngine();
        const heart = addGarden(engine, ENEMY_GARDEN_HEART, cell(12), cell(8));
        expect(resolvePlatedLook(heart)?.def).toEqual(GARDEN_NODE_RENDER_OPTIONS.plated);
        const dummy = createTargetDummyAtWorld(engine, cell(5), cell(5), { id: 'dummy', hp: 10 });
        engine.addUnit(dummy, 'initialGameSpawn');
        expect(resolvePlatedLook(dummy)).toBeNull();
        engine.destroy();
    });

    it('half-ellipse points are mirrored and the open halves swing apart', () => {
        const left = halfEllipsePoints(-1, 10, 12, 0, 0);
        const right = halfEllipsePoints(1, 10, 12, 0, 0);
        expect(left.length).toBe(right.length);
        expect(Math.min(...left.filter((_, i) => i % 2 === 0))).toBeCloseTo(-10);
        expect(Math.max(...right.filter((_, i) => i % 2 === 0))).toBeCloseTo(10);
        const shifted = halfEllipsePoints(1, 10, 12, 5, 0);
        expect(shifted[0]).toBeCloseTo(right[0]! + 5);
    });
});

describe('fused body telegraph', () => {
    it('is absent until the last 1.5 s, then a red circle whose fill grows, and gone once it resolves', () => {
        const engine = makeEngine();
        const seed = spawnFusedBody(engine, { characterId: 'pod_seed', x: cell(10), y: cell(8), unitId: 'seed' })!;
        expect(resolveFusedBodyTelegraph(seed)).toBeNull();
        step(engine, 5 - 1.5 + 0.1);
        const early = resolveFusedBodyTelegraph(seed);
        expect(early).not.toBeNull();
        expect(early!.color).toBe(DEFAULT_TELEGRAPH_COLOR);
        expect([early!.x, early!.y]).toEqual([seed.x, seed.y]);
        step(engine, 1);
        const later = resolveFusedBodyTelegraph(seed);
        expect(later!.fill).toBeGreaterThan(early!.fill);
        step(engine, 1);
        expect(resolveFusedBodyTelegraph(seed)).toBeNull();
        engine.destroy();
    });

    it('killing the seed early removes the circle (the fizzle visual is data on the def)', () => {
        const engine = makeEngine();
        const seed = spawnFusedBody(engine, { characterId: 'pod_seed', x: cell(10), y: cell(8), unitId: 'seed' })!;
        step(engine, 4);
        expect(resolveFusedBodyTelegraph(seed)).not.toBeNull();
        seed.takeDamage(9999, null, engine.eventBus);
        expect(resolveFusedBodyTelegraph(seed)).toBeNull();
        const spec = getUnitDefEntry('pod_seed')!.components![0].options as { onDeath: { visuals: { type: string; effectType?: string }[] } };
        expect(spec.onDeath.visuals.some((v) => v.type === 'effect' && v.effectType === 'Pulse')).toBe(true);
        engine.destroy();
    });
});

describe('burrow render', () => {
    const DUMMY_DEF = getUnitDefEntry('target_dummy')!;
    beforeEach(() => {
        DUMMY_DEF.phases = undefined;
    });
    afterEach(() => {
        DUMMY_DEF.phases = undefined;
    });

    it('is null off-burrow, sits on the ground line while sinking and is fully under while travelling', () => {
        const engine = makeEngine();
        const phase: UnitPhaseDef = {
            id: 'p2',
            enterWhen: { kind: 'health_below_percent', threshold: 0.75 },
            clampHitAtThreshold: true,
            transition: burrowPreset(
                {
                    closeSeconds: 0.2,
                    sinkSeconds: 0.4,
                    travelSeconds: 1,
                    riseSeconds: 0.4,
                    sproutPoints: [{ x: cell(20), y: cell(14) }],
                },
                'Burrowing',
            ),
        };
        DUMMY_DEF.phases = [phase];
        const unit = createTargetDummyAtWorld(engine, cell(12), cell(8), { id: 'phased', hp: 100 });
        engine.addUnit(unit, 'initialGameSpawn');
        expect(resolveBurrowRender(unit, engine.tickTime)).toBeNull();
        unit.takeDamage(60, null, engine.eventBus);
        const closing = resolveBurrowRender(unit, engine.tickTime)!;
        expect(closing.visual.stage).toBe('close');
        expect(closing.sinkY).toBe(0);
        expect(closing.dirtColor).toBe(DEFAULT_BURROW_DIRT_COLOR);
        expect(closing.groundLineY).toBeCloseTo(unit.y + unit.radius * BURROW_GROUND_LINE_RADII);
        step(engine, 0.2 + 0.4 + 0.5);
        const travelling = resolveBurrowRender(unit, engine.tickTime)!;
        expect(travelling.visual.stage).toBe('travel');
        expect(travelling.sinkY).toBeCloseTo(unit.radius * BURROW_SINK_RADII);
        engine.destroy();
    });

    it('shows the eruption circle at the rise point only during the rise, filling as it goes', () => {
        const engine = makeEngine();
        const to = { x: cell(20), y: cell(14) };
        DUMMY_DEF.phases = [
            {
                id: 'p2',
                enterWhen: { kind: 'health_below_percent', threshold: 0.75 },
                clampHitAtThreshold: true,
                transition: burrowPreset(
                    { closeSeconds: 0.2, sinkSeconds: 0.2, travelSeconds: 0.4, riseSeconds: 1, sproutPoints: [to], eruption: { radiusPx: 90, damage: 5 } },
                    'Burrowing',
                ),
            },
        ];
        const unit = createTargetDummyAtWorld(engine, cell(12), cell(8), { id: 'phased', hp: 100 });
        engine.addUnit(unit, 'initialGameSpawn');
        unit.takeDamage(60, null, engine.eventBus);
        step(engine, 0.6);
        expect(resolveBurrowRender(unit, engine.tickTime)!.eruption).toBeNull();
        step(engine, 0.7);
        const early = resolveBurrowRender(unit, engine.tickTime)!;
        expect(early.visual.stage).toBe('rise');
        expect(early.eruption).toMatchObject({ x: to.x, y: to.y, radiusPx: 90, color: DEFAULT_TELEGRAPH_COLOR });
        step(engine, 0.4);
        expect(resolveBurrowRender(unit, engine.tickTime)!.eruption!.fill).toBeGreaterThan(early.eruption!.fill);
        engine.destroy();
    });
});

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
import { CREEPER_ID, GLOAM_LILY_ID, HIVE_GOURD_ID, POD_MORTAR_ID, THORNSPITTER_ID } from '../card_defs/16_enemy_garden_heart/gardenHeartConstants';
import { NODE_TREE_COMPONENT, linkNodeChild } from './units/components/nodeTree';
import { NODE_REGROWTH_COMPONENT } from './units/components/nodeRegrowth';
import { registerNodeRegrowthCallback } from './units/components/nodeRegrowthHooks';
import { attachComponent, componentSpec } from './units/components/unitComponent';
import { getActiveUnitBanner, showUnitBanner } from './unitBanner';
import { spawnFusedBody } from './units/components/fusedBodySpawn';
import { burrowPreset, type UnitPhaseDef } from './units/components/phaseDef';
import {
    BURROW_GROUND_LINE_RADII,
    BURROW_SINK_RADII,
    DEFAULT_BURROW_DIRT_COLOR,
    DEFAULT_TELEGRAPH_COLOR,
    resolveBurrowRender,
    resolveFusedBodyTelegraph,
    resolvePlantAim,
    resolvePlantForm,
    resolvePlatedLook,
    resolveTimerRing,
} from './units/unitRenderOptions';
import { GARDEN_NODE_RENDER_OPTIONS } from '../card_defs/16_enemy_garden_heart/gardenHeartConstants';
import { easePlantAim, halfEllipsePoints } from './GameRenderer/renderers/unitRenderOptionsVisual';

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

describe('plant form', () => {
    it('every node kind has its own form; the Heart keeps the plated sprite look', () => {
        const forms = [THORNSPITTER_ID, POD_MORTAR_ID, HIVE_GOURD_ID, CREEPER_ID, GLOAM_LILY_ID, 'pod_seed'].map(
            (id) => getUnitDefEntry(id as never)!.renderOptions?.plantForm?.form,
        );
        expect(forms).toEqual(['turret', 'mortar', 'gourd', 'creeper', 'lily', 'seed']);
        expect(getUnitDefEntry('garden_heart')!.renderOptions?.plantForm).toBeUndefined();
    });

    it('follows the Shell: closed with a living child, open after; uses the plated palette', () => {
        const engine = makeEngine();
        const knot = addGarden(engine, ENEMY_THORNSPITTER, cell(12), cell(8));
        const bud = addGarden(engine, ENEMY_THORNSPITTER, cell(14), cell(8));
        linkNodeChild(knot, bud);
        expect(resolvePlantForm(knot)).toMatchObject({ form: 'turret', open: false, plated: GARDEN_NODE_RENDER_OPTIONS.plated, bursting: null });
        expect(resolvePlantForm(bud)?.open).toBe(true);
        bud.takeDamage(99999, null, engine.eventBus);
        engine.stepSimulationFixedTicks(2);
        expect(resolvePlantForm(knot)?.open).toBe(true);
        engine.destroy();
    });

    it("a seed's cracks glow only while its blast is telegraphed", () => {
        const engine = makeEngine();
        const seed = spawnFusedBody(engine, { characterId: 'pod_seed', x: cell(10), y: cell(8), unitId: 'seed' })!;
        expect(resolvePlantForm(seed)?.bursting).toBeNull();
        step(engine, 5 - 1.5 + 0.1);
        expect(resolvePlantForm(seed)?.bursting).toBeGreaterThan(0);
        engine.destroy();
    });

    it('a turret aims at its AI target, keeps its last aim without one, and turns smoothly', () => {
        const engine = makeEngine();
        const turret = addGarden(engine, ENEMY_THORNSPITTER, cell(12), cell(8));
        const target = addGarden(engine, ENEMY_THORNSPITTER, cell(12), cell(4)); // straight up the screen
        const lookup = (id: string) => engine.getUnit(id);
        expect(resolvePlantAim(turret, lookup)).toBeNull();
        (turret.aiContext as { targetUnitId?: string }).targetUnitId = target.id;
        expect(resolvePlantAim(turret, lookup)).toBeCloseTo(-Math.PI / 2, 6);

        const first = easePlantAim(turret, 0, 10); // first frame snaps
        expect(first).toBe(0);
        const mid = easePlantAim(turret, Math.PI / 2, 10.05);
        expect(mid).toBeGreaterThan(0);
        expect(mid).toBeLessThan(Math.PI / 2);
        expect(easePlantAim(turret, null, 10.1)).toBe(mid); // no target: holds
        engine.destroy();
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

describe('timer ring', () => {
    const DUMMY_DEF = getUnitDefEntry('target_dummy')!;
    const RING = { source: 'nodeRegrowth', color: 0xc4b5fd, width: 2, alpha: 0.6, offsetPx: 1 } as const;
    let off: (() => void) | undefined;
    beforeEach(() => {
        DUMMY_DEF.renderOptions = { timerRing: RING };
        off = registerNodeRegrowthCallback('ring_regrow', () => 0);
    });
    afterEach(() => {
        DUMMY_DEF.renderOptions = undefined;
        off?.();
    });

    function makeRoot(engine: GameEngine): { root: Unit; child: Unit } {
        const root = createTargetDummyAtWorld(engine, cell(12), cell(8), { id: 'root', hp: 100 });
        engine.addUnit(root, 'initialGameSpawn');
        attachComponent(root, componentSpec(NODE_TREE_COMPONENT, {}));
        attachComponent(root, componentSpec(NODE_REGROWTH_COMPONENT, { openSeconds: 5, regrowCallback: 'ring_regrow' }));
        const child = createTargetDummyAtWorld(engine, cell(14), cell(8), { id: 'child', hp: 10 });
        engine.addUnit(child, 'initialGameSpawn');
        linkNodeChild(root, child, { tetherMaxLength: 400 });
        return { root, child };
    }

    it('is hidden until the window opens, then drains 1 to 0 with the def style, and hides again', () => {
        const engine = makeEngine();
        const { root, child } = makeRoot(engine);
        expect(resolveTimerRing(root, engine.gameTime)).toBeNull();
        child.takeDamage(999, null, engine.eventBus);
        engine.stepSimulationFixedTicks(1);
        const start = resolveTimerRing(root, engine.gameTime)!;
        expect(start.fraction).toBeGreaterThan(0.95);
        expect(start).toMatchObject({ color: RING.color, width: RING.width, alpha: RING.alpha, offsetPx: RING.offsetPx });
        step(engine, 2.5);
        expect(resolveTimerRing(root, engine.gameTime)!.fraction).toBeCloseTo(0.5, 1);
        step(engine, 3);
        expect(resolveTimerRing(root, engine.gameTime)).toBeNull();
        engine.destroy();
    });

    it('is null for a unit whose def has no timerRing option', () => {
        const engine = makeEngine();
        const { root } = makeRoot(engine);
        DUMMY_DEF.renderOptions = undefined;
        expect(resolveTimerRing(root, engine.gameTime)).toBeNull();
        engine.destroy();
    });
});

describe('unit banner', () => {
    it('emits unit_banner with text and duration, is active until its time is up, and replaces an earlier one', () => {
        const engine = makeEngine();
        const seen: Array<{ unitId: string; text: string; durationSec: number }> = [];
        engine.eventBus.on('unit_banner', (e) => seen.push(e));
        expect(getActiveUnitBanner(engine, 'boss')).toBeNull();
        showUnitBanner(engine, 'boss', 'The Heart is bared!', 1.5);
        expect(seen).toEqual([{ unitId: 'boss', text: 'The Heart is bared!', durationSec: 1.5 }]);
        expect(getActiveUnitBanner(engine, 'boss')).toBe('The Heart is bared!');
        step(engine, 1);
        showUnitBanner(engine, 'boss', 'The Heart regrows...', 1.5);
        step(engine, 1);
        expect(getActiveUnitBanner(engine, 'boss')).toBe('The Heart regrows...');
        step(engine, 1);
        expect(getActiveUnitBanner(engine, 'boss')).toBeNull();
        engine.destroy();
    });
});

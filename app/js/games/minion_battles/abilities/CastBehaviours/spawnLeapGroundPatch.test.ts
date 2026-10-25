/**
 * Unit tests for the reusable SpawnUnits, Leap and GroundPatch cast-behaviour blocks. Each is driven
 * with hand-built contexts and exercised with two differently-configured "abilities" so the tests prove
 * the block works unchanged for a second user.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { EventBus } from '../../game/EventBus';
import { resetGameObjectIdCounter } from '../../game/GameObject';
import { createGenericEnemy } from '../../game/units/GenericEnemy';
import { TerrainLayerManager } from '../../game/TerrainLayerManager';
import type { Unit } from '../../game/units/Unit';
import type { TeamId } from '../../game/teams';
import type { Effect } from '../../game/effects/Effect';
import type { AbilityEngineContext } from '../AbilityEngineContext';
import type { CastBehaviourTickContext } from '../castBehaviourTypes';
import { SpawnUnitsBehaviour, offsetsFromCaster } from './SpawnUnitsBehaviour';
import { LeapBehaviour } from './LeapBehaviour';
import { GroundPatchBehaviour } from './GroundPatchBehaviour';

function makeCaster(x = 200, y = 200, teamId: TeamId = 'enemy'): Unit {
    return createGenericEnemy(
        { id: 'caster_1', x, y, hp: 50, speed: 40, teamId, characterId: 'boss', name: 'Boss', abilities: [] },
        new EventBus(),
    );
}

interface TestEngine {
    units: Unit[];
    gameTime: number;
    eventBus: EventBus;
    effects: Effect[];
    rngCalls: number;
    terrainLayers: TerrainLayerManager | undefined;
}

function makeEngine(units: Unit[]): TestEngine & Record<string, unknown> {
    let seed = 7;
    const engine: TestEngine & Record<string, unknown> = {
        units,
        gameTime: 10,
        eventBus: new EventBus(),
        effects: [],
        rngCalls: 0,
        terrainLayers: new TerrainLayerManager(),
        terrainManager: null,
        lightLevelEnabled: false,
        aiControllerId: null,
        mapPOIs: [],
        getUnit: (id: string) => units.find((u) => u.id === id),
        addUnit: (u: Unit) => units.push(u),
        addEffect: (e: Effect) => engine.effects.push(e),
        getLightAt: () => null,
        getZoneById: () => undefined,
        generateRandomInteger: (min: number, max: number) => {
            engine.rngCalls++;
            return min + ((seed = (seed * 16807) % 2147483647) % (max - min + 1));
        },
    };
    return engine;
}

function tickCtx(
    engine: TestEngine,
    caster: Unit,
    abilityId: string,
    overrides: Partial<CastBehaviourTickContext> = {},
): CastBehaviourTickContext {
    return {
        caster,
        abilityId,
        target: { type: 'pixel', position: { x: caster.x, y: caster.y } },
        allTargets: [],
        castPayload: undefined,
        behaviourPayload: undefined,
        setBehaviourPayload: () => {},
        engine: engine as unknown as AbilityEngineContext,
        windowProgress: 0,
        prevWindowProgress: 0,
        isFirstTick: true,
        isLastTick: true,
        ...overrides,
    };
}

/** A tick context whose behaviour payload persists across ticks, like the engine's `castBehaviourPayloads`. */
function payloadKeeper() {
    let stored: unknown = undefined;
    return (
        engine: TestEngine,
        caster: Unit,
        abilityId: string,
        overrides: Partial<CastBehaviourTickContext> = {},
    ): CastBehaviourTickContext => ({
        ...tickCtx(engine, caster, abilityId, overrides),
        behaviourPayload: stored,
        setBehaviourPayload: (data) => {
            stored = data;
        },
    });
}

describe('SpawnUnitsBehaviour', () => {
    let units: Unit[];
    let engine: ReturnType<typeof makeEngine>;
    let caster: Unit;

    beforeEach(() => {
        resetGameObjectIdCounter();
        units = [];
        caster = makeCaster();
        units.push(caster);
        engine = makeEngine(units);
    });

    it('spawns one child per picked position, on the template team, via the shared spawner core (summoner shape)', () => {
        const behaviour = new SpawnUnitsBehaviour({
            template: (ctx) => ({ characterId: 'dark_wolf', abilities: [], teamId: ctx.caster.teamId, controllable: false }),
            positions: offsetsFromCaster([{ dx: 35, dy: 0 }, { dx: -20, dy: 25 }, { dx: -20, dy: -25 }]),
        });
        behaviour.onTick!(tickCtx(engine, caster, 'summon_a'));

        const kids = units.filter((u) => u !== caster);
        expect(kids.map((u) => [u.x, u.y])).toEqual([[235, 200], [180, 225], [180, 175]]);
        expect(kids.every((u) => u.teamId === 'enemy' && u.characterId === 'dark_wolf')).toBe(true);
    });

    it('fires only on the first tick of its window', () => {
        const behaviour = new SpawnUnitsBehaviour({
            template: { characterId: 'dark_wolf', abilities: [], teamId: 'enemy' },
            positions: () => [{ x: 1, y: 1 }],
        });
        behaviour.onTick!(tickCtx(engine, caster, 'summon_a', { isFirstTick: false }));
        expect(units).toHaveLength(1);
    });

    it('replaces the previous batch, picks positions after fading, and calls hooks in order (decoy shape)', () => {
        const log: string[] = [];
        const old = makeCaster(0, 0);
        (old as { id: string }).id = 'old_clone';
        units.push(old);
        const behaviour = new SpawnUnitsBehaviour({
            // Ignores any placement/count the template carries: the picker owns both.
            template: { characterId: 'clone', abilities: [], teamId: 'enemy', placement: { kind: 'fixedWorld', x: 0, y: 0 }, count: 5 },
            replacePrevious: (ctx) => ctx.engine.units.filter((u) => u.id === 'old_clone'),
            positions: (ctx) => {
                log.push(`pick:old despawn=${old.ephemeralDespawnAtGameTime}`);
                ctx.engine.generateRandomInteger(0, 9);
                return [{ x: 300, y: 300 }, { x: 320, y: 300 }];
            },
            onSpawned: (_ctx, unit, index, at) => log.push(`spawned:${index}:${at.x}:${unit.x}`),
            onBatchSpawned: (_ctx, spawned) => log.push(`batch:${spawned.length}`),
        });
        behaviour.onTick!(tickCtx(engine, caster, 'decoy_b'));

        expect(old.ephemeralDespawnAtGameTime).toBe(10);
        expect(log).toEqual(['pick:old despawn=10', 'spawned:0:300:300', 'spawned:1:320:320', 'batch:2']);
        expect(units.filter((u) => u.characterId === 'clone')).toHaveLength(2);
        expect(engine.rngCalls).toBe(1);
    });

    it('spawns nothing and skips hooks when the picker returns no positions', () => {
        let batch = 0;
        const behaviour = new SpawnUnitsBehaviour({
            template: { characterId: 'clone', abilities: [], teamId: 'enemy' },
            positions: () => [],
            onBatchSpawned: () => {
                batch++;
            },
        });
        behaviour.onTick!(tickCtx(engine, caster, 'decoy_b'));
        expect(units).toHaveLength(1);
        expect(batch).toBe(0);
    });
});

describe('LeapBehaviour', () => {
    let engine: ReturnType<typeof makeEngine>;
    let caster: Unit;

    beforeEach(() => {
        resetGameObjectIdCounter();
        caster = makeCaster(0, 0);
        engine = makeEngine([caster]);
    });

    function makeLeap(log: string[], dest: { x: number; y: number } | null) {
        return new LeapBehaviour({
            destination: () => dest,
            airTimeSec: 0.5,
            onLaunch: () => log.push('launch'),
            onLand: (_ctx, d) => log.push(`land:${d.x},${d.y}`),
        });
    }

    it('launches airborne toward the destination on its first tick, then lands exactly on its last tick', () => {
        const log: string[] = [];
        const leap = makeLeap(log, { x: 100, y: 0 });
        const ctxFor = payloadKeeper();
        leap.onTick!(ctxFor(engine, caster, 'leap_a', { isFirstTick: true, isLastTick: false }));

        expect(log).toEqual(['launch']);
        expect(caster.knockback).not.toBeNull();
        expect(caster.knockback!.knockbackAirTime).toBe(0.5);
        expect(caster.knockback!.passThroughTerrain).toBe(true);
        expect(caster.knockback!.knockbackSource).toEqual({ unitId: 'caster_1', abilityId: 'leap_a' });

        // A mid-flight tick does nothing more; the payload carries the launch state.
        leap.onTick!(ctxFor(engine, caster, 'leap_a', { isFirstTick: false, isLastTick: false }));
        expect(log).toEqual(['launch']);

        caster.x = 37; // wherever physics left it
        leap.onTick!(ctxFor(engine, caster, 'leap_a', { isFirstTick: false, isLastTick: true }));
        expect(log).toEqual(['launch', 'land:100,0']);
        expect(caster.knockback).toBeNull();
        expect([caster.x, caster.y]).toEqual([100, 0]);
    });

    it('does nothing when there is no destination (second user: a different ability with nothing to leap to)', () => {
        const log: string[] = [];
        const leap = makeLeap(log, null);
        const ctxFor = payloadKeeper();
        leap.onTick!(ctxFor(engine, caster, 'boss_leap', { isFirstTick: true, isLastTick: false }));
        leap.onTick!(ctxFor(engine, caster, 'boss_leap', { isFirstTick: false, isLastTick: true }));
        expect(log).toEqual([]);
        expect(caster.knockback).toBeNull();
        expect([caster.x, caster.y]).toEqual([0, 0]);
    });

    it('still lands when the launch tick and the last tick coincide', () => {
        const log: string[] = [];
        makeLeap(log, { x: 50, y: 50 }).onTick!(tickCtx(engine, caster, 'leap_a'));
        expect(log).toEqual(['launch', 'land:50,50']);
        expect([caster.x, caster.y]).toEqual([50, 50]);
    });
});

describe('GroundPatchBehaviour', () => {
    let engine: ReturnType<typeof makeEngine>;
    let caster: Unit;

    beforeEach(() => {
        resetGameObjectIdCounter();
        caster = makeCaster(200, 200);
        engine = makeEngine([caster]);
    });

    it('places a jittered patch of cells with the configured effect, params, owner and lifetime (Bramble Patch shape)', () => {
        const patch = new GroundPatchBehaviour({
            effectType: 'dark_thorn',
            radius: 60,
            lifetimeSec: 30,
            lifetimeTrimSec: 0.15,
            jitterSec: 1,
            params: { slowMult: 0.5 },
            idPrefix: 'bramblepatch',
        });
        patch.onTick!(tickCtx(engine, caster, 'strike_x'));

        const cells = Array.from(engine.terrainLayers!.allEffects.values());
        expect(cells.length).toBeGreaterThan(0);
        expect(engine.rngCalls).toBe(cells.length);
        for (const c of cells) {
            expect(c.id.startsWith('bramblepatch-caster_1-10-')).toBe(true);
            expect(c.effectType).toBe('dark_thorn');
            expect(c.layer).toBe('ground');
            expect(c.ownerAbilityId).toBe('strike_x');
            expect(c.teamId).toBe('enemy');
            expect(c.params).toEqual({ slowMult: 0.5 });
            expect(c.placedAtGameTime).toBe(10);
            expect(c.expiresAtGameTime).toBeGreaterThanOrEqual(10 + 30 - 0.15);
            expect(c.expiresAtGameTime).toBeLessThanOrEqual(10 + 30 - 0.15 + 1);
        }
    });

    it('resolves radius and params from the cast context and honours an explicit centre, owner and layer (frost-patch shape)', () => {
        let weakened = true;
        const patch = new GroundPatchBehaviour({
            effectType: 'frost',
            layer: 'air',
            center: () => ({ x: 400, y: 400 }),
            radius: () => (weakened ? 50 : 160),
            lifetimeSec: () => 5,
            jitterSec: 0,
            params: () => ({ slowMult: weakened ? 0.9 : 0.4 }),
            idPrefix: 'frost',
            ownerAbilityId: 'frost_owner',
        });
        patch.onTick!(tickCtx(engine, caster, 'strike_y'));
        const small = Array.from(engine.terrainLayers!.allEffects.values());
        expect(small.length).toBeGreaterThan(0);
        expect(small.every((c) => c.layer === 'air' && c.ownerAbilityId === 'frost_owner' && c.expiresAtGameTime === 15)).toBe(true);
        expect(small.every((c) => (c.params as { slowMult: number }).slowMult === 0.9)).toBe(true);

        weakened = false;
        engine.gameTime = 20;
        patch.onTick!(tickCtx(engine, caster, 'strike_y'));
        expect(engine.terrainLayers!.allEffects.size).toBeGreaterThan(small.length * 2);
    });

    it('fires only on the first tick and tolerates an engine without terrain layers', () => {
        const patch = new GroundPatchBehaviour({
            effectType: 'dark_thorn', radius: 60, lifetimeSec: 30, jitterSec: 1, params: {}, idPrefix: 'p',
        });
        patch.onTick!(tickCtx(engine, caster, 'a', { isFirstTick: false }));
        expect(engine.terrainLayers!.allEffects.size).toBe(0);
        const bare = { ...engine, terrainLayers: undefined };
        expect(() => patch.onTick!(tickCtx(bare, caster, 'a'))).not.toThrow();
    });
});

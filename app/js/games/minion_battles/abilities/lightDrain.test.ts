/**
 * Light draining: shared helpers and the DrainLight cast behaviour.
 */
import { describe, it, expect } from 'vitest';
// Load the registry first (avoids the CastBehaviours import cycle, see behaviours.test.ts).
import './AbilityRegistry';
import { CastBehaviours } from './CastBehaviours';
import type { DrainLightBehaviour } from './CastBehaviours/DrainLightBehaviour';
import type { CastBehaviourSetupContext, CastBehaviourTickContext } from './castBehaviourTypes';
import type { AbilityEngineContext } from './AbilityEngineContext';
import { CELL_SIZE } from '../terrain/TerrainGrid';
import { devourLight, devourLightSource, findNearestLitLight } from './lightDrain';
import type { SpecialTile } from '../game/specialTiles/SpecialTile';
import type { LightSource } from '../game/lightSources/LightSource';
import type { Unit } from '../game/units/Unit';
import type { Effect } from '../game/effects/Effect';
import type { ResolvedTarget } from '../game/types';
import { LIGHT_STREAM_EFFECT_TYPE } from '../game/effects/lightStream';

const caster = { id: 'lily', teamId: 'enemy', x: 5 * CELL_SIZE, y: 5 * CELL_SIZE } as unknown as Unit;
const target = { type: 'pixel', position: { x: caster.x, y: caster.y } } as ResolvedTarget;

function tile(id: string, col: number, row: number, amount: number, lightType?: string): SpecialTile {
    return {
        id, col, row, hp: 5, maxHp: 5,
        emitsLight: { lightAmount: amount, radius: 4, ...(lightType ? { lightType } : {}) },
    } as unknown as SpecialTile;
}

function torch(id: string, x: number, y: number, amount: number): LightSource {
    return {
        id, x, y, active: true, lightAmount: amount, lightType: 'FireLight',
        decay: { initialLightAmount: amount },
    } as unknown as LightSource;
}

interface Harness {
    specialTiles: SpecialTile[];
    lightSources: LightSource[];
    effects: Effect[];
    payload: { current: unknown };
    engine: AbilityEngineContext;
}

function makeHarness(tiles: SpecialTile[], sources: LightSource[] = []): Harness {
    const h = { specialTiles: tiles, lightSources: sources, effects: [] as Effect[], payload: { current: undefined as unknown } };
    const engine = {
        specialTiles: tiles,
        lightSources: sources,
        addEffect: (e: Effect) => { h.effects.push(e); },
        damageSpecialTile: (id: string, amount: number) => {
            const t = tiles.find((x) => x.id === id);
            if (t) t.hp = Math.max(0, t.hp - amount);
            return true;
        },
    } as unknown as AbilityEngineContext;
    return { ...h, engine };
}

function baseCtx(h: Harness) {
    return {
        caster, abilityId: 'drink', target, allTargets: [target], castPayload: {},
        setBehaviourPayload: (d: unknown) => { h.payload.current = d; }, engine: h.engine,
    };
}

function lastTick(h: Harness): CastBehaviourTickContext {
    return {
        ...baseCtx(h), behaviourPayload: h.payload.current, windowProgress: 1, prevWindowProgress: 0.5,
        isFirstTick: false, isLastTick: true,
    };
}

function setup(b: DrainLightBehaviour, h: Harness): void {
    const ctx: CastBehaviourSetupContext = { ...baseCtx(h), behaviourPayload: undefined, windowSeconds: 0.8 };
    b.onSetup(ctx);
}

/** One whole cast: setup, a mid tick, then the last tick. */
function drinkOnce(b: DrainLightBehaviour, h: Harness): void {
    setup(b, h);
    b.onTick({
        ...baseCtx(h), behaviourPayload: h.payload.current, windowProgress: 0.5, prevWindowProgress: 0,
        isFirstTick: true, isLastTick: false,
    });
    b.onTick(lastTick(h));
}

const drink = () => CastBehaviours.DrainLight({ amount: 1, target: 'nearestLit' });

describe('lightDrain helpers', () => {
    it('devourLight reduces a strong tile and eliminates a weak one', () => {
        const h = makeHarness([tile('a', 1, 1, 5), tile('b', 2, 2, 1)]);
        expect(devourLight(h.engine as never, h.specialTiles[0], 1)).toBe('reduced');
        expect(h.specialTiles[0].emitsLight!.lightAmount).toBe(4);
        expect(devourLight(h.engine as never, h.specialTiles[1], 1)).toBe('eliminated');
        expect(h.specialTiles[1].hp).toBe(0);
    });

    it('devourLightSource lowers the decay baseline and puts out a weak source', () => {
        const strong = torch('s', 0, 0, 5);
        expect(devourLightSource(strong, 2)).toBe('reduced');
        expect(strong.lightAmount).toBe(3);
        expect(strong.decay.initialLightAmount).toBe(3);
        const weak = torch('w', 0, 0, 1);
        expect(devourLightSource(weak, 1)).toBe('eliminated');
        expect(weak.active).toBe(false);
    });

    it('findNearestLitLight skips dark light and respects range', () => {
        const h = makeHarness([tile('dark', 5, 5, 9, 'DarkLight'), tile('far', 15, 5, 9)]);
        expect(findNearestLitLight(h.engine as never, caster)?.tileId).toBe('far');
        expect(findNearestLitLight(h.engine as never, caster, 3 * CELL_SIZE)).toBeNull();
    });
});

describe('DrainLight behaviour', () => {
    it('drains 1 from the nearest lit light and streams it', () => {
        const h = makeHarness([tile('near', 6, 5, 5), tile('far', 15, 5, 5)]);
        drinkOnce(drink(), h);
        expect(h.specialTiles[0].emitsLight!.lightAmount).toBe(4);
        expect(h.specialTiles[1].emitsLight!.lightAmount).toBe(5);
        expect(h.effects).toHaveLength(1);
        expect(h.effects[0].effectType).toBe(LIGHT_STREAM_EFFECT_TYPE);
    });

    it('picks the next light once the nearest is out, and the light stays out', () => {
        const h = makeHarness([tile('near', 6, 5, 1), tile('far', 15, 5, 5)]);
        drinkOnce(drink(), h);
        expect(h.specialTiles[0].hp).toBe(0);
        drinkOnce(drink(), h);
        expect(h.specialTiles[0].hp).toBe(0);
        expect(h.specialTiles[1].emitsLight!.lightAmount).toBe(4);
    });

    it('drains a free light source when it is nearer than any tile', () => {
        const t = torch('t', caster.x + 20, caster.y, 3);
        const h = makeHarness([tile('far', 15, 5, 5)], [t]);
        drinkOnce(drink(), h);
        expect(t.lightAmount).toBe(2);
        expect(h.specialTiles[0].emitsLight!.lightAmount).toBe(5);
    });

    it('does nothing when no light is lit', () => {
        const h = makeHarness([tile('dark', 6, 5, 9, 'DarkLight')]);
        drinkOnce(drink(), h);
        expect(h.specialTiles[0].emitsLight!.lightAmount).toBe(9);
        expect(h.effects).toHaveLength(0);
    });

    it('falls back to the next light when the picked one was put out mid-window', () => {
        const h = makeHarness([tile('near', 6, 5, 3), tile('far', 15, 5, 5)]);
        const b = drink();
        setup(b, h);
        h.specialTiles[0].hp = 0; // another drinker finished it
        b.onTick(lastTick(h));
        expect(h.specialTiles[1].emitsLight!.lightAmount).toBe(4);
    });
});

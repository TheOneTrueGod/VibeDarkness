import { describe, expect, it } from 'vitest';
// Load the unit module first so buff modules resolve their imports in the app's normal order.
import '../units/Unit';
import { Effect } from './Effect';
import { EffectManager } from './EffectManager';
import { EffectEmitterManager } from './EffectEmitterManager';
import { ContinuousEmitter, IntervalEmitter } from './EffectEmitter';
import { resolveEffectPauseBehaviour } from './pauseBehaviour';
import { createEmitterFromDef } from '../../abilities/createEmitterFromDef';
import type { EngineContext } from '../EngineContext';
import { BuffRenderEmitterSystem } from './buffParticleAura';
import { GravityLocusFieldBuff } from '../../buffs/GravityLocusFieldBuff';
import type { Unit } from '../units/Unit';

const ctx = { worldPace: 1, timeManager: undefined } as unknown as EngineContext;
const engine = {
    worldPace: 1,
    terrainManager: null,
    getUnit: () => undefined,
} as unknown as EngineContext;

function fx(pauseBehaviour?: 'continue' | 'hold' | 'stop', timeDomain?: 'wall' | 'world'): Effect {
    return new Effect({ x: 0, y: 0, duration: 1, effectType: 'Pulse', pauseBehaviour, timeDomain });
}

describe('effect pauseBehaviour', () => {
    it('defaults: wall effects continue, world/owner effects hold', () => {
        expect(resolveEffectPauseBehaviour(fx())).toBe('continue');
        expect(resolveEffectPauseBehaviour(fx(undefined, 'world'))).toBe('hold');
        expect(resolveEffectPauseBehaviour(fx('stop', 'world'))).toBe('stop');
    });

    it('while halted: continue ages, hold freezes, stop is removed', () => {
        const mgr = new EffectManager(ctx);
        const cont = fx('continue');
        const hold = fx('hold');
        const stop = fx('stop');
        for (const e of [cont, hold, stop]) mgr.addEffect(e);
        mgr.renderUpdate(0.25, true);
        expect(cont.elapsed).toBeCloseTo(0.25);
        expect(hold.elapsed).toBe(0);
        expect(hold.active).toBe(true);
        expect(stop.active).toBe(false);
        // Not halted: every effect ages.
        mgr.renderUpdate(0.25, false);
        expect(hold.elapsed).toBeCloseTo(0.25);
    });
});

describe('emitter pauseBehaviour', () => {
    const makeInterval = (pauseBehaviour?: 'continue' | 'hold' | 'stop') =>
        new IntervalEmitter({
            x: 0, y: 0, lifetime: 1, intervalSeconds: 0.1, pauseBehaviour,
            factory: () => [fx()],
        });

    it('defaults to hold; emitWhilePaused maps to continue', () => {
        expect(makeInterval().pauseBehaviour).toBe('hold');
        const legacy = new ContinuousEmitter({ x: 0, y: 0, emitWhilePaused: true, factory: () => [] });
        expect(legacy.pauseBehaviour).toBe('continue');
    });

    it('continue interval emitters keep emitting while halted without touching serialized timers', () => {
        const mgr = new EffectEmitterManager();
        const em = makeInterval('continue');
        mgr.addEmitter(em);
        const before = JSON.stringify(em.toJSON());
        let produced = 0;
        for (let i = 0; i < 60; i++) produced += mgr.renderUpdate(1 / 60, new Map(), true, engine).length;
        expect(produced).toBeGreaterThanOrEqual(9);
        expect(em.active).toBe(true);
        // Lifetime (1 s) would have expired if halted emission advanced it.
        expect(JSON.stringify(em.toJSON())).toBe(before);
    });

    it('hold emitters emit nothing while halted; stop emitters deactivate', () => {
        const mgr = new EffectEmitterManager();
        const hold = makeInterval('hold');
        const stop = makeInterval('stop');
        mgr.addEmitter(hold);
        mgr.addEmitter(stop);
        expect(mgr.renderUpdate(1, new Map(), true, engine)).toHaveLength(0);
        expect(hold.active).toBe(true);
        expect(stop.active).toBe(false);
    });

    it('ability-timing emitters default to continue', () => {
        const interval = createEmitterFromDef(
            { mode: 'interval', intervalSeconds: 0.1, effectType: 'Pulse' },
            { x: 0, y: 0, lifetime: 1 },
        );
        expect(interval.pauseBehaviour).toBe('continue');
        const optOut = createEmitterFromDef(
            { mode: 'interval', intervalSeconds: 0.1, effectType: 'Pulse', pauseBehaviour: 'hold' },
            { x: 0, y: 0, lifetime: 1 },
        );
        expect(optOut.pauseBehaviour).toBe('hold');
    });
});

describe('buff renderEmit (Gravity Locus field)', () => {
    it('keeps emitting the field visual at a pause plane', () => {
        const buff = new GravityLocusFieldBuff({ x: 50, y: 60 }, 'push');
        const unit = { id: 'caster', x: 0, y: 0, radius: 20, active: true, buffs: [buff], movement: null, isAlive: () => true } as unknown as Unit;
        const out: Effect[] = [];
        const system = new BuffRenderEmitterSystem();
        for (let i = 0; i < 60; i++) system.update([unit], 1 / 60, (e) => out.push(e), { gameTime: 1, halted: true });
        const field = out.filter((e) => e.effectType === 'GravityField');
        expect(field.length).toBeGreaterThanOrEqual(55);
        expect(field.every((e) => e.x === 50 && e.y === 60 && e.pauseBehaviour === 'continue')).toBe(true);
    });
});

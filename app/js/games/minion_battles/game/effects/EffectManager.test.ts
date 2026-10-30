/**
 * Effect / emitter timeDomain tests: default 'wall' ignores pace; 'world' and 'owner' follow it.
 */
import { describe, it, expect } from 'vitest';
import { Effect } from './Effect';
import { EffectManager } from './EffectManager';
import { EffectEmitterManager } from './EffectEmitterManager';
import { ContinuousEmitter, IntervalEmitter } from './EffectEmitter';
import { TimeManager } from '../time/TimeManager';
import { FIXED_DT } from '../gameConstants';
import type { EngineContext } from '../EngineContext';
import type { LightSource } from '../lightSources/LightSource';

function makeCtx(worldPace: number): { ctx: EngineContext; tm: TimeManager; lights: LightSource[] } {
    const tm = new TimeManager();
    tm.worldPace = worldPace;
    const lights: LightSource[] = [];
    const ctx = {
        get worldPace() { return tm.worldPace; },
        timeManager: tm,
        getUnit: () => undefined,
        addLightSource: (l: LightSource) => { lights.push(l); },
    } as unknown as EngineContext;
    return { ctx, tm, lights };
}

/** Render frames (at FIXED_DT each) until the effect deactivates. */
function framesToExpire(mgr: EffectManager, effect: Effect, max = 1000): number {
    mgr.addEffect(effect);
    for (let i = 1; i <= max; i++) {
        mgr.renderUpdate(FIXED_DT);
        if (!effect.active) return i;
    }
    return -1;
}

describe('effect timeDomain', () => {
    it('default effects keep their lifetime at pace 0.5', () => {
        const { ctx } = makeCtx(0.5);
        const mgr = new EffectManager(ctx);
        const fx = new Effect({ x: 0, y: 0, duration: 0.49, effectType: 'impact' });
        expect(fx.timeDomain).toBeUndefined();
        expect(framesToExpire(mgr, fx)).toBe(30);
    });

    it('a world effect lasts twice as many frames at pace 0.5', () => {
        const { ctx } = makeCtx(0.5);
        const mgr = new EffectManager(ctx);
        const fx = new Effect({ x: 0, y: 0, duration: 0.5, effectType: 'impact', timeDomain: 'world' });
        expect(framesToExpire(mgr, fx)).toBe(60);
    });

    it('a world effect pauses during Time Stop (pace 0)', () => {
        const { ctx } = makeCtx(0);
        const mgr = new EffectManager(ctx);
        const fx = new Effect({ x: 0, y: 0, duration: 0.5, effectType: 'impact', timeDomain: 'world' });
        mgr.addEffect(fx);
        for (let i = 0; i < 100; i++) mgr.renderUpdate(FIXED_DT);
        expect(fx.active).toBe(true);
        expect(fx.elapsed).toBe(0);
    });

    it('an owner effect follows its owner tempo', () => {
        const { ctx } = makeCtx(1);
        const mgr = new EffectManager(ctx);
        mgr.ownerTempoResolver = (id) => (id === 'fast' ? 2 : 1);
        const fast = new Effect({ x: 0, y: 0, duration: 0.49, effectType: 'impact', timeDomain: 'owner', ownerActorId: 'fast' });
        const normal = new Effect({ x: 0, y: 0, duration: 0.49, effectType: 'impact', timeDomain: 'owner', ownerActorId: 'slow' });
        expect(framesToExpire(mgr, fast)).toBe(15);
        expect(framesToExpire(mgr, normal)).toBe(30);
    });

    it('an owner effect follows world pace through getStepRate', () => {
        const { ctx } = makeCtx(0.5);
        const mgr = new EffectManager(ctx);
        const fx = new Effect({ x: 0, y: 0, duration: 0.49, effectType: 'impact', timeDomain: 'owner', ownerActorId: 'u1' });
        expect(framesToExpire(mgr, fx)).toBe(59);
    });

    it('a followOwner effect stays on its owner', () => {
        const owner = { id: 'caster', x: 10, y: 20 };
        const { ctx } = makeCtx(1);
        const following = {
            ...ctx,
            getUnit: (id: string) => (id === owner.id ? owner : undefined),
        } as EngineContext;
        const mgr = new EffectManager(following);
        const fx = new Effect({
            x: 0,
            y: 0,
            duration: 1,
            effectType: 'ConjureSword',
            ownerActorId: owner.id,
            effectData: { followOwner: true },
        });
        mgr.addEffect(fx);
        mgr.renderUpdate(FIXED_DT);
        expect(fx.x).toBe(owner.x);
        expect(fx.y).toBe(owner.y);
        owner.x = 40;
        mgr.renderUpdate(FIXED_DT);
        expect(fx.x).toBe(40);
    });

    it('TorchProjectile completion uses ticks by default and scales for world domain', () => {
        for (const [domain, expected] of [[undefined, 30], ['world', 60]] as const) {
            const { ctx, lights } = makeCtx(0.5);
            const mgr = new EffectManager(ctx);
            const fx = new Effect({ x: 1, y: 2, duration: 0.5, effectType: 'TorchProjectile', timeDomain: domain });
            mgr.addEffect(fx);
            let ticks = 0;
            while (fx.active && ticks < 200) { mgr.gameUpdate(FIXED_DT); ticks++; }
            expect(ticks).toBe(expected);
            expect(lights).toHaveLength(1);
        }
    });
});

describe('emitter timeDomain', () => {
    function intervalFires(domain: 'wall' | 'world', pace: number, ticks: number): number {
        const { ctx } = makeCtx(pace);
        const mgr = new EffectEmitterManager();
        let fires = 0;
        mgr.addEmitter(new IntervalEmitter({
            x: 0, y: 0, intervalSeconds: 0.105, timeDomain: domain,
            factory: () => { fires++; return []; },
        }));
        for (let i = 0; i < ticks; i++) mgr.update(FIXED_DT, ctx);
        return fires;
    }

    it('interval cadence is unchanged by default and slows in the world domain', () => {
        expect(intervalFires('wall', 0.5, 60)).toBe(9);
        expect(intervalFires('world', 0.5, 60)).toBe(4);
    });

    it('world-domain emitter lifetime stretches with pace', () => {
        const { ctx } = makeCtx(0.5);
        const mgr = new EffectEmitterManager();
        const em = new IntervalEmitter({ x: 0, y: 0, intervalSeconds: 1, lifetime: 0.5, timeDomain: 'world', factory: () => [] });
        mgr.addEmitter(em);
        let ticks = 0;
        while (em.active && ticks < 500) { mgr.update(FIXED_DT, ctx); ticks++; }
        expect(ticks).toBe(60);
    });

    it('continuous emitter frame cadence scales with the time domain', () => {
        function emits(domain: 'wall' | 'world'): number {
            const { ctx } = makeCtx(0.5);
            const mgr = new EffectEmitterManager();
            let n = 0;
            mgr.addEmitter(new ContinuousEmitter({
                x: 0, y: 0, emitIntervalFrames: 2, timeDomain: domain,
                factory: () => { n++; return []; },
            }));
            for (let i = 0; i < 40; i++) mgr.renderUpdate(FIXED_DT, new Map(), false, ctx);
            return n;
        }
        expect(emits('wall')).toBe(20);
        expect(emits('world')).toBe(10);
    });

    it('owner emitter resolves its owner from attachedToUnitId and the tempo hook', () => {
        const { ctx } = makeCtx(1);
        const mgr = new EffectEmitterManager();
        mgr.ownerTempoResolver = (id) => (id === 'u1' ? 2 : 1);
        let fires = 0;
        mgr.addEmitter(new IntervalEmitter({
            x: 0, y: 0, intervalSeconds: 0.105, timeDomain: 'owner', attachedToUnitId: 'u1',
            factory: () => { fires++; return []; },
        }));
        for (let i = 0; i < 60; i++) mgr.update(FIXED_DT, ctx);
        expect(fires).toBe(19);
    });

    it('serializes timeDomain only when non-default', () => {
        const wall = new IntervalEmitter({ x: 0, y: 0, intervalSeconds: 1, factory: () => [] });
        expect(wall.toJSON()).not.toHaveProperty('timeDomain');
        const world = new IntervalEmitter({ x: 0, y: 0, intervalSeconds: 1, timeDomain: 'world', factory: () => [] });
        expect(world.toJSON()).toMatchObject({ timeDomain: 'world' });
    });
});

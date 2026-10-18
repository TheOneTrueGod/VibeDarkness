/**
 * EffectEmitterManager — owns the list of active EffectEmitters and drives their lifecycle.
 *
 * Game tick (update): runs all emitters unconditionally; collects returned Effects.
 * Render tick (renderUpdate): runs continuous/emitWhilePaused emitters during pause;
 *   runs all active emitters when not paused.
 */

import type { Effect } from './Effect';
import type { EffectEmitter, Vec2 } from './EffectEmitter';
import type { EngineContext } from '../EngineContext';
import { resolveTimeDomainRate, type OwnerTempoResolver } from './timeDomain';

export class EffectEmitterManager {
    emitters: EffectEmitter[] = [];
    /** Hook: per-actor tempo for 'owner' time-domain emitters (default tempo 1). */
    ownerTempoResolver?: OwnerTempoResolver;

    /** Sets emitter.timeRate and returns it; exactly 1 for the default 'wall' domain. */
    private applyRate(emitter: EffectEmitter, engine: EngineContext | undefined): number {
        if (!engine || emitter.timeDomain === 'wall') { emitter.timeRate = 1; return 1; }
        const rate = resolveTimeDomainRate(
            emitter.timeDomain, emitter.ownerActorId ?? emitter.attachedToUnitId, engine, this.ownerTempoResolver,
        );
        emitter.timeRate = rate;
        return rate;
    }

    addEmitter(emitter: EffectEmitter): void {
        this.emitters.push(emitter);
    }

    /**
     * Game tick — ticks all active emitters and returns the Effects they produced.
     * Caller is responsible for adding these to EffectManager.
     */
    update(dt: number, engine: EngineContext): Effect[] {
        const newEffects: Effect[] = [];
        for (const emitter of this.emitters) {
            if (!emitter.active) continue;
            const rate = this.applyRate(emitter, engine);
            newEffects.push(...emitter.update(rate === 1 ? dt : dt * rate, engine));
        }
        this.cleanupInactive();
        return newEffects;
    }

    /**
     * Render tick — ticks continuous emitters (respecting emitWhilePaused during pause).
     * Returns Effects produced; caller adds them to EffectManager.
     */
    renderUpdate(realDt: number, posSnapshot: Map<string, Vec2>, isPaused: boolean, engine?: EngineContext): Effect[] {
        const newEffects: Effect[] = [];
        for (const emitter of this.emitters) {
            if (!emitter.active) continue;
            if (isPaused && !emitter.emitWhilePaused) continue;
            const rate = this.applyRate(emitter, engine);
            newEffects.push(...emitter.renderUpdate(rate === 1 ? realDt : realDt * rate, posSnapshot));
        }
        return newEffects;
    }

    cleanupInactive(): void {
        this.emitters = this.emitters.filter((e) => e.active);
    }

    toJSON(): Record<string, unknown>[] {
        return this.emitters.map((e) => e.toJSON());
    }

    restoreFromJSON(_data: Record<string, unknown>[]): void {
        // Emitters with runtime-only factories (OneShotEmitter, IntervalEmitter, ContinuousEmitter)
        // are intentionally not restored — they are short-lived and acceptable to lose on reconnect.
        this.emitters = [];
    }
}

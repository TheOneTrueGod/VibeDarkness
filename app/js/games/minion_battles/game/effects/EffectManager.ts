/**
 * EffectManager - Owns the effect list. Handles per-tick updates and cleanup.
 */

import { Effect } from '../effects/Effect';
import type { EngineContext } from '../EngineContext';
import { LightSource } from '../lightSources/LightSource';
import type { TeamId } from '../teams';
import { FIXED_DT } from '../gameConstants';
import { resolveTimeDomainRate, type OwnerTempoResolver } from './timeDomain';
import { resolveEffectPauseBehaviour } from './pauseBehaviour';

export class EffectManager {
    effects: Effect[] = [];
    private ctx: EngineContext;
    /** Hook: per-actor tempo for 'owner' time-domain effects (default tempo 1). */
    ownerTempoResolver?: OwnerTempoResolver;

    constructor(ctx: EngineContext) {
        this.ctx = ctx;
    }

    addEffect(effect: Effect): void {
        this.effects.push(effect);
    }

    /** Elapsed-time multiplier for an effect this step; exactly 1 for the default 'wall' domain. */
    private rateFor(effect: Effect): number {
        if (effect.timeDomain === undefined) return 1;
        const ownerId = effect.ownerActorId ?? (effect.effectData.ownerUnitId as string | undefined);
        return resolveTimeDomainRate(effect.timeDomain, ownerId, this.ctx, this.ownerTempoResolver);
    }

    /**
     * Called in fixedUpdate — advances TorchProjectile lifetime by game ticks and converts to a
     * LightSource once the tick count reaches the effect's duration (deterministic fixed-tick timing).
     */
    gameUpdate(_dt: number): void {
        for (const effect of this.effects) {
            if (!effect.active || effect.effectType !== 'TorchProjectile') continue;
            const data = effect.effectData as {
                ticksAlive?: number;
                roundCreated?: number;
                initialLightAmount?: number;
                initialRadius?: number;
                roundsTotal?: number;
                ownerUnitId?: string;
                ownerAbilityId?: string;
                teamId?: TeamId;
            };
            // 'wall' (default) adds exactly 1 per tick; 'world'/'owner' add the domain's step rate.
            data.ticksAlive = (data.ticksAlive ?? 0) + this.rateFor(effect);
            if (data.ticksAlive < Math.round(effect.duration / FIXED_DT)) continue;
            data.ticksAlive = undefined;
            effect.active = false;
            this.ctx.addLightSource(new LightSource({
                x: effect.x,
                y: effect.y,
                lightAmount: data.initialLightAmount ?? 10,
                radius: data.initialRadius ?? 5,
                // Owned only when the effect's creator recorded an owner in effectData; otherwise ownerless.
                ownerUnitId: data.ownerUnitId,
                ownerAbilityId: data.ownerAbilityId,
                teamId: data.teamId,
                decay: {
                    roundCreated: data.roundCreated ?? 1,
                    initialLightAmount: data.initialLightAmount ?? 10,
                    initialRadius: data.initialRadius ?? 5,
                    roundsTotal: data.roundsTotal ?? 3,
                },
            }));
        }
    }

    /**
     * Called every render frame — advances purely visual effects. While `halted` (pause plane), each effect
     * follows its pause behaviour: 'continue' ages as normal, 'hold' freezes, 'stop' is removed.
     */
    renderUpdate(realDt: number, halted = false): void {
        for (const effect of this.effects) {
            if (!effect.active) continue;
            if (halted) {
                const behaviour = resolveEffectPauseBehaviour(effect);
                if (behaviour === 'hold') continue;
                if (behaviour === 'stop') { effect.active = false; continue; }
            }
            const rate = this.rateFor(effect);
            effect.renderUpdate(rate === 1 ? realDt : realDt * rate);
        }
    }

    cleanupInactive(): void {
        this.effects = this.effects.filter((e) => e.active);
    }
}

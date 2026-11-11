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
import { updateCastBound } from './castBound';

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
     *
     * Finished effects are dropped here too, not only by the tick's {@link cleanupInactive}: no game tick runs
     * while halted, but 'continue' emitters and auras keep spawning effects, so a long pause would otherwise
     * pile up finished effects (and their renderer visuals) without bound. Effects are render-only and not
     * serialized or fingerprinted, so dropping them on a render frame cannot affect the simulation.
     */
    renderUpdate(realDt: number, halted = false): void {
        let sawInactive = false;
        for (const effect of this.effects) {
            if (!effect.active) { sawInactive = true; continue; }
            followOwner(this.ctx, effect);
            // A cast-bound effect whose cast was cut fades on wall time and does not age normally.
            if (updateCastBound(effect, realDt, (id) => this.ctx.getUnit(id))) {
                if (!effect.active) sawInactive = true;
                continue;
            }
            if (halted) {
                const behaviour = resolveEffectPauseBehaviour(effect);
                if (behaviour === 'hold') continue;
                if (behaviour === 'stop') { effect.active = false; sawInactive = true; continue; }
            }
            const rate = this.rateFor(effect);
            const step = rate === 1 ? realDt : realDt * rate;
            effect.renderUpdate(step);
            if (!effect.active) sawInactive = true;
        }
        if (sawInactive) this.cleanupInactive();
    }

    /** Drop finished effects, in place (no allocation when the list is already clean). */
    cleanupInactive(): void {
        const list = this.effects;
        let write = 0;
        for (let read = 0; read < list.length; read++) {
            const effect = list[read]!;
            if (effect.active) list[write++] = effect;
        }
        list.length = write;
    }
}

/** Visuals marked followOwner stay on their owner while that unit walks. */
function followOwner(ctx: EngineContext, effect: Effect): void {
    if (effect.effectData.followOwner !== true) return;
    const ownerId = effect.ownerActorId;
    if (!ownerId) return;
    const unit = ctx.getUnit(ownerId);
    if (!unit) return;
    effect.x = unit.x;
    effect.y = unit.y;
}

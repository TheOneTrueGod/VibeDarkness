/**
 * EffectManager - Owns the effect list. Handles per-tick updates and cleanup.
 */

import { Effect } from '../effects/Effect';
import type { EngineContext } from '../EngineContext';
import { LightSource } from '../lightSources/LightSource';

export class EffectManager {
    effects: Effect[] = [];
    private ctx: EngineContext;

    constructor(ctx: EngineContext) {
        this.ctx = ctx;
    }

    addEffect(effect: Effect): void {
        this.effects.push(effect);
    }

    /**
     * Called in fixedUpdate — processes effects that need engine context (TorchProjectile landings).
     * The `landingPending` flag is set by `renderUpdate` when a TorchProjectile travel completes;
     * this method converts the flag into a persisted LightSource on the game tick.
     */
    gameUpdate(_dt: number): void {
        for (const effect of this.effects) {
            if (!effect.active || effect.effectType !== 'TorchProjectile') continue;
            const data = effect.effectData as {
                landingPending?: boolean;
                roundCreated?: number;
                initialLightAmount?: number;
                initialRadius?: number;
                roundsTotal?: number;
            };
            if (!data.landingPending) continue;
            data.landingPending = false;
            effect.active = false;
            this.ctx.addLightSource(new LightSource({
                x: effect.x,
                y: effect.y,
                lightAmount: data.initialLightAmount ?? 10,
                radius: data.initialRadius ?? 5,
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
     * Called every render frame — advances purely visual effects.
     */
    renderUpdate(realDt: number): void {
        for (const effect of this.effects) {
            if (!effect.active) continue;
            effect.renderUpdate(realDt);
        }
    }

    cleanupInactive(): void {
        this.effects = this.effects.filter((e) => e.active);
    }
}

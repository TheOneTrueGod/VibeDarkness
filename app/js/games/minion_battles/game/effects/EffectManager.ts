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
            };
            data.ticksAlive = (data.ticksAlive ?? 0) + 1;
            // FIXED_DT = 1/60, so completion = duration * 60 ticks
            if (data.ticksAlive < Math.round(effect.duration * 60)) continue;
            data.ticksAlive = undefined;
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

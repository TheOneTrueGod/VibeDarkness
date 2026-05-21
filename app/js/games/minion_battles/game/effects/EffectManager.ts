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
     * Called every render frame — advances purely visual (non-game-driven) effects.
     * Game-driven effects (isGameDriven() === true) are skipped here; they advance in gameUpdate().
     */
    renderUpdate(realDt: number): void {
        for (const effect of this.effects) {
            if (!effect.active || effect.isGameDriven()) continue;
            effect.renderUpdate(realDt);
        }
    }

    /**
     * Called in fixedUpdate — runs game-driven effects that need engine context.
     * Purely visual effects are skipped here; they advance in renderUpdate().
     */
    gameUpdate(dt: number): void {
        // Process TorchProjectile landings: renderUpdate marks landingPending when travel completes.
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

        for (const effect of this.effects) {
            if (!effect.active || !effect.isGameDriven()) continue;
            effect.update(dt, this.ctx);
        }
    }

    /** @deprecated Use gameUpdate() from fixedUpdate and renderUpdate() from the render loop. */
    update(dt: number): void {
        this.gameUpdate(dt);
    }

    cleanupInactive(): void {
        this.effects = this.effects.filter((e) => e.active);
    }

    toJSON(): Record<string, unknown>[] {
        return this.effects.map((e) => e.toJSON());
    }

    restoreFromJSON(fxDataArray: Record<string, unknown>[]): void {
        this.effects = [];
        for (const fxData of fxDataArray) {
            this.effects.push(Effect.fromJSON(fxData));
        }
    }
}

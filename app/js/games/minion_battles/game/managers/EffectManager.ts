/**
 * EffectManager - Owns the effect list. Handles per-tick updates,
 * torch decay (both interval-based and round-based), light source
 * generation from Torch effects, and cleanup.
 */

import { Effect } from '../../objects/Effect';
import type { EngineContext } from '../EngineContext';
import type { LightSource } from '../LightGrid';

const ROUND_DURATION = 10;

export class EffectManager {
    effects: Effect[] = [];
    private ctx: EngineContext;

    constructor(ctx: EngineContext) {
        this.ctx = ctx;
    }

    addEffect(effect: Effect): void {
        this.effects.push(effect);
    }

    update(dt: number): void {
        for (const effect of this.effects) {
            if (!effect.active) continue;
            effect.update(dt, this.ctx);
        }
    }

    /** Decay Torch effects that have decayRate/decayInterval (e.g. charged crystal light). */
    processTorchEffectDecays(): void {
        const totalRoundsElapsed = this.ctx.gameTime / ROUND_DURATION;
        const eps = 1e-9;

        for (const effect of this.effects) {
            if (!effect.active || effect.effectType !== 'Torch') continue;
            const data = effect.effectData as {
                lightAmount?: number;
                radius?: number;
                decayRate?: number;
                decayInterval?: number;
                lightDecayNextAtRound?: number;
            };
            const decayRate = data.decayRate;
            const decayInterval = data.decayInterval;
            if (decayRate == null || decayInterval == null || decayRate <= 0 || decayInterval <= 0) continue;
            if ((data.lightAmount ?? 0) <= 0) {
                effect.active = false;
                continue;
            }

            if (data.lightDecayNextAtRound == null || !Number.isFinite(data.lightDecayNextAtRound)) {
                data.lightDecayNextAtRound = totalRoundsElapsed + decayInterval;
            }

            while (totalRoundsElapsed + eps >= data.lightDecayNextAtRound) {
                data.lightAmount = Math.max(0, (data.lightAmount ?? 0) - decayRate);
                data.lightDecayNextAtRound += decayInterval;

                if ((data.lightAmount ?? 0) <= 0) {
                    effect.active = false;
                    break;
                }
            }
        }
    }

    /** Round-end torch decay: simple round-counter-based light/radius reduction. */
    handleRoundEndTorchDecay(roundNumber: number): void {
        for (const effect of this.effects) {
            if (!effect.active || effect.effectType !== 'Torch') continue;
            const data = effect.effectData as {
                roundCreated?: number;
                initialLightAmount?: number;
                initialRadius?: number;
                lightAmount?: number;
                radius?: number;
                roundsTotal?: number;
                decayRate?: number;
                decayInterval?: number;
            };
            if (data.decayRate != null && data.decayInterval != null) continue;
            const roundCreated = data.roundCreated ?? roundNumber;
            const initialLight = data.initialLightAmount ?? 15;
            const initialRadius = data.initialRadius ?? 5;
            const roundsTotal = data.roundsTotal ?? 5;
            const roundsLived = roundNumber - roundCreated;
            if (roundsLived >= roundsTotal) {
                effect.active = false;
                continue;
            }
            data.lightAmount = Math.max(0, initialLight - 2 * roundsLived);
            data.radius = Math.max(0, initialRadius - roundsLived);
        }
    }

    /** Build light sources from Torch effects for darkness / light grid computation. */
    buildLightSourcesFromEffects(): LightSource[] {
        const grid = this.ctx.terrainManager?.grid;
        if (!grid) return [];
        const sources: LightSource[] = [];
        for (const effect of this.effects) {
            if (!effect.active || effect.effectType !== 'Torch') continue;
            const data = effect.effectData as { lightAmount?: number; radius?: number };
            const emission = data.lightAmount ?? 0;
            const radius = data.radius ?? 0;
            if (emission <= 0 || radius <= 0) continue;
            const { col, row } = grid.worldToGrid(effect.x, effect.y);
            sources.push({ col, row, emission, radius });
        }
        return sources;
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

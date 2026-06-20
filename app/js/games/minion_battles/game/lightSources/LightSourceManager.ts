/**
 * LightSourceManager — Owns all persistent in-game light sources (thrown torches, etc.).
 *
 * Handles per-tick position tracking (follow-unit), interval decay, round-end decay,
 * and builds the LightGrid input array for the darkness overlay.
 */

import type { EngineContext } from '../EngineContext';
import type { LightSource as GridLightInput } from '../LightGrid';
import { LightSource } from './LightSource';

const ROUND_DURATION = 10;

export class LightSourceManager {
    lightSources: LightSource[] = [];
    private ctx: EngineContext;

    constructor(ctx: EngineContext) {
        this.ctx = ctx;
    }

    addLightSource(ls: LightSource): LightSource {
        this.lightSources.push(ls);
        return ls;
    }

    /** Update follow-unit positions each game tick. */
    update(_dt: number): void {
        for (const ls of this.lightSources) {
            if (!ls.active || !ls.followUnitId) continue;
            const u = this.ctx.getUnit(ls.followUnitId);
            if (u?.isAlive()) {
                ls.x = u.x;
                ls.y = u.y;
            }
        }
    }

    /** Interval-based decay (e.g. charged crystal light). Called once per fixed update. */
    processDecays(): void {
        const totalRoundsElapsed = this.ctx.gameTime / ROUND_DURATION;
        const eps = 1e-9;

        for (const ls of this.lightSources) {
            if (!ls.active) continue;
            const { decayRate, decayInterval } = ls.decay;
            if (decayRate == null || decayInterval == null || decayRate <= 0 || decayInterval <= 0) continue;
            if (ls.lightAmount <= 0) {
                ls.active = false;
                continue;
            }

            if (ls.decay.lightDecayNextAtRound == null || !Number.isFinite(ls.decay.lightDecayNextAtRound)) {
                ls.decay.lightDecayNextAtRound = totalRoundsElapsed + decayInterval;
            }

            while (totalRoundsElapsed + eps >= ls.decay.lightDecayNextAtRound) {
                ls.lightAmount = Math.max(0, ls.lightAmount - decayRate);
                ls.decay.lightDecayNextAtRound += decayInterval;
                if (ls.lightAmount <= 0) {
                    ls.active = false;
                    break;
                }
            }
        }
    }

    /** Round-end decay: linear reduction based on rounds survived. */
    handleRoundEnd(roundNumber: number): void {
        for (const ls of this.lightSources) {
            if (!ls.active) continue;
            const d = ls.decay;
            if (d.decayRate != null && d.decayInterval != null) continue;
            const roundsLived = roundNumber - d.roundCreated;
            if (roundsLived >= d.roundsTotal) {
                ls.active = false;
                continue;
            }
            if (!d.noDecay) {
                const sign = Math.sign(d.initialLightAmount);
                ls.lightAmount = sign * Math.max(0, Math.abs(d.initialLightAmount) - 2 * roundsLived);
                ls.radius = Math.max(0, d.initialRadius - roundsLived);
            }
        }
    }

    /** Build the grid computation inputs for the darkness overlay. */
    buildGridLightInputs(): GridLightInput[] {
        const grid = this.ctx.terrainManager?.grid;
        if (!grid) return [];
        const inputs: GridLightInput[] = [];
        for (const ls of this.lightSources) {
            if (!ls.active || ls.lightAmount === 0 || ls.radius <= 0) continue;
            const { col, row } = grid.worldToGrid(ls.x, ls.y);
            inputs.push({ col, row, emission: ls.lightAmount, radius: ls.radius, overlapMethod: ls.overlapMethod });
        }
        return inputs;
    }

    cleanupInactive(): void {
        this.lightSources = this.lightSources.filter((ls) => ls.active);
    }

    toJSON(): Record<string, unknown>[] {
        return this.lightSources.map((ls) => ls.toJSON());
    }

    restoreFromJSON(data: Record<string, unknown>[]): void {
        this.lightSources = data.map((d) => LightSource.fromJSON(d));
    }
}

/**
 * Stone Tomb (0530) visual effects. Deterministic geometry only (no Math.random), so preview and
 * committed runs spawn the same effects.
 */

import { Effect } from '../../../game/effects/Effect';
import type { CastBehaviour, CastBehaviourTickContext } from '../../../abilities/castBehaviourTypes';
import { tileCentre, type TileCoord } from '../../../abilities/tileAreaHelpers';
import { CELL_SIZE } from '../../../terrain/TerrainGrid';

/** Rumble bursts per second on each marked tile during the windup. */
const RUMBLE_BURSTS_PER_SECOND = 12;
/** Chips per tile per burst. */
const RUMBLE_CHIPS_PER_BURST = 2;
const RUMBLE_CHIP_LIFETIME = 0.35;

/** Deterministic pseudo-random in [0, 1) from integer inputs (stable across runs and clients). */
function hash01(a: number, b: number, c: number): number {
    let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
}

/** Small rock chips hopping up off each tile, like ground shaking loose. */
function spawnRumbleBurst(engine: { addEffect(effect: Effect): void }, tiles: readonly TileCoord[], burst: number): void {
    for (let t = 0; t < tiles.length; t++) {
        const tile = tiles[t]!;
        const c = tileCentre(tile);
        for (let i = 0; i < RUMBLE_CHIPS_PER_BURST; i++) {
            const rx = hash01(burst, t, i * 2);
            const ry = hash01(burst, t, i * 2 + 1);
            const rv = hash01(t, burst, i);
            engine.addEffect(new Effect({
                x: c.x + (rx - 0.5) * CELL_SIZE * 0.8,
                y: c.y + (ry - 0.5) * CELL_SIZE * 0.8,
                duration: RUMBLE_CHIP_LIFETIME,
                effectType: 'RockChipParticle',
                effectData: {
                    imageKey: 'rockChip',
                    vx: (rv - 0.5) * 30,
                    vy: -(35 + rv * 35),
                    ay: 220,
                    dampingK: 2,
                    scale: 0.35 + rx * 0.25,
                },
            }));
        }
    }
}

/**
 * Sustained windup behaviour: emits rumble bursts on `tilesOf(ctx)` at a fixed rate over its window.
 * `windowSeconds` is the window's length, used to turn window progress into burst indices.
 */
export function stoneTombRumble(
    windowSeconds: number,
    tilesOf: (ctx: CastBehaviourTickContext) => TileCoord[],
): CastBehaviour {
    const bursts = Math.max(1, Math.round(windowSeconds * RUMBLE_BURSTS_PER_SECOND));
    return {
        onTick(ctx: CastBehaviourTickContext): void {
            // Emit every burst index crossed this tick: (prev, cur] in burst units, plus burst 0 on entry.
            const from = ctx.isFirstTick ? -1 : Math.floor(ctx.prevWindowProgress * bursts);
            const to = Math.min(bursts - 1, Math.floor(ctx.windowProgress * bursts));
            if (to <= from) return;
            const tiles = tilesOf(ctx);
            if (tiles.length === 0) return;
            for (let burst = from + 1; burst <= to; burst++) spawnRumbleBurst(ctx.engine, tiles, burst);
        },
    };
}

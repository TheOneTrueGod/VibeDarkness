/**
 * Pure maths for the terrain-siphon visual (`renderers/TerrainSiphonRenderer.ts`): how far a drawn-on tile
 * has drained, and where each droplet in the stream from a tile to its unit sits at a moment in time.
 * Render-only; never reads or writes engine state.
 */

/** Seconds for one droplet to travel from its tile to the unit. */
export const SIPHON_DROPLET_TRAVEL_SEC = 0.9;
/** Droplets in flight per drawn-on tile at once. */
export const SIPHON_DROPLETS_PER_TILE = 3;
/** Seconds for one ripple to spread across a drawn-on tile. */
export const SIPHON_RIPPLE_SEC = 1.4;

/** Share (0-1) of a tile's current water level already drawn off. A tile without water health is untouched. */
export function siphonDrainedFraction(destructible: { health: number; maxHealth: number } | undefined): number {
    if (!destructible || !(destructible.maxHealth > 0)) return 0;
    return Math.min(1, Math.max(0, 1 - destructible.health / destructible.maxHealth));
}

/** Small stable hash of a tile, so neighbouring tiles' streams are out of step. */
export function siphonTileSeed(col: number, row: number): number {
    const h = Math.imul(col * 73856093 ^ row * 19349663, 0x9e3779b1) >>> 0;
    return (h % 1000) / 1000;
}

export interface SiphonDropletPose {
    x: number;
    y: number;
    /** 0-1: fades in leaving the tile and out reaching the unit. */
    alpha: number;
    /** Size scale: full at the tile, shrinking as it is drawn in. */
    scale: number;
}

/**
 * Droplet `index` of a stream from (fromX, fromY) to (toX, toY) at wall time `timeSec`. Droplets are spaced
 * evenly through the travel time and offset by `seed`. Each one speeds up as it is pulled in and bows
 * slightly sideways, so the stream reads as being drawn toward the unit rather than sliding.
 */
export function siphonDropletPose(
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    timeSec: number,
    index: number,
    seed: number,
): SiphonDropletPose {
    const raw = timeSec / SIPHON_DROPLET_TRAVEL_SEC + index / SIPHON_DROPLETS_PER_TILE + seed;
    const p = raw - Math.floor(raw);
    const t = p * p; // ease-in: pulled harder the closer it gets
    const dx = toX - fromX;
    const dy = toY - fromY;
    const len = Math.hypot(dx, dy) || 1;
    const bow = Math.sin(p * Math.PI) * 6 * (index % 2 === 0 ? 1 : -1);
    return {
        x: fromX + dx * t + (-dy / len) * bow,
        y: fromY + dy * t + (dx / len) * bow,
        alpha: Math.min(1, p / 0.15) * Math.min(1, (1 - p) / 0.2),
        scale: 1 - 0.45 * t,
    };
}

/** Ripple ring on a drawn-on tile at wall time `timeSec`: radius scale 0.3-1.3 and fading alpha. */
export function siphonRipple(timeSec: number, seed: number): { radiusScale: number; alpha: number } {
    const raw = timeSec / SIPHON_RIPPLE_SEC + seed;
    const p = raw - Math.floor(raw);
    return { radiusScale: 0.3 + p, alpha: 0.6 * (1 - p) };
}

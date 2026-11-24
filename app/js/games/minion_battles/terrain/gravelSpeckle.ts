/**
 * Gravel speckle: the stone chips drawn over every Gravel cell (`hardEdgePattern: 'speckle'`), so painted
 * castle gravel and gravel left by Earth Core casts look the same. Pure data and hashing; the canvas
 * drawing lives in `HardEdgeLayerRenderer`.
 *
 * Breaking up the tile grid: there are `GRAVEL_VARIANT_COUNT` hand-seeded chip layouts, each cell picks one
 * by hashing its world (col, row) and may mirror it on either axis (so 4x the visible layouts), and each
 * cell gets a faint light or dark tint so patches of gravel drift in tone. Chips stay inside their cell, so
 * a layout never has to match its neighbour at the seam.
 */

/** Chip colours: light stone, pale stone, dark stone, mid stone. Index into `GravelChip.color`. */
export const GRAVEL_CHIP_COLORS: readonly string[] = ['#cfc4aa', '#e0d8c2', '#6f6450', '#b3a687'];

/** Number of distinct chip layouts. */
export const GRAVEL_VARIANT_COUNT = 8;
/** Chips per layout (on a 40px cell; the renderer scales radius, not count). */
const CHIPS_PER_VARIANT = 10;
/** Fraction of chips drawn as angular shards; the rest are round pebbles. */
const SHARD_FRACTION = 0.65;
/** Largest cell tint alpha (light tint above, dark tint below). */
export const GRAVEL_MAX_TINT_ALPHA = 0.03;

export interface GravelChip {
    /** Centre in the cell, 0..1 on each axis (kept off the very edge). */
    x: number;
    y: number;
    /** Radius as a fraction of the cell size. */
    r: number;
    /** Index into `GRAVEL_CHIP_COLORS`. */
    color: number;
    alpha: number;
    /** Five unit-ish offsets (angle jitter, radius jitter) for an angular shard; null for a round pebble. */
    shard: ReadonlyArray<{ dx: number; dy: number }> | null;
}

/** How one cell uses the layouts. */
export interface GravelCellLook {
    variant: number;
    flipX: boolean;
    flipY: boolean;
    /** -1..1: negative darkens the cell, positive lightens it. Scale by `GRAVEL_MAX_TINT_ALPHA`. */
    tint: number;
}

function seededRng(seed: number): () => number {
    let s = seed >>> 0;
    return () => {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        return s / 4294967296;
    };
}

function buildVariant(seed: number): GravelChip[] {
    const rand = seededRng(seed);
    const chips: GravelChip[] = [];
    for (let i = 0; i < CHIPS_PER_VARIANT; i++) {
        const isShard = rand() < SHARD_FRACTION;
        const base = 0.03 + rand() * 0.045;
        const startAngle = rand() * Math.PI * 2;
        const shard = isShard
            ? Array.from({ length: 5 }, (_, k) => {
                  const angle = startAngle + k * ((Math.PI * 2) / 5) + (rand() - 0.5) * 0.5;
                  const radius = 0.7 + rand() * 0.5;
                  return { dx: Math.cos(angle) * radius, dy: Math.sin(angle) * radius };
              })
            : null;
        chips.push({
            x: 0.08 + rand() * 0.84,
            y: 0.08 + rand() * 0.84,
            r: base,
            color: Math.floor(rand() * GRAVEL_CHIP_COLORS.length),
            alpha: 0.55 + rand() * 0.4,
            shard,
        });
    }
    return chips;
}

/** The chip layouts, built once. */
export const GRAVEL_VARIANTS: ReadonlyArray<readonly GravelChip[]> = Array.from(
    { length: GRAVEL_VARIANT_COUNT },
    (_, i) => buildVariant(1013 + i * 7919),
);

/** Integer hash of a world cell, well mixed so neighbouring cells do not pick related layouts. */
export function hashCell(col: number, row: number, salt = 0): number {
    let h = Math.imul(col | 0, 0x27d4eb2d) ^ Math.imul(row | 0, 0x165667b1) ^ Math.imul(salt | 0, 0x9e3779b1);
    h ^= h >>> 15;
    h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
    return h >>> 0;
}

/** Which layout, mirroring and tint the gravel cell at world (col, row) uses. Deterministic. */
export function gravelCellLook(col: number, row: number): GravelCellLook {
    const h = hashCell(col, row);
    const tintHash = hashCell(col, row, 1);
    return {
        variant: h % GRAVEL_VARIANT_COUNT,
        flipX: ((h >>> 8) & 1) === 1,
        flipY: ((h >>> 9) & 1) === 1,
        tint: (tintHash % 2001) / 1000 - 1,
    };
}

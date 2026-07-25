/**
 * LightTileGrid — persistent per-tile multi-channel light state stored in GameState.
 *
 * Divided into quadrants of LIGHT_QUADRANT_SIZE × LIGHT_QUADRANT_SIZE tiles
 * (matching the terrain segment size) for future batch update support.
 * Each quadrant stores flat channel arrays in row-major order.
 */

import {
    DEFAULT_LIGHT_TYPE,
    LIGHT_TYPES,
    emptyLightTypeIntensities,
    pickRenderLightType,
    visibilityFromChannels,
    type LightType,
    type LightTypeIntensities,
} from '../lighting/lightTypes';

/** Tile size of each quadrant edge — matches terrain segment size. */
export const LIGHT_QUADRANT_SIZE = 22;

const CHANNELS_FORMAT = 'channels-v1' as const;

export interface LightTileGridJSON {
    w: number;
    h: number;
    /**
     * Legacy single-channel: `q` is number[][] of visibility values (migrated to FireLight).
     * Multi-channel: `format: 'channels-v1'` with `channels` + `voidDarkness`.
     */
    format?: typeof CHANNELS_FORMAT;
    /** Legacy flat visibility per quadrant. */
    q?: number[][];
    channels?: Record<LightType, number[][]>;
    voidDarkness?: number[][];
}

function emptyQuadrants(qCount: number): number[][] {
    return Array.from({ length: qCount }, () =>
        new Array(LIGHT_QUADRANT_SIZE * LIGHT_QUADRANT_SIZE).fill(0),
    );
}

export class LightTileGrid {
    readonly gridWidth: number;
    readonly gridHeight: number;
    readonly qCols: number;
    readonly qRows: number;
    readonly channels: Record<LightType, number[][]>;
    readonly voidDarkness: number[][];

    private constructor(gridWidth: number, gridHeight: number) {
        this.gridWidth = gridWidth;
        this.gridHeight = gridHeight;
        this.qCols = Math.ceil(gridWidth / LIGHT_QUADRANT_SIZE);
        this.qRows = Math.ceil(gridHeight / LIGHT_QUADRANT_SIZE);
        const qCount = this.qRows * this.qCols;
        this.channels = {
            FireLight: emptyQuadrants(qCount),
            DayLight: emptyQuadrants(qCount),
            DarkLight: emptyQuadrants(qCount),
            LanternLight: emptyQuadrants(qCount),
        };
        this.voidDarkness = emptyQuadrants(qCount);
    }

    static create(gridWidth: number, gridHeight: number): LightTileGrid {
        return new LightTileGrid(gridWidth, gridHeight);
    }

    private quadrantIndex(row: number, col: number): {
        qi: number;
        local: number;
    } | null {
        const qRow = Math.floor(row / LIGHT_QUADRANT_SIZE);
        const qCol = Math.floor(col / LIGHT_QUADRANT_SIZE);
        const qi = qRow * this.qCols + qCol;
        const localRow = row - qRow * LIGHT_QUADRANT_SIZE;
        const localCol = col - qCol * LIGHT_QUADRANT_SIZE;
        return { qi, local: localRow * LIGHT_QUADRANT_SIZE + localCol };
    }

    getChannel(row: number, col: number, type: LightType): number {
        const idx = this.quadrantIndex(row, col);
        if (!idx) return 0;
        return this.channels[type][idx.qi]?.[idx.local] ?? 0;
    }

    setChannel(row: number, col: number, type: LightType, value: number): void {
        const idx = this.quadrantIndex(row, col);
        if (!idx) return;
        const q = this.channels[type][idx.qi];
        if (q) q[idx.local] = value;
    }

    getVoid(row: number, col: number): number {
        const idx = this.quadrantIndex(row, col);
        if (!idx) return 0;
        return this.voidDarkness[idx.qi]?.[idx.local] ?? 0;
    }

    setVoid(row: number, col: number, value: number): void {
        const idx = this.quadrantIndex(row, col);
        if (!idx) return;
        const q = this.voidDarkness[idx.qi];
        if (q) q[idx.local] = value;
    }

    getIntensities(row: number, col: number): LightTypeIntensities {
        const out = emptyLightTypeIntensities();
        for (const type of LIGHT_TYPES) {
            out[type] = this.getChannel(row, col, type);
        }
        return out;
    }

    /**
     * Visibility at a tile. Pass `globalLightLevel` from the engine (not stored in the grid).
     */
    getVisibility(row: number, col: number, globalLightLevel = 0): number {
        return visibilityFromChannels(this.getIntensities(row, col), this.getVoid(row, col), globalLightLevel);
    }

    getDominantType(row: number, col: number): LightType | null {
        return pickRenderLightType(this.getIntensities(row, col));
    }

    /**
     * Legacy single-value getter — returns visibility with globalLightLevel=0.
     * Prefer {@link getVisibility} with the engine global when available.
     */
    get(row: number, col: number): number {
        return this.getVisibility(row, col, 0);
    }

    /**
     * Legacy setter — writes into FireLight only (used by old tests / migration helpers).
     * Prefer {@link setChannel} / {@link setVoid}.
     */
    set(row: number, col: number, value: number): void {
        this.setChannel(row, col, DEFAULT_LIGHT_TYPE, value);
        for (const type of LIGHT_TYPES) {
            if (type !== DEFAULT_LIGHT_TYPE) this.setChannel(row, col, type, 0);
        }
        this.setVoid(row, col, 0);
    }

    fillChannels(value: number): void {
        for (const type of LIGHT_TYPES) {
            for (const q of this.channels[type]) q.fill(value);
        }
        for (const q of this.voidDarkness) q.fill(0);
    }

    toJSON(): LightTileGridJSON {
        return {
            w: this.gridWidth,
            h: this.gridHeight,
            format: CHANNELS_FORMAT,
            channels: {
                FireLight: this.channels.FireLight.map((q) => Array.from(q)),
                DayLight: this.channels.DayLight.map((q) => Array.from(q)),
                DarkLight: this.channels.DarkLight.map((q) => Array.from(q)),
                LanternLight: this.channels.LanternLight.map((q) => Array.from(q)),
            },
            voidDarkness: this.voidDarkness.map((q) => Array.from(q)),
        };
    }

    static fromJSON(data: LightTileGridJSON): LightTileGrid {
        const g = new LightTileGrid(data.w, data.h);

        if (data.format === CHANNELS_FORMAT && data.channels && data.voidDarkness) {
            for (const type of LIGHT_TYPES) {
                const srcQuads = data.channels[type];
                if (!srcQuads) continue;
                for (let i = 0; i < g.channels[type].length; i++) {
                    const src = srcQuads[i];
                    if (src) g.channels[type][i] = Array.from(src);
                }
            }
            for (let i = 0; i < g.voidDarkness.length; i++) {
                const src = data.voidDarkness[i];
                if (src) g.voidDarkness[i] = Array.from(src);
            }
            return g;
        }

        // Legacy: single visibility number[][] → FireLight channel only.
        if (data.q) {
            for (let i = 0; i < g.channels.FireLight.length; i++) {
                const src = data.q[i];
                if (src) g.channels.FireLight[i] = Array.from(src);
            }
        }
        return g;
    }
}

/**
 * wallLightSpots - Pick wall cells to mount lights on so they light most of a map's floor.
 *
 * Candidates are light-blocking, impassable cells (not `Impassable` void) with a passable
 * orthogonal neighbour: wall faces. A light on a wall still lights outward (see
 * `game/lighting/lightOcclusion.ts`), and walls between it and a cell cast shadows.
 *
 * Greedy set cover, deterministic: each step takes the candidate that fully lights (within
 * `radius`, by the light grid's own distance rule, past occluding walls) the most still-unlit
 * passable cells, ties to the first in row-major order. A pick must be at least `minSpacing` from
 * every other light. It stops once `targetCoverage` of the floor is lit, or when the best pick
 * would light fewer than `minNewCells`, so small pockets between lights stay dark.
 */

import { roundedEuclideanDistance } from '../../game/LightGrid';
import { LightOcclusionCache } from '../../game/lighting/lightOcclusion';
import { TERRAIN_PROPERTIES, TerrainType } from '../TerrainType';
import type { GridCell } from './paintCells';

/** Read-only terrain lookup (`TerrainGrid` fits). Out-of-bounds should read as blocking. */
export interface TerrainLookup {
    width: number;
    height: number;
    get(col: number, row: number): TerrainType;
}

export interface WallLightSpotOptions {
    /** Full-strength light radius used to judge coverage (tiles). */
    radius: number;
    /** Share of passable cells to light before stopping (0..1). */
    targetCoverage: number;
    /** Fewest tiles between two lights (rounded Euclidean). */
    minSpacing: number;
    /** Skip a pick that would newly light fewer cells than this. */
    minNewCells: number;
    /** Lights already on the map: they count as lit area and as spacing anchors, and are never picked. */
    existingLights?: readonly GridCell[];
}

const ORTHOGONAL: readonly [number, number][] = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
];

/** Wall cells to place lights on, in pick order. */
export function wallLightSpots(terrain: TerrainLookup, options: WallLightSpotOptions): GridCell[] {
    const { width, height } = terrain;
    const passable = new Uint8Array(width * height);
    let passableCount = 0;
    for (let row = 0; row < height; row++) {
        for (let col = 0; col < width; col++) {
            if (TERRAIN_PROPERTIES[terrain.get(col, row)]?.passable) {
                passable[row * width + col] = 1;
                passableCount++;
            }
        }
    }
    if (passableCount === 0) return [];

    const blocksLight = (col: number, row: number): boolean => {
        if (col < 0 || row < 0 || col >= width || row >= height) return true;
        return TERRAIN_PROPERTIES[terrain.get(col, row)]?.blocksLight ?? true;
    };
    const occlusion = new LightOcclusionCache(width, height, blocksLight);
    const lit = new Uint8Array(width * height);
    let litCount = 0;
    const lightUp = (cells: readonly number[]): void => {
        for (const i of cells) {
            if (!lit[i]) {
                lit[i] = 1;
                litCount++;
            }
        }
    };
    const floorReachedFrom = (col: number, row: number): number[] => {
        const mask = occlusion.getMask(col, row, options.radius);
        const out: number[] = [];
        const r = Math.ceil(options.radius) + 1;
        for (let rr = Math.max(0, row - r); rr <= Math.min(height - 1, row + r); rr++) {
            for (let cc = Math.max(0, col - r); cc <= Math.min(width - 1, col + r); cc++) {
                const i = rr * width + cc;
                if (mask[i] && passable[i]) out.push(i);
            }
        }
        return out;
    };

    const placed: GridCell[] = [...(options.existingLights ?? [])];
    for (const light of placed) lightUp(floorReachedFrom(light.col, light.row));

    const taken = new Set(placed.map((c) => `${c.col},${c.row}`));
    const candidates: { cell: GridCell; reach: number[] }[] = [];
    for (let row = 0; row < height; row++) {
        for (let col = 0; col < width; col++) {
            const type = terrain.get(col, row);
            if (type === TerrainType.Impassable) continue;
            const props = TERRAIN_PROPERTIES[type];
            if (!props || props.passable || !props.blocksLight) continue;
            if (taken.has(`${col},${row}`)) continue;
            const facesFloor = ORTHOGONAL.some(([dc, dr]) => {
                const c = col + dc;
                const r = row + dr;
                return c >= 0 && r >= 0 && c < width && r < height && passable[r * width + c] === 1;
            });
            if (facesFloor) candidates.push({ cell: { col, row }, reach: floorReachedFrom(col, row) });
        }
    }

    const picked: GridCell[] = [];
    const target = Math.ceil(options.targetCoverage * passableCount);
    while (litCount < target) {
        let best = -1;
        let bestGain = options.minNewCells - 1;
        for (let k = 0; k < candidates.length; k++) {
            const { cell, reach } = candidates[k]!;
            if (placed.some((p) => roundedEuclideanDistance(cell.col, cell.row, p.col, p.row) < options.minSpacing)) {
                continue;
            }
            let gain = 0;
            for (const i of reach) if (!lit[i]) gain++;
            if (gain > bestGain) {
                bestGain = gain;
                best = k;
            }
        }
        if (best < 0) break;
        const choice = candidates[best]!;
        candidates.splice(best, 1);
        picked.push(choice.cell);
        placed.push(choice.cell);
        lightUp(choice.reach);
    }
    return picked;
}

import { describe, it, expect } from 'vitest';
import { wallLightSpots, type TerrainLookup, type WallLightSpotOptions } from './wallLightSpots';
import { lightCoverage } from './lightCoverage';
import { roundedEuclideanDistance } from '../../game/LightGrid';
import { TERRAIN_PROPERTIES, TerrainType } from '../TerrainType';

const R = TerrainType.Rock;
const D = TerrainType.Dirt;

/** A 24x12 room: rock border, dirt floor, a dividing wall with a door. */
function room(): TerrainType[][] {
    return Array.from({ length: 12 }, (_, row) =>
        Array.from({ length: 24 }, (_, col) => {
            if (row === 0 || row === 11 || col === 0 || col === 23) return R;
            if (col === 12 && row !== 5) return R;
            return D;
        }),
    );
}

function lookup(t: TerrainType[][]): TerrainLookup {
    return { width: t[0]!.length, height: t.length, get: (col, row) => t[row]?.[col] ?? R };
}

const OPTIONS: WallLightSpotOptions = { radius: 3, targetCoverage: 0.7, minSpacing: 6, minNewCells: 4 };

describe('wallLightSpots', () => {
    it('picks only wall cells that face the floor, spaced apart', () => {
        const t = room();
        const spots = wallLightSpots(lookup(t), OPTIONS);
        expect(spots.length).toBeGreaterThan(2);
        for (const s of spots) {
            expect(TERRAIN_PROPERTIES[t[s.row]![s.col]!].passable).toBe(false);
            const faces = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(
                ([dc, dr]) => t[s.row + dr!]?.[s.col + dc!] === D,
            );
            expect(faces).toBe(true);
        }
        for (const a of spots) {
            for (const b of spots) {
                if (a !== b) expect(roundedEuclideanDistance(a.col, a.row, b.col, b.row)).toBeGreaterThanOrEqual(6);
            }
        }
    });

    it('lights about the target share of the floor, not all of it', () => {
        const t = room();
        const spots = wallLightSpots(lookup(t), OPTIONS);
        const { covered, uncovered } = lightCoverage(t, spots, OPTIONS.radius);
        const share = covered.length / (covered.length + uncovered.length);
        expect(share).toBeGreaterThanOrEqual(0.6);
        expect(uncovered.length).toBeGreaterThan(0);
    });

    it('is deterministic and counts existing lights as already lit', () => {
        const t = room();
        expect(wallLightSpots(lookup(t), OPTIONS)).toEqual(wallLightSpots(lookup(t), OPTIONS));
        const existing = [{ col: 6, row: 0 }];
        const withExisting = wallLightSpots(lookup(t), { ...OPTIONS, existingLights: existing });
        expect(withExisting).not.toContainEqual(existing[0]);
        for (const s of withExisting) expect(roundedEuclideanDistance(s.col, s.row, 6, 0)).toBeGreaterThanOrEqual(6);
    });

    it('returns nothing for a map with no floor', () => {
        expect(wallLightSpots(lookup([[R, R], [R, R]]), OPTIONS)).toEqual([]);
    });
});

import { describe, expect, it } from 'vitest';
import {
    baseTerrainOf,
    canUnitAffectTerrain,
    TERRAIN_PROPERTIES,
    terrainListIncludes,
    terrainListIncludesForActor,
    TerrainType,
    type TerrainAccessId,
} from './TerrainType';

const BRICK_ACCESS: ReadonlySet<TerrainAccessId> = new Set(['brick']);
const ALL_TYPES = (Object.keys(TERRAIN_PROPERTIES).map(Number) as TerrainType[]);

describe('Brick terrain properties', () => {
    it('is appended as 9 so checkpoint numbers never shift', () => {
        expect(TerrainType.Brick).toBe(9);
        expect(TerrainType.DeepWater).toBe(8);
    });

    it('copies every Rock gameplay property and adds its own name, colour and access gate', () => {
        const rock = TERRAIN_PROPERTIES[TerrainType.Rock];
        const brick = TERRAIN_PROPERTIES[TerrainType.Brick];
        for (const key of [
            'passable',
            'forcedMovementPassable',
            'speedMultiplier',
            'pathfindingWeight',
            'projectilePassable',
            'blocksProjectiles',
            'blocksVision',
            'blocksLight',
            'renderStrategy',
            'blocksBleed',
        ] as const) {
            expect(brick[key], key).toEqual(rock[key]);
        }
        expect(brick.name).toBe('Brick');
        expect(brick.color).not.toBe(rock.color);
        expect(brick.variantOf).toBe(TerrainType.Rock);
        expect(brick.access).toBe('brick');
        expect(rock.variantOf).toBeUndefined();
        expect(rock.access).toBeUndefined();
    });

    it('joins Rock in the hard-edge family both ways, and Gravel lists Brick as it lists Rock', () => {
        const family = (t: TerrainType) => TERRAIN_PROPERTIES[t].hardEdgeFamily;
        expect(family(TerrainType.Rock)).toContain(TerrainType.Brick);
        expect(family(TerrainType.Brick)).toContain(TerrainType.Rock);
        expect(family(TerrainType.Gravel)).toEqual(expect.arrayContaining([TerrainType.Rock, TerrainType.Brick]));
    });

    it('variants point at a base type (no variant of a variant)', () => {
        for (const type of ALL_TYPES) {
            const base = TERRAIN_PROPERTIES[type].variantOf;
            if (base === undefined) continue;
            expect(TERRAIN_PROPERTIES[base].variantOf, `${TERRAIN_PROPERTIES[type].name}`).toBeUndefined();
        }
    });
});

describe('baseTerrainOf', () => {
    it('maps a variant to its base and leaves base types alone', () => {
        expect(baseTerrainOf(TerrainType.Brick)).toBe(TerrainType.Rock);
        expect(baseTerrainOf(TerrainType.Rock)).toBe(TerrainType.Rock);
        expect(baseTerrainOf(TerrainType.Grass)).toBe(TerrainType.Grass);
        expect(baseTerrainOf(TerrainType.Gravel)).toBe(TerrainType.Gravel);
    });
});

describe('canUnitAffectTerrain', () => {
    it('passes ungated terrain for anyone, even with no actor', () => {
        expect(canUnitAffectTerrain(TerrainType.Rock, null)).toBe(true);
        expect(canUnitAffectTerrain(TerrainType.Rock, undefined)).toBe(true);
        expect(canUnitAffectTerrain(TerrainType.Grass, new Set())).toBe(true);
    });

    it('passes gated terrain only when the access set holds its gate', () => {
        expect(canUnitAffectTerrain(TerrainType.Brick, null)).toBe(false);
        expect(canUnitAffectTerrain(TerrainType.Brick, new Set())).toBe(false);
        expect(canUnitAffectTerrain(TerrainType.Brick, BRICK_ACCESS)).toBe(true);
    });
});

describe('terrainListIncludes / terrainListIncludesForActor', () => {
    it('a base-type list matches its variants for "what is it" questions', () => {
        expect(terrainListIncludes([TerrainType.Rock], TerrainType.Brick)).toBe(true);
        expect(terrainListIncludes([TerrainType.Rock], TerrainType.Rock)).toBe(true);
        expect(terrainListIncludes([TerrainType.Grass], TerrainType.Brick)).toBe(false);
        expect(terrainListIncludes([TerrainType.Brick], TerrainType.Rock)).toBe(false);
    });

    it('the actor-aware match needs access for a gated variant named only through its base', () => {
        expect(terrainListIncludesForActor([TerrainType.Rock], TerrainType.Brick, null)).toBe(false);
        expect(terrainListIncludesForActor([TerrainType.Rock], TerrainType.Brick, BRICK_ACCESS)).toBe(true);
        expect(terrainListIncludesForActor([TerrainType.Rock], TerrainType.Rock, null)).toBe(true);
        // Naming the variant itself is an explicit match.
        expect(terrainListIncludesForActor([TerrainType.Brick], TerrainType.Brick, null)).toBe(true);
    });
});

import { describe, expect, it } from 'vitest';
import { TerrainType } from '../../terrain/TerrainType';
import { floorTileFromBedrock } from '../../terrain/FloorTile';
import { floorTileVisualFor, ROCK_FLOOR_VISUAL_TIERS, RUBBLE_FLOOR_VISUAL } from './floorTileVisualDefs';

function damaged(type: TerrainType, fraction: number) {
    const tile = floorTileFromBedrock(type);
    tile.destructible!.health = tile.destructible!.maxHealth * fraction;
    return tile;
}

describe('floorTileVisualFor', () => {
    it('shows no overlay on intact Rock or Brick', () => {
        expect(floorTileVisualFor(0, 0, floorTileFromBedrock(TerrainType.Rock))).toBeNull();
        expect(floorTileVisualFor(0, 0, floorTileFromBedrock(TerrainType.Brick))).toBeNull();
    });

    it('cracks damaged Brick through the same tiers as Rock, keyed per type', () => {
        for (const [fraction, tier] of [[0.8, 1], [0.6, 2], [0.3, 3], [0.1, 4]] as const) {
            const rock = floorTileVisualFor(2, 3, damaged(TerrainType.Rock, fraction));
            const brick = floorTileVisualFor(2, 3, damaged(TerrainType.Brick, fraction));
            expect(brick?.def).toBe(ROCK_FLOOR_VISUAL_TIERS[tier - 1]);
            expect(rock?.def).toBe(brick?.def);
            expect(brick?.cacheKey).toBe(`2,3:${TerrainType.Brick}:${tier}`);
            expect(rock?.cacheKey).not.toBe(brick?.cacheKey);
        }
    });

    it('shows rubble on Gravel and nothing on other floors', () => {
        expect(floorTileVisualFor(0, 0, { terrainType: TerrainType.Gravel })?.def).toBe(RUBBLE_FLOOR_VISUAL);
        expect(floorTileVisualFor(0, 0, { terrainType: TerrainType.Dirt })).toBeNull();
    });
});

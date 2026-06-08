import { describe, expect, it } from 'vitest';
import { TerrainGrid, CELL_SIZE } from './TerrainGrid';
import { TerrainType } from './TerrainType';
import { TerrainLayerManager } from '../game/TerrainLayerManager';
import {
    getDamageTier,
    getEffectiveTerrain,
    isIntactRock,
    isOnStone,
} from './FloorTile';
import { EARTH_CORE_STONE_HEALTH } from '../card_defs/05_earth_core/earthCoreConstants';

describe('FloorTile helpers', () => {
    it('resolves effective terrain from floor or bedrock', () => {
        expect(getEffectiveTerrain(null, TerrainType.Grass)).toBe(TerrainType.Grass);
        expect(getEffectiveTerrain({ terrainType: TerrainType.Rubble }, TerrainType.Rock)).toBe(TerrainType.Rubble);
    });

    it('classifies intact rock and excludes rubble', () => {
        expect(isIntactRock(TerrainType.Rock)).toBe(true);
        expect(isIntactRock(TerrainType.Rock, { health: 10, maxHealth: 30, kind: 'rock' })).toBe(true);
        expect(isIntactRock(TerrainType.Rock, { health: 0, maxHealth: 30, kind: 'rock' })).toBe(false);
        expect(isIntactRock(TerrainType.Rubble)).toBe(false);
        expect(isOnStone(TerrainType.Rubble)).toBe(false);
    });

    it('maps health percentage to damage tiers', () => {
        expect(getDamageTier({ health: 30, maxHealth: 30, kind: 'rock' })).toBe(0);
        expect(getDamageTier({ health: 18, maxHealth: 30, kind: 'rock' })).toBe(1);
        expect(getDamageTier({ health: 9, maxHealth: 30, kind: 'rock' })).toBe(2);
        expect(getDamageTier({ health: 0, maxHealth: 30, kind: 'rock' })).toBe(3);
        expect(getDamageTier(undefined)).toBe(3);
    });
});

describe('TerrainLayerManager floor tiles', () => {
    it('ensureFloorFromBedrock copies bedrock and attaches rock destructible', () => {
        const grid = TerrainGrid.createFilledTerrain(3, 3, CELL_SIZE, TerrainType.Grass);
        grid.set(1, 1, TerrainType.Rock);
        const layers = new TerrainLayerManager();
        const tile = layers.ensureFloorFromBedrock(1, 1, grid);
        expect(tile.terrainType).toBe(TerrainType.Rock);
        expect(tile.destructible?.health).toBe(EARTH_CORE_STONE_HEALTH);
        expect(tile.destructible?.kind).toBe('rock');
    });

    it('round-trips floor tiles through serialization', () => {
        const layers = new TerrainLayerManager();
        layers.setFloorTile(2, 3, {
            terrainType: TerrainType.Rock,
            destructible: { health: 18, maxHealth: 30, kind: 'rock' },
        });
        layers.setFloorTile(4, 1, { terrainType: TerrainType.Rubble });
        const restored = TerrainLayerManager.fromJSON([], layers.toFloorTilesJSON());
        expect(restored.getFloorTile(2, 3)?.destructible?.health).toBe(18);
        expect(restored.getFloorTile(4, 1)?.terrainType).toBe(TerrainType.Rubble);
    });

    it('migrates legacy rock floor effects on load', () => {
        const restored = TerrainLayerManager.fromJSON([
            {
                id: 'legacy-rock',
                layer: 'floor',
                effectType: 'rock_state',
                placedAtGameTime: 0,
                area: { type: 'cell', col: 1, row: 2 },
                params: { state: 'cracked_rock', health: 24 },
            },
            {
                id: 'legacy-spent',
                layer: 'floor',
                effectType: 'created_rock',
                placedAtGameTime: 0,
                area: { type: 'cell', col: 3, row: 2 },
                params: { state: 'spent_rubble', health: 0 },
            },
        ]);
        expect(restored.getFloorTile(1, 2)?.destructible?.health).toBe(24);
        expect(restored.getFloorTile(3, 2)?.terrainType).toBe(TerrainType.Rubble);
        expect(restored.toEffectsJSON()).toHaveLength(0);
    });
});

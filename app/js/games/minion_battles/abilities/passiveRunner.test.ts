import { describe, expect, it } from 'vitest';
import { EventBus } from '../game/EventBus';
import { TerrainLayerManager } from '../game/TerrainLayerManager';
import { Unit } from '../game/units/Unit';
import type { EngineContext } from '../game/EngineContext';
import { TerrainGrid, CELL_SIZE } from '../terrain/TerrainGrid';
import { TerrainManager } from '../terrain/TerrainManager';
import { TerrainType } from '../terrain/TerrainType';
import type { PassivePlaceTerrainEffect } from './passiveDef';
import { placeTerrain } from './passiveRunner';

function husk(col: number, row: number): Unit {
    return new Unit({
        id: 'husk1',
        x: col * CELL_SIZE + CELL_SIZE / 2,
        y: row * CELL_SIZE + CELL_SIZE / 2,
        hp: 90,
        maxHp: 90,
        speed: 40,
        teamId: 'enemy',
        ownerId: 'ai',
        characterId: 'husk',
        name: 'Husk',
        radius: 16,
    });
}

function engine(gameTime: number, terrainManager: TerrainManager | null = null) {
    return {
        gameTime,
        terrainLayers: new TerrainLayerManager(),
        terrainManager,
        units: [],
        eventBus: new EventBus(),
        addEffect: () => {},
    } as unknown as EngineContext;
}

const GAS: PassivePlaceTerrainEffect = {
    type: 'place_terrain',
    effectType: 'miasma',
    layer: 'air',
    cellRadius: 1,
    durationSec: 10,
    onExisting: 'refresh',
};

describe('place_terrain with cellRadius', () => {
    it('covers the 3x3 square around the caster on the air layer with an expiry', () => {
        const e = engine(5);
        placeTerrain(husk(5, 5), GAS, e);
        const placed = [...e.terrainLayers.allEffects.values()];
        expect(placed).toHaveLength(9);
        for (let row = 4; row <= 6; row++) {
            for (let col = 4; col <= 6; col++) {
                const rec = e.terrainLayers.getAirEffectAt(col, row);
                expect(rec?.effectType).toBe('miasma');
                expect(rec?.expiresAtGameTime).toBe(15);
            }
        }
        expect(e.terrainLayers.getGroundEffectAt(5, 5)).toBeNull();
        expect(e.terrainLayers.getAirEffectAt(7, 5)).toBeNull();
    });

    it('refreshes existing cells instead of stacking duplicates', () => {
        const e = engine(0);
        const u = husk(5, 5);
        placeTerrain(u, GAS, e);
        (e as { gameTime: number }).gameTime = 4;
        u.x += CELL_SIZE; // one cell east: 6 overlap, 3 new
        placeTerrain(u, GAS, e);
        expect(e.terrainLayers.allEffects.size).toBe(12);
        expect(e.terrainLayers.getAirEffectAt(5, 5)?.expiresAtGameTime).toBe(14);
        expect(e.terrainLayers.getAirEffectAt(4, 5)?.expiresAtGameTime).toBe(10);
        expect(e.terrainLayers.getAirEffectAt(7, 5)?.expiresAtGameTime).toBe(14);
    });

    it('skips impassable cells when skipImpassable is set', () => {
        const grid = new TerrainGrid(12, 12, CELL_SIZE, TerrainType.Grass);
        grid.set(6, 5, TerrainType.Impassable);
        const e = engine(0, new TerrainManager(grid));
        placeTerrain(husk(5, 5), { ...GAS, skipImpassable: true }, e);
        expect(e.terrainLayers.allEffects.size).toBe(8);
        expect(e.terrainLayers.getAirEffectAt(6, 5)).toBeNull();
    });

    it('keeps the legacy permanent ground behaviour (count, skip existing, thorn id prefix)', () => {
        const e = engine(0);
        const effect: PassivePlaceTerrainEffect = {
            type: 'place_terrain',
            effectType: 'bramble_slow',
            range: CELL_SIZE * 2,
            count: 2,
        };
        const u = husk(5, 5);
        placeTerrain(u, effect, e);
        placeTerrain(u, effect, e);
        const placed = [...e.terrainLayers.allEffects.values()];
        expect(placed).toHaveLength(4);
        expect(placed.every((r) => r.layer === 'ground' && r.expiresAtGameTime === undefined)).toBe(true);
        expect(placed.every((r) => r.id.startsWith('thorn-'))).toBe(true);
    });
});

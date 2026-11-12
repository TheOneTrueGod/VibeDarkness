import { describe, expect, it } from 'vitest';
import { EventBus } from '../game/EventBus';
import { Unit } from '../game/units/Unit';
import type { EngineContext } from '../game/EngineContext';
import { TerrainLayerManager } from '../game/TerrainLayerManager';
import { FIXED_DT } from '../game/gameConstants';
import { TerrainManager } from '../terrain/TerrainManager';
import { CELL_SIZE, TerrainGrid } from '../terrain/TerrainGrid';
import { TerrainType, WATER_TERRAIN_TYPES } from '../terrain/TerrainType';
import { WATER_TILE_HEALTH } from '../terrain/FloorTile';
import { pickSiphonTiles, tickTerrainSiphon, type TerrainSiphonConfig } from './terrainSiphon';
import { Water, WATER_MAX, WATER_SIPHON } from './Water';
import { createResourceFromId } from './createResourceFromId';
import { ALL_RESOURCE_DISPLAY_DEFS } from './resourceDisplayDefs';

/** The unit stands in the middle cell of a 5x5 grass map. */
const CENTER = 2;

function makeTerrain(water: Array<[col: number, row: number, type: TerrainType]> = []): TerrainManager {
    const grid = TerrainGrid.createFilledTerrain(5, 5, CELL_SIZE, TerrainType.Grass);
    for (const [col, row, type] of water) grid.set(col, row, type);
    const manager = new TerrainManager(grid);
    manager.setTerrainLayers(new TerrainLayerManager());
    return manager;
}

function makeUnit(col = CENTER, row = CENTER): Unit {
    return new Unit({
        id: 'caster',
        x: col * CELL_SIZE + CELL_SIZE / 2,
        y: row * CELL_SIZE + CELL_SIZE / 2,
        hp: 100,
        speed: 100,
        teamId: 'player',
        ownerId: 'p1',
        characterId: 'player',
        name: 'caster',
        radius: 20,
    });
}

function setup(water: Array<[number, number, TerrainType]>) {
    const terrain = makeTerrain(water);
    const engine = { terrainManager: terrain } as unknown as EngineContext;
    const unit = makeUnit();
    const resource = new Water();
    unit.attachResource(resource, new EventBus());
    return { terrain, engine, unit, resource };
}

/** Remaining water (0..1 of a level) on a tile; 1 when it has never been drawn on. */
function waterHealth(terrain: TerrainManager, col: number, row: number): number {
    return terrain.getFloorTile(col, row)?.destructible?.health ?? WATER_TILE_HEALTH;
}

function tickFor(seconds: number, resource: Water, unit: Unit, engine: EngineContext): void {
    const ticks = Math.round(seconds / FIXED_DT);
    for (let i = 0; i < ticks; i++) resource.onTick(unit, engine, FIXED_DT);
}

describe('terrain siphon (Water)', () => {
    it('gains nothing away from water', () => {
        // Water two cells away is outside the 3x3.
        const { terrain, engine, unit, resource } = setup([[0, 0, TerrainType.DeepWater]]);
        tickFor(1, resource, unit, engine);
        expect(resource.current).toBe(0);
        expect(resource.perSecondGain).toBe(0);
        expect(terrain.getFloorTile(0, 0)).toBeNull();
    });

    it('gains 0.5 Water per second beside water, and the tooltip rate shows it', () => {
        const { terrain, engine, unit, resource } = setup([[CENTER + 1, CENTER, TerrainType.Water]]);
        tickFor(2, resource, unit, engine);
        expect(resource.current).toBeCloseTo(1, 9);
        expect(resource.perSecondGain).toBe(0.5);
        expect(waterHealth(terrain, CENTER + 1, CENTER)).toBeCloseTo(1 - 2 / 8, 9);
    });

    it('gains the same 0.5/s however many tiles it draws on', () => {
        const { engine, unit, resource } = setup([
            [CENTER, CENTER, TerrainType.Water],
            [CENTER + 1, CENTER, TerrainType.Water],
            [CENTER - 1, CENTER, TerrainType.Water],
        ]);
        tickFor(2, resource, unit, engine);
        expect(resource.current).toBeCloseTo(1, 9);
    });

    it('draws on at most 4 tiles, deepest first', () => {
        const water: Array<[number, number, TerrainType]> = [
            [1, 1, TerrainType.DeepWater],
            [3, 3, TerrainType.DeepWater],
            [2, 1, TerrainType.Water],
            [1, 2, TerrainType.Water],
            [2, 2, TerrainType.ShallowWater],
            [3, 2, TerrainType.ShallowWater],
            [2, 3, TerrainType.ShallowWater],
        ];
        const { terrain, engine, unit, resource } = setup(water);

        expect(pickSiphonTiles(unit, terrain, WATER_SIPHON).map((t) => [t.col, t.row])).toEqual([
            [1, 1],
            [3, 3],
            [2, 1],
            [1, 2],
        ]);

        tickFor(1, resource, unit, engine);
        for (const [col, row] of [[1, 1], [3, 3], [2, 1], [1, 2]]) {
            expect(waterHealth(terrain, col, row)).toBeCloseTo(1 - 1 / 8, 9);
        }
        // The shallow tiles (including the caster's own) were left alone.
        for (const [col, row] of [[2, 2], [3, 2], [2, 3]]) {
            expect(terrain.getFloorTile(col, row)).toBeNull();
        }
    });

    it('breaks depth ties by own cell, then orthogonal, then diagonal, then row/column order', () => {
        const water: Array<[number, number, TerrainType]> = [];
        for (let row = 1; row <= 3; row++) {
            for (let col = 1; col <= 3; col++) water.push([col, row, TerrainType.Water]);
        }
        const terrain = makeTerrain(water);
        const unit = makeUnit();
        const all: TerrainSiphonConfig = { ...WATER_SIPHON, maxTiles: 9 };

        expect(pickSiphonTiles(unit, terrain, all).map((t) => [t.col, t.row])).toEqual([
            [2, 2],
            [2, 1], [1, 2], [3, 2], [2, 3],
            [1, 1], [3, 1], [1, 3], [3, 3],
        ]);
        expect(pickSiphonTiles(unit, terrain, WATER_SIPHON)).toHaveLength(4);
    });

    it('only draws on the configured terrains', () => {
        const terrain = makeTerrain([
            [CENTER + 1, CENTER, TerrainType.DeepWater],
            [CENTER - 1, CENTER, TerrainType.ShallowWater],
        ]);
        const shallowOnly: TerrainSiphonConfig = { ...WATER_SIPHON, terrains: [TerrainType.ShallowWater] };
        expect(pickSiphonTiles(makeUnit(), terrain, shallowOnly).map((t) => [t.col, t.row])).toEqual([[CENTER - 1, CENTER]]);
    });

    it('stops at max: no gain and no drain', () => {
        const { terrain, engine, unit, resource } = setup([[CENTER, CENTER, TerrainType.DeepWater]]);
        resource.current = WATER_MAX;
        tickFor(1, resource, unit, engine);
        expect(resource.current).toBe(WATER_MAX);
        expect(resource.perSecondGain).toBe(0);
        expect(terrain.getFloorTile(CENTER, CENTER)).toBeNull();
    });

    it('clamps the gain to max', () => {
        const { engine, unit, resource } = setup([[CENTER, CENTER, TerrainType.DeepWater]]);
        resource.current = WATER_MAX - 0.1;
        tickFor(1, resource, unit, engine);
        expect(resource.current).toBe(WATER_MAX);
    });

    it('drops a tile a level after 8 s of draining', () => {
        const { terrain, engine, unit, resource } = setup([[CENTER + 1, CENTER, TerrainType.DeepWater]]);
        tickFor(7.9, resource, unit, engine);
        expect(terrain.getEffectiveTerrainType(CENTER + 1, CENTER)).toBe(TerrainType.DeepWater);
        tickFor(0.1, resource, unit, engine);
        expect(terrain.getEffectiveTerrainType(CENTER + 1, CENTER)).toBe(TerrainType.Water);
        expect(resource.current).toBeCloseTo(4, 6);
    });

    it('drains shallow water to dirt, and then there is nothing left to draw on', () => {
        const { terrain, engine, unit, resource } = setup([[CENTER, CENTER, TerrainType.ShallowWater]]);
        tickFor(8, resource, unit, engine);
        expect(terrain.getEffectiveTerrainType(CENTER, CENTER)).toBe(TerrainType.Dirt);
        const before = resource.current;
        tickFor(1, resource, unit, engine);
        expect(resource.current).toBe(before);
    });

    it('does nothing without terrain or with a non-positive dt', () => {
        const resource = new Water();
        const unit = makeUnit();
        expect(tickTerrainSiphon(resource, unit, { terrainManager: null }, FIXED_DT, WATER_SIPHON)).toEqual([]);
        const terrain = makeTerrain([[CENTER, CENTER, TerrainType.Water]]);
        expect(tickTerrainSiphon(resource, unit, { terrainManager: terrain }, 0, WATER_SIPHON)).toEqual([]);
        expect(resource.current).toBe(0);
    });

    it('draws on every water type by default', () => {
        expect(WATER_SIPHON.terrains).toBe(WATER_TERRAIN_TYPES);
        expect([...WATER_TERRAIN_TYPES].sort()).toEqual(
            [TerrainType.ShallowWater, TerrainType.Water, TerrainType.DeepWater].sort(),
        );
    });
});

describe('Water resource display', () => {
    it('restores from its id with the liquid bar and tooltip lines', () => {
        const water = createResourceFromId('water');
        expect(water).toBeInstanceOf(Water);
        expect(water!.max).toBe(WATER_MAX);
        expect(water!.barStyle).toBe('liquid');
        expect(water!.tooltipLines).toEqual([
            '+0.5/s in or beside water',
            'Drains up to 4 nearby tiles · max 16',
        ]);
    });

    it('has a display entry matching the resource', () => {
        const def = ALL_RESOURCE_DISPLAY_DEFS.find((d) => d.id === 'water');
        const water = new Water();
        expect(def).toMatchObject({
            name: water.name,
            color: water.color,
            iconName: 'Droplet',
            max: WATER_MAX,
            barStyle: 'liquid',
            tooltipLines: water.tooltipLines,
        });
    });
});

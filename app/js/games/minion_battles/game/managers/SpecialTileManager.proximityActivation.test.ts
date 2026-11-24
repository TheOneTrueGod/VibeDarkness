import { describe, it, expect } from 'vitest';
import { SpecialTileManager } from './SpecialTileManager';
import { EventBus, type SpecialTileActivatedEvent } from '../EventBus';
import type { EngineContext } from '../EngineContext';
import type { SerializedSpecialTile } from '../types';
import type { Unit } from '../units/Unit';
import { isTileDefendPoint, type SpecialTile } from '../specialTiles/SpecialTile';
import { CELL_SIZE, TerrainGrid } from '../../terrain/TerrainGrid';
import {
    WALL_CRYSTAL_LIGHT_AMOUNT,
    WALL_CRYSTAL_LIGHT_RADIUS,
    WALL_CRYSTAL_TILE_DEFAULTS,
} from '../../storylines/specialTileDefs';

const DT = 0.05;

function setup() {
    const eventBus = new EventBus();
    const ctx = { terrainManager: { grid: new TerrainGrid(20, 20) }, eventBus } as unknown as EngineContext;
    const mgr = new SpecialTileManager(ctx);
    const activated: SpecialTileActivatedEvent[] = [];
    eventBus.on('special_tile_activated', (e) => activated.push(e));
    const tile: SpecialTile = {
        id: 'special_WallCrystal_10_10',
        defId: WALL_CRYSTAL_TILE_DEFAULTS.defId,
        col: 10,
        row: 10,
        hp: 1,
        maxHp: 1,
        emitsLight: { ...WALL_CRYSTAL_TILE_DEFAULTS.emitsLight! },
    };
    mgr.addSpecialTile(tile);
    return { mgr, tile, activated };
}

/** Minimal unit stand-in at grid cell (col, row). */
function unitAt(col: number, row: number, playerControlled = true): Unit {
    return {
        x: col * CELL_SIZE + CELL_SIZE / 2,
        y: row * CELL_SIZE + CELL_SIZE / 2,
        isAlive: () => true,
        isPlayerControlled: () => playerControlled,
    } as unknown as Unit;
}

function runFor(mgr: SpecialTileManager, units: Unit[], seconds: number): void {
    for (let t = 0; t < seconds - 1e-9; t += DT) mgr.tickProximityActivations(units, DT);
}

describe('special tile proximity activation (wall crystal)', () => {
    it('starts dormant: no light, not an AI light or a lit emitter', () => {
        const { mgr, tile } = setup();
        expect(tile.dormant).toBe(true);
        expect(tile.activationProgress).toBe(0);
        expect(mgr.buildLightSourcesFromSpecialTiles()).toEqual([]);
        expect(mgr.listDeployables()[0]!.active).toBe(false);
        expect(isTileDefendPoint({ ...tile, defendPoint: true })).toBe(false);
    });

    it('wakes after ~2s with a hero within 2 tiles, emits the event, then gives full FireLight', () => {
        const { mgr, tile, activated } = setup();
        const hero = [unitAt(12, 8)]; // Chebyshev 2
        runFor(mgr, hero, 1);
        expect(tile.dormant).toBe(true);
        expect(tile.activationProgress).toBeCloseTo(0.5, 5);
        runFor(mgr, hero, 1.05);
        expect(tile.dormant).toBe(false);
        expect(tile.activationProgress).toBeUndefined();
        expect(activated).toEqual([{ tileId: tile.id, defId: 'WallCrystal', col: 10, row: 10 }]);
        const [light] = mgr.buildLightSourcesFromSpecialTiles();
        expect(light).toMatchObject({
            emission: WALL_CRYSTAL_LIGHT_AMOUNT,
            radius: WALL_CRYSTAL_LIGHT_RADIUS,
            lightType: 'FireLight',
        });
        expect(mgr.listDeployables()[0]!.active).toBe(true);
        // One-way: leaving does not put it back to sleep or fire again.
        runFor(mgr, [], 3);
        expect(tile.dormant).toBe(false);
        expect(activated).toHaveLength(1);
    });

    it('ignores heroes 3 tiles away and enemies close by', () => {
        const { mgr, tile } = setup();
        runFor(mgr, [unitAt(13, 10), unitAt(10, 11, false)], 3);
        expect(tile.dormant).toBe(true);
        expect(tile.activationProgress).toBe(0);
    });

    it('drains progress when the hero walks away', () => {
        const { mgr, tile } = setup();
        runFor(mgr, [unitAt(10, 11)], 1);
        runFor(mgr, [], 0.5);
        expect(tile.activationProgress).toBeCloseTo(0.25, 5);
        runFor(mgr, [], 1);
        expect(tile.activationProgress).toBe(0);
    });

    it('round-trips dormant state and progress through a checkpoint', () => {
        const { mgr, tile } = setup();
        runFor(mgr, [unitAt(10, 11)], 1);
        const json = JSON.parse(JSON.stringify(mgr.toJSON())) as SerializedSpecialTile[];
        const restored = new SpecialTileManager({ terrainManager: undefined } as unknown as EngineContext);
        restored.restoreFromJSON(json);
        expect(JSON.parse(JSON.stringify(restored.toJSON()))).toEqual(json);
        expect(restored.specialTiles[0]!.dormant).toBe(true);
        expect(restored.specialTiles[0]!.activationProgress).toBeCloseTo(tile.activationProgress!, 9);
    });
});

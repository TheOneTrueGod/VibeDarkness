/**
 * NavGrid tests - passability, costs, connected components, and epoch tracking.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TerrainGrid, CELL_SIZE } from '../terrain/TerrainGrid';
import { TerrainType } from '../terrain/TerrainType';
import { NavGrid, NAV_IMPASSABLE_COST } from './NavGrid';
import { TerrainManager } from '../terrain/TerrainManager';
import { GameEngine } from '../game/GameEngine';
import { TerrainLayerManager } from '../game/TerrainLayerManager';

describe('NavGrid', () => {
    let engine: GameEngine;
    let terrainGrid: TerrainGrid;
    let terrainManager: TerrainManager;

    beforeEach(() => {
        // Set up a minimal game engine with a 10x10 terrain grid.
        engine = new GameEngine();
        terrainGrid = new TerrainGrid(10, 10, CELL_SIZE, TerrainType.Grass);
        terrainManager = new TerrainManager(terrainGrid);
        engine.terrainManager = terrainManager;

        // Set up terrain layers (required by TerrainManager.getEffectiveTerrainType).
        const terrainLayers = new TerrainLayerManager();
        terrainManager.setTerrainLayers(terrainLayers);

        // Wire up the crystal protection provider.
        terrainManager.setCrystalProtectionProvider(() => engine.state.specialTileManager.getCrystalProtectionMap());
    });

    describe('basic passability', () => {
        it('terrain passability applies to both profiles', () => {
            const nav = terrainManager.nav;
            // Grass is passable for both profiles.
            expect(nav.isPassable('default', 3, 3)).toBe(true);
            expect(nav.isPassable('enemy', 3, 3)).toBe(true);
        });

        it('rock terrain blocks both profiles', () => {
            terrainGrid.set(5, 5, TerrainType.Rock);
            terrainManager.clearPathCache();

            const nav = terrainManager.nav;
            expect(nav.isPassable('default', 5, 5)).toBe(false);
            expect(nav.isPassable('enemy', 5, 5)).toBe(false);
        });

        it('out-of-bounds cells are impassable', () => {
            const nav = terrainManager.nav;
            expect(nav.isPassable('default', -1, 0)).toBe(false);
            expect(nav.isPassable('default', 10, 0)).toBe(false);
            expect(nav.isPassable('default', 0, -1)).toBe(false);
            expect(nav.isPassable('default', 0, 10)).toBe(false);
        });
    });

    describe('step costs', () => {
        it('different terrain types have different costs', () => {
            terrainGrid.set(1, 1, TerrainType.Grass);
            terrainGrid.set(2, 2, TerrainType.ThickGrass);
            terrainManager.clearPathCache();

            const nav = terrainManager.nav;
            const grassCost = nav.stepCost('default', 1 * 10 + 1);
            const thickGrassCost = nav.stepCost('default', 2 * 10 + 2);

            // Grass: 10 * 1.0 = 10; ThickGrass: 10 * 1.5 = 15.
            expect(grassCost).toBe(10);
            expect(thickGrassCost).toBe(15);
        });

        it('impassable cells have NAV_IMPASSABLE_COST', () => {
            terrainGrid.set(3, 3, TerrainType.Rock);
            terrainManager.clearPathCache();

            const nav = terrainManager.nav;
            const rockCost = nav.stepCost('default', 3 * 10 + 3);
            expect(rockCost).toBe(NAV_IMPASSABLE_COST);
        });

        it('out-of-bounds stepCost returns NAV_IMPASSABLE_COST', () => {
            const nav = terrainManager.nav;
            expect(nav.stepCost('default', -1)).toBe(NAV_IMPASSABLE_COST);
            expect(nav.stepCost('default', 100 * 100)).toBe(NAV_IMPASSABLE_COST);
        });
    });

    describe('rocks creating and destroying', () => {
        it('rock created makes cell impassable in both profiles', () => {
            expect(terrainManager.nav.isPassable('default', 4, 4)).toBe(true);
            expect(terrainManager.nav.isPassable('enemy', 4, 4)).toBe(true);

            terrainManager.createOrMarkRock(4, 4);

            expect(terrainManager.nav.isPassable('default', 4, 4)).toBe(false);
            expect(terrainManager.nav.isPassable('enemy', 4, 4)).toBe(false);
        });

        it('rock on already-rocky cell does not bump navEpoch', () => {
            terrainGrid.set(5, 5, TerrainType.Rock);
            terrainManager.clearPathCache();
            const startEpoch = terrainManager.navEpoch;

            terrainManager.createOrMarkRock(5, 5);

            expect(terrainManager.navEpoch).toBe(startEpoch);
        });

        it('navEpoch bumps once when rock created on passable cell', () => {
            const startEpoch = terrainManager.navEpoch;
            terrainManager.createOrMarkRock(6, 6);
            expect(terrainManager.navEpoch).toBe(startEpoch + 1);

            const midEpoch = terrainManager.navEpoch;
            terrainManager.createOrMarkRock(7, 7);
            expect(terrainManager.navEpoch).toBe(midEpoch + 1);
        });

        it('navEpoch does NOT bump when rock is damaged but not destroyed', () => {
            terrainManager.createOrMarkRock(2, 2);
            const afterCreateEpoch = terrainManager.navEpoch;

            // Damage the rock but not enough to destroy it.
            terrainManager.damageRock(2, 2, 1);

            expect(terrainManager.navEpoch).toBe(afterCreateEpoch);
        });

        it('navEpoch bumps once when rock is destroyed', () => {
            const tile = terrainManager.createOrMarkRock(3, 3);
            const afterCreateEpoch = terrainManager.navEpoch;

            // Damage the rock enough to destroy it.
            if (tile?.destructible) {
                terrainManager.damageRock(3, 3, tile.destructible.health);
            }

            expect(terrainManager.navEpoch).toBe(afterCreateEpoch + 1);
            expect(terrainManager.nav.isPassable('default', 3, 3)).toBe(true);
        });
    });

    describe('crystal protection (enemy profile only)', () => {
        it('crystal blocks enemy profile but not default', () => {
            // Add a crystal at (5, 5) with radius 1.
            engine.state.specialTileManager.addSpecialTile({
                id: 'crystal_1',
                defId: 'Crystal',
                col: 5,
                row: 5,
                hp: 100,
                maxHp: 100,
                protectRadius: 1,
            });

            const nav = terrainManager.nav;
            // Center of crystal is blocked for enemy profile.
            expect(nav.isPassable('default', 5, 5)).toBe(true);
            expect(nav.isPassable('enemy', 5, 5)).toBe(false);

            // Cells within radius are blocked for enemy, passable for default.
            expect(nav.isPassable('default', 4, 5)).toBe(true);
            expect(nav.isPassable('enemy', 4, 5)).toBe(false);

            expect(nav.isPassable('default', 5, 4)).toBe(true);
            expect(nav.isPassable('enemy', 5, 4)).toBe(false);

            // Cells outside radius are passable for both.
            expect(nav.isPassable('default', 3, 3)).toBe(true);
            expect(nav.isPassable('enemy', 3, 3)).toBe(true);
        });

        it('navEpoch bumps when crystal is added', () => {
            const startEpoch = terrainManager.navEpoch;
            engine.state.specialTileManager.addSpecialTile({
                id: 'crystal_2',
                defId: 'Crystal',
                col: 7,
                row: 7,
                hp: 100,
                maxHp: 100,
                protectRadius: 1,
            });
            expect(terrainManager.navEpoch).toBe(startEpoch + 1);
        });

        it('navEpoch bumps when crystal is destroyed', () => {
            engine.state.specialTileManager.addSpecialTile({
                id: 'crystal_3',
                defId: 'Crystal',
                col: 8,
                row: 8,
                hp: 10,
                maxHp: 10,
                protectRadius: 1,
            });
            const afterAddEpoch = terrainManager.navEpoch;

            engine.state.specialTileManager.damageSpecialTile('crystal_3', 10);

            expect(terrainManager.navEpoch).toBe(afterAddEpoch + 1);
        });
    });

    describe('connected components', () => {
        it('cells in open field are in same component', () => {
            const nav = terrainManager.nav;
            const idx1 = 0; // (0, 0)
            const idx2 = 9 * 10 + 9; // (9, 9)
            expect(nav.sameComponent('default', idx1, idx2)).toBe(true);
        });

        it('cells separated by wall are not in same component', () => {
            // Create a vertical wall of rocks at column 5.
            for (let row = 0; row < 10; row++) {
                terrainGrid.set(5, row, TerrainType.Rock);
            }
            terrainManager.clearPathCache();

            const nav = terrainManager.nav;
            const leftIdx = 4; // (4, 0) — left of wall.
            const rightIdx = 6; // (6, 0) — right of wall.
            expect(nav.sameComponent('default', leftIdx, rightIdx)).toBe(false);
        });

        it('destroying a wall cell rejoins components', () => {
            // Create a vertical wall of rocks at column 5.
            for (let row = 0; row < 10; row++) {
                terrainGrid.set(5, row, TerrainType.Rock);
            }
            terrainManager.clearPathCache();

            const nav1 = terrainManager.nav;
            const leftIdx = 4; // (4, 0)
            const rightIdx = 6; // (6, 0)
            expect(nav1.sameComponent('default', leftIdx, rightIdx)).toBe(false);

            // Destroy one rock in the wall.
            terrainManager.damageRock(5, 5, 10000);

            const nav2 = terrainManager.nav;
            expect(nav2.sameComponent('default', leftIdx, rightIdx)).toBe(true);
        });

        it('a diagonal squeeze between two rocks does not connect regions', () => {
            // Wall at column 5 with a gap at row 4, and a wall at column 4 below it, so the only
            // link between the two sides is the diagonal step (4,4) -> (5,5)... which is blocked
            // by the corner rule because (5,4) and (4,5) are rock.
            for (let row = 0; row < 10; row++) {
                terrainGrid.set(5, row, TerrainType.Rock);
            }
            terrainGrid.set(5, 5, TerrainType.Grass);
            for (let row = 5; row < 10; row++) {
                terrainGrid.set(4, row, TerrainType.Rock);
            }
            terrainGrid.set(6, 5, TerrainType.Grass);
            terrainManager.clearPathCache();

            const nav = terrainManager.nav;
            const left = 4 * 10 + 4; // (4, 4)
            const pocket = 5 * 10 + 5; // (5, 5): reachable from the left only by squeezing diagonally
            const right = 5 * 10 + 6; // (6, 5)
            expect(nav.sameComponent('default', pocket, right)).toBe(true);
            expect(nav.sameComponent('default', left, pocket)).toBe(false);
        });

        it('incremental flush of one dirty cell equals a full rebuild', () => {
            void terrainManager.nav; // build once so the rock below is an incremental update
            terrainManager.createOrMarkRock(3, 6);
            const incremental = terrainManager.nav;
            const full = new NavGrid(terrainManager, () => engine.state.specialTileManager.getCrystalProtectionMap());
            full.flush();

            for (const profile of ['default', 'enemy'] as const) {
                for (let idx = 0; idx < 100; idx++) {
                    expect(incremental.isPassableIdx(profile, idx)).toBe(full.isPassableIdx(profile, idx));
                    expect(incremental.stepCost(profile, idx)).toBe(full.stepCost(profile, idx));
                }
            }
            expect(incremental.isPassable('default', 3, 6)).toBe(false);
        });

        it('out-of-bounds cells are never in same component', () => {
            const nav = terrainManager.nav;
            const validIdx = 0; // (0, 0)
            const outOfBoundsIdx = 10 * 10 + 1; // Beyond grid.
            expect(nav.sameComponent('default', validIdx, outOfBoundsIdx)).toBe(false);
        });
    });

    describe('dirty cell tracking and flush', () => {
        it('markDirty invalidates component labels', () => {
            const nav = terrainManager.nav;
            // Access once to populate cache.
            expect(nav.isPassable('default', 0, 0)).toBe(true);

            // Dirty a cell.
            nav.markDirty(5, 5);

            // Marking dirty should have cleared component labels internally.
            // After flush, the new state should be available.
            nav.flush();
            expect(nav.isPassable('default', 5, 5)).toBe(true);
        });

        it('markAllDirty marks entire grid as needing rebuild', () => {
            const nav = terrainManager.nav;
            nav.markAllDirty();
            nav.flush();
            // Should complete without errors.
            expect(nav.isPassable('default', 0, 0)).toBe(true);
        });

        it('flush after marking dirty updates cell state', () => {
            const nav1 = terrainManager.nav;
            expect(nav1.isPassable('default', 2, 2)).toBe(true);

            // Modify terrain directly.
            terrainGrid.set(2, 2, TerrainType.Rock);

            // Manually mark dirty and flush (normally done via notifyNavChanged).
            nav1.markDirty(2, 2);
            nav1.flush();

            expect(nav1.isPassable('default', 2, 2)).toBe(false);
        });
    });

    describe('lazy NavGrid creation', () => {
        it('NavGrid is lazily created on first access', () => {
            // Before accessing nav, _nav should not exist yet (but we can't test private fields directly).
            // After accessing nav, it should exist and be flushed.
            const nav = terrainManager.nav;
            expect(nav).toBeDefined();
            expect(nav.isPassable('default', 0, 0)).toBe(true);
        });

        it('serializenavEpoch is included in toJSON', () => {
            // Create a rock to bump epoch.
            terrainManager.createOrMarkRock(3, 3);
            const expectedEpoch = terrainManager.navEpoch;

            // Serialize.
            const saved = engine.toJSON();
            expect(saved.navEpoch).toBe(expectedEpoch);
        });

        it('markNavDirty marks all cells dirty without bumping epoch', () => {
            const startEpoch = terrainManager.navEpoch;
            terrainManager.markNavDirty();
            expect(terrainManager.navEpoch).toBe(startEpoch);
        });
    });

    describe('isPassableIdx public method', () => {
        it('isPassableIdx works for valid cells', () => {
            const nav = terrainManager.nav;
            const idx = 5 * 10 + 5; // (5, 5)
            expect(nav.isPassableIdx('default', idx)).toBe(true);

            terrainGrid.set(5, 5, TerrainType.Rock);
            terrainManager.clearPathCache();
            expect(terrainManager.nav.isPassableIdx('default', idx)).toBe(false);
        });

        it('isPassableIdx returns false for out-of-bounds', () => {
            const nav = terrainManager.nav;
            expect(nav.isPassableIdx('default', -1)).toBe(false);
            expect(nav.isPassableIdx('default', 100)).toBe(false);
        });
    });
});

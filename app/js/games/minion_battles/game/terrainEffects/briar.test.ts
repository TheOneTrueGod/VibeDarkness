/**
 * Briar (destructible vine wall) and Tangle (what it leaves, worn away by projectiles). See
 * `terrain/durableTerrain.ts` and "Durable terrain" in `terrain/AGENTS.md`.
 */
import { describe, expect, it } from 'vitest';
import { TerrainManager } from '../../terrain/TerrainManager';
import { TerrainGrid, CELL_SIZE } from '../../terrain/TerrainGrid';
import {
    BRIAR_HEALTH,
    TANGLE_PROJECTILE_HITS,
    TANGLE_SPEED_MULTIPLIER,
    TERRAIN_PROPERTIES,
    TerrainType,
    baseTerrainOf,
} from '../../terrain/TerrainType';
import { TerrainLayerManager } from '../TerrainLayerManager';
import { Projectile } from '../projectiles/Projectile';

function makeManager(): { tm: TerrainManager; layers: TerrainLayerManager } {
    const grid = TerrainGrid.createFilledTerrain(6, 6, CELL_SIZE, TerrainType.Grass);
    grid.set(5, 5, TerrainType.Rock);
    grid.set(4, 5, TerrainType.Water);
    const tm = new TerrainManager(grid);
    const layers = new TerrainLayerManager();
    tm.setTerrainLayers(layers);
    return { tm, layers };
}

const centre = (col: number, row: number) => ({ x: col * CELL_SIZE + CELL_SIZE / 2, y: row * CELL_SIZE + CELL_SIZE / 2 });

describe('Briar', () => {
    it('blocks movement and projectiles, and has health', () => {
        const { tm } = makeManager();
        expect(tm.placeBriar([{ col: 2, row: 2 }])).toEqual([{ col: 2, row: 2 }]);
        const c = centre(2, 2);
        expect(tm.getEffectiveTerrainType(2, 2)).toBe(TerrainType.Briar);
        expect(tm.isPassable(c.x, c.y)).toBe(false);
        expect(tm.isProjectileObstructedAt(c.x, c.y)).toBe(true);
        expect(tm.getDurableTerrainHealth(2, 2)).toBe(BRIAR_HEALTH);
    });

    it('pathfinding routes around it', () => {
        const grid = TerrainGrid.createFilledTerrain(5, 3, CELL_SIZE, TerrainType.Grass);
        const tm = new TerrainManager(grid);
        tm.setTerrainLayers(new TerrainLayerManager());
        tm.placeBriar([0, 1, 2, 3].map((col) => ({ col, row: 1 })));
        const path = tm.findGridPath(0, 0, 0, 2);
        expect(path).not.toBeNull();
        expect(path!.some((cell) => cell.row === 1 && cell.col < 4)).toBe(false);
    });

    it('skips rock, water, off-grid tiles and existing Briar', () => {
        const { tm } = makeManager();
        const placed = tm.placeBriar([
            { col: 5, row: 5 },
            { col: 4, row: 5 },
            { col: -1, row: 0 },
            { col: 1, row: 1 },
            { col: 1, row: 1 },
        ]);
        expect(placed).toEqual([{ col: 1, row: 1 }]);
        expect(tm.getEffectiveTerrainType(5, 5)).toBe(TerrainType.Rock);
        expect(tm.getEffectiveTerrainType(4, 5)).toBe(TerrainType.Water);
    });

    it('is damaged, and becomes Tangle when destroyed', () => {
        const { tm } = makeManager();
        tm.placeBriar([{ col: 2, row: 2 }]);
        const hurt = tm.damageDurableTerrain(2, 2, 10, 'u');
        expect(hurt).toMatchObject({ typeChanged: false, health: BRIAR_HEALTH - 10, previousHealth: BRIAR_HEALTH });
        expect(tm.getEffectiveTerrainType(2, 2)).toBe(TerrainType.Briar);

        const killed = tm.damageDurableTerrain(2, 2, BRIAR_HEALTH, 'u');
        expect(killed).toMatchObject({ typeChanged: true, terrainType: TerrainType.Tangle, health: 0 });
        expect(tm.getEffectiveTerrainType(2, 2)).toBe(TerrainType.Tangle);
        const c = centre(2, 2);
        expect(tm.isPassable(c.x, c.y)).toBe(true);
    });

    it('damage by hits breaks it after that many hits from full health', () => {
        const { tm } = makeManager();
        tm.placeBriar([{ col: 2, row: 2 }]);
        tm.damageDurableTerrainByHits(2, 2, 3);
        tm.damageDurableTerrainByHits(2, 2, 3);
        expect(tm.getEffectiveTerrainType(2, 2)).toBe(TerrainType.Briar);
        tm.damageDurableTerrainByHits(2, 2, 3);
        expect(tm.getEffectiveTerrainType(2, 2)).toBe(TerrainType.Tangle);
    });

    it('ignores non-durable tiles', () => {
        const { tm } = makeManager();
        expect(tm.damageDurableTerrain(1, 1, 50)).toBeNull();
        expect(tm.wearTerrainByProjectile(1, 1)).toBeNull();
    });

    it('bumps navEpoch when placed and when destroyed', () => {
        const { tm } = makeManager();
        const e0 = tm.navEpoch;
        tm.placeBriar([{ col: 2, row: 2 }]);
        const e1 = tm.navEpoch;
        expect(e1).toBeGreaterThan(e0);
        tm.damageDurableTerrain(2, 2, 1);
        expect(tm.navEpoch).toBe(e1);
        tm.damageDurableTerrain(2, 2, BRIAR_HEALTH);
        expect(tm.navEpoch).toBeGreaterThan(e1);
    });

    it('health and wear round-trip through the floor tile serialization', () => {
        const { tm, layers } = makeManager();
        tm.placeBriar([{ col: 2, row: 2 }, { col: 3, row: 3 }]);
        tm.damageDurableTerrain(2, 2, 12);
        tm.damageDurableTerrain(3, 3, BRIAR_HEALTH);
        tm.wearTerrainByProjectile(3, 3);

        const restored = TerrainLayerManager.fromJSON([], layers.toFloorTilesJSON());
        const tm2 = new TerrainManager(TerrainGrid.createFilledTerrain(6, 6, CELL_SIZE, TerrainType.Grass));
        tm2.setTerrainLayers(restored);
        expect(tm2.getEffectiveTerrainType(2, 2)).toBe(TerrainType.Briar);
        expect(tm2.getDurableTerrainHealth(2, 2)).toBe(BRIAR_HEALTH - 12);
        expect(tm2.getEffectiveTerrainType(3, 3)).toBe(TerrainType.Tangle);
        expect(tm2.getTerrainWearRemaining(3, 3)).toBe(TANGLE_PROJECTILE_HITS - 1);
    });
});

describe('Tangle', () => {
    it('is a much slower Thick Grass variant that stops projectiles', () => {
        expect(baseTerrainOf(TerrainType.Tangle)).toBe(TerrainType.ThickGrass);
        expect(TERRAIN_PROPERTIES[TerrainType.Tangle].blocksProjectiles).toBe(true);
        expect(TANGLE_SPEED_MULTIPLIER).toBeLessThan(TERRAIN_PROPERTIES[TerrainType.ThickGrass].speedMultiplier / 2);

        const { tm } = makeManager();
        tm.placeBriar([{ col: 2, row: 2 }]);
        tm.damageDurableTerrain(2, 2, BRIAR_HEALTH);
        const c = centre(2, 2);
        expect(tm.getSpeedMultiplier(c.x, c.y)).toBe(TANGLE_SPEED_MULTIPLIER);
        expect(tm.getSpeedMultiplier(centre(0, 0).x, centre(0, 0).y)).toBe(1);
        expect(tm.isProjectileObstructedAt(c.x, c.y)).toBe(true);
    });

    it('becomes Grass after three stopped projectiles', () => {
        const { tm } = makeManager();
        tm.placeBriar([{ col: 2, row: 2 }]);
        tm.damageDurableTerrain(2, 2, BRIAR_HEALTH);
        expect(tm.getTerrainWearRemaining(2, 2)).toBe(TANGLE_PROJECTILE_HITS);

        tm.wearTerrainByProjectile(2, 2);
        tm.wearTerrainByProjectile(2, 2);
        expect(tm.getEffectiveTerrainType(2, 2)).toBe(TerrainType.Tangle);
        const last = tm.wearTerrainByProjectile(2, 2);
        expect(last).toMatchObject({ typeChanged: true, terrainType: TerrainType.Grass });
        expect(tm.getEffectiveTerrainType(2, 2)).toBe(TerrainType.Grass);
        const c = centre(2, 2);
        expect(tm.isProjectileObstructedAt(c.x, c.y)).toBe(false);
    });

    it('wears when a real projectile is stopped by it', () => {
        const { tm } = makeManager();
        tm.placeBriar([{ col: 3, row: 2 }]);
        tm.damageDurableTerrain(3, 2, BRIAR_HEALTH);
        const start = centre(0, 2);
        for (let i = 0; i < TANGLE_PROJECTILE_HITS; i++) {
            expect(tm.getEffectiveTerrainType(3, 2)).toBe(TerrainType.Tangle);
            const shot = new Projectile({
                x: start.x,
                y: start.y,
                velocityX: 400,
                velocityY: 0,
                damage: 0,
                sourceTeamId: 'player',
                sourceUnitId: 'u',
                sourceAbilityId: 'test',
                maxDistance: 1000,
                modifiers: ['stopsAtWalls'],
            });
            shot.update(0.5, { terrainManager: tm });
            expect(shot.active).toBe(false);
        }
        expect(tm.getEffectiveTerrainType(3, 2)).toBe(TerrainType.Grass);
    });
});

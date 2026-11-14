/**
 * Brick (a gated Rock variant): blocks like Rock for everyone, but only units with `'brick'` terrain
 * access may damage it, shape it or count it as stone. See "Terrain variants" in `terrain/AGENTS.md`.
 */
import { describe, expect, it, vi } from 'vitest';
import { TerrainManager } from './TerrainManager';
import { TerrainGrid, CELL_SIZE } from './TerrainGrid';
import { TerrainType, type TerrainAccessId } from './TerrainType';
import { DAMAGE_TIER_NONE, isOnStone } from './FloorTile';
import { TerrainLayerManager } from '../game/TerrainLayerManager';
import { EARTH_CORE_STONE_HEALTH } from '../card_defs/05_earth_core/earthCoreConstants';
import { isUnitOnStone } from '../abilities/earthCoreHelpers';
import { Projectile } from '../game/projectiles/Projectile';
import { EventBus } from '../game/EventBus';
import { Unit } from '../game/units/Unit';
import { GameEngine } from '../game/GameEngine';
import {
    buildTinyBattleEngine,
    spawnTinyPlayerUnit,
    TINY_BATTLE_PLAYER_ID,
} from '../testing/harness/buildTinyBattleEngine';

const BRICK_ACCESS: ReadonlySet<TerrainAccessId> = new Set(['brick']);
const MASON = 'mason';
const NOVICE = 'novice';

/** 5x5 grass with Brick at (2, 2) and Rock at (4, 4). `mason` holds brick access; `novice` does not. */
function makeManager(): TerrainManager {
    const grid = TerrainGrid.createFilledTerrain(5, 5, CELL_SIZE, TerrainType.Grass);
    grid.set(2, 2, TerrainType.Brick);
    grid.set(4, 4, TerrainType.Rock);
    const manager = new TerrainManager(grid);
    manager.setTerrainLayers(new TerrainLayerManager());
    manager.setTerrainAccessResolver((id) => (id === MASON ? BRICK_ACCESS : id === NOVICE ? new Set() : null));
    return manager;
}

const centre = (col: number, row: number) => ({ x: col * CELL_SIZE + CELL_SIZE / 2, y: row * CELL_SIZE + CELL_SIZE / 2 });

describe('Brick blocks like Rock', () => {
    it('blocks walking, projectiles, vision and light, and counts as intact rock', () => {
        const tm = makeManager();
        const c = centre(2, 2);
        expect(tm.isPassable(c.x, c.y)).toBe(false);
        expect(tm.isForcedMovementPassable(c.x, c.y)).toBe(false);
        expect(tm.isProjectileObstructedAt(c.x, c.y)).toBe(true);
        expect(tm.blocksVisionAt(2, 2)).toBe(true);
        expect(tm.blocksLightAt(2, 2)).toBe(true);
        expect(tm.isIntactRockAt(2, 2)).toBe(true);
    });

    it('pathfinding routes around it', () => {
        const grid = TerrainGrid.createFilledTerrain(5, 3, CELL_SIZE, TerrainType.Grass);
        for (let col = 0; col < 5; col++) grid.set(col, 1, TerrainType.Brick);
        grid.set(4, 1, TerrainType.Grass);
        const tm = new TerrainManager(grid);
        tm.setTerrainLayers(new TerrainLayerManager());
        const path = tm.findGridPath(0, 0, 0, 2);
        expect(path).not.toBeNull();
        expect(path!.some((cell) => cell.row === 1 && cell.col < 4)).toBe(false);
    });

    it('a projectile colliding with [Rock] stops at Brick', () => {
        const grid = TerrainGrid.createFilledTerrain(10, 1, 10, TerrainType.Grass);
        grid.set(5, 0, TerrainType.Brick);
        const tm = new TerrainManager(grid);
        const proj = new Projectile({
            x: 5,
            y: 5,
            velocityX: 300,
            velocityY: 0,
            damage: 0,
            sourceTeamId: 'player',
            sourceUnitId: NOVICE,
            sourceAbilityId: 'test',
            maxDistance: 1000,
            collidesWithTerrain: [TerrainType.Rock],
        });
        proj.update(0.5, { terrainManager: tm });
        expect(proj.active).toBe(false);
        expect(proj.stoppedAtTerrain).toMatchObject({ col: 5, row: 0, terrainType: TerrainType.Brick });
    });

    it('stonephase passes Brick only for a shooter with access', () => {
        const fire = (sourceUnitId: string) => {
            const grid = TerrainGrid.createFilledTerrain(20, 1, 10, TerrainType.Grass);
            grid.set(5, 0, TerrainType.Brick);
            const tm = new TerrainManager(grid);
            tm.setTerrainAccessResolver((id) => (id === MASON ? BRICK_ACCESS : null));
            const proj = new Projectile({
                x: 5,
                y: 5,
                velocityX: 100,
                velocityY: 0,
                damage: 0,
                sourceTeamId: 'player',
                sourceUnitId,
                sourceAbilityId: 'test',
                maxDistance: 1000,
                modifiers: ['stonephase', 'stopsAtWalls'],
            });
            proj.update(1, { terrainManager: tm });
            return proj;
        };
        expect(fire(NOVICE).x).toBeLessThan(50);
        expect(fire(MASON).x).toBeGreaterThan(60);
    });
});

describe('Brick without access', () => {
    it('damageRock / damageRockByHits / destroyRock do nothing, with a source or without one', () => {
        const tm = makeManager();
        const emitter = vi.fn();
        tm.setStoneDamagedEmitter(emitter);

        expect(tm.damageRock(2, 2, EARTH_CORE_STONE_HEALTH, NOVICE)).toBeNull();
        expect(tm.damageRock(2, 2, EARTH_CORE_STONE_HEALTH)).toBeNull();
        expect(tm.damageRock(2, 2, EARTH_CORE_STONE_HEALTH, 'unknown_unit')).toBeNull();
        expect(tm.damageRockByHits(2, 2, 1, NOVICE)).toBeNull();
        expect(tm.destroyRock(2, 2, NOVICE)).toBeNull();
        expect(tm.destroyRock(2, 2)).toBeNull();
        expect(tm.createOrMarkRock(2, 2, EARTH_CORE_STONE_HEALTH, NOVICE)).toBeNull();

        expect(emitter).not.toHaveBeenCalled();
        expect(tm.getEffectiveTerrainType(2, 2)).toBe(TerrainType.Brick);
        expect(tm.getRockHealth(2, 2)).toBe(EARTH_CORE_STONE_HEALTH);
        expect(tm.canSourceAffectRockAt(2, 2, NOVICE)).toBe(false);
        expect(tm.canSourceAffectRockAt(2, 2, null)).toBe(false);
    });

    it('consumeRockInRadius skips Brick and takes the plain Rock instead', () => {
        const tm = makeManager();
        const event = tm.consumeRockInRadius(2, 2, 10, NOVICE);
        expect(event).toMatchObject({ col: 4, row: 4, previousTerrainType: TerrainType.Rock });
        expect(tm.getEffectiveTerrainType(2, 2)).toBe(TerrainType.Brick);
    });

    it('does not count as stone', () => {
        expect(isOnStone(TerrainType.Brick, undefined)).toBe(false);
        expect(isOnStone(TerrainType.Brick, undefined, new Set())).toBe(false);
        expect(isOnStone(TerrainType.Rock, undefined)).toBe(true);
        const tm = makeManager();
        expect(isUnitOnStone(tm, centre(2, 2))).toBe(false);
        expect(isUnitOnStone(tm, { ...centre(2, 2), terrainAccess: new Set() })).toBe(false);
    });
});

describe('Brick with access', () => {
    it('counts as stone', () => {
        expect(isOnStone(TerrainType.Brick, undefined, BRICK_ACCESS)).toBe(true);
        const tm = makeManager();
        expect(isUnitOnStone(tm, { ...centre(2, 2), terrainAccess: BRICK_ACCESS })).toBe(true);
    });

    it('chips through the crack tiers as Brick, then breaks into Gravel', () => {
        const tm = makeManager();
        const emitter = vi.fn();
        tm.setStoneDamagedEmitter(emitter);
        const quarter = EARTH_CORE_STONE_HEALTH / 4;

        const first = tm.damageRock(2, 2, quarter, MASON);
        expect(first).toMatchObject({ previousTerrainType: TerrainType.Brick, terrainType: TerrainType.Brick, tier: 1 });
        expect(tm.getEffectiveTerrainType(2, 2)).toBe(TerrainType.Brick);
        expect(tm.getRockHealth(2, 2)).toBe(EARTH_CORE_STONE_HEALTH - quarter);

        // Once the floor tile exists, a source-less hit is still refused.
        expect(tm.damageRock(2, 2, quarter)).toBeNull();
        expect(tm.getRockHealth(2, 2)).toBe(EARTH_CORE_STONE_HEALTH - quarter);

        expect(tm.damageRock(2, 2, quarter, MASON)).toMatchObject({ terrainType: TerrainType.Brick, tier: 2 });
        expect(tm.damageRock(2, 2, quarter, MASON)).toMatchObject({ terrainType: TerrainType.Brick, tier: 3 });
        const last = tm.damageRock(2, 2, quarter, MASON);
        expect(last).toMatchObject({
            previousTerrainType: TerrainType.Brick,
            terrainType: TerrainType.Gravel,
            health: 0,
            tier: DAMAGE_TIER_NONE,
            sourceUnitId: MASON,
        });
        expect(tm.getEffectiveTerrainType(2, 2)).toBe(TerrainType.Gravel);
        expect(tm.isPassable(centre(2, 2).x, centre(2, 2).y)).toBe(true);
        expect(emitter).toHaveBeenCalledTimes(4);
    });

    it('damageRockByHits breaks Brick in the given number of hits', () => {
        const tm = makeManager();
        expect(tm.damageRockByHits(2, 2, 2, MASON)?.terrainType).toBe(TerrainType.Brick);
        expect(tm.damageRockByHits(2, 2, 2, MASON)?.terrainType).toBe(TerrainType.Gravel);
    });

    it('createOrMarkRock on Brick re-marks it as Brick at full health', () => {
        const tm = makeManager();
        tm.damageRock(2, 2, EARTH_CORE_STONE_HEALTH / 2, MASON);
        const tile = tm.createOrMarkRock(2, 2, EARTH_CORE_STONE_HEALTH, MASON);
        expect(tile?.terrainType).toBe(TerrainType.Brick);
        expect(tm.getEffectiveTerrainType(2, 2)).toBe(TerrainType.Brick);
        expect(tm.getRockHealth(2, 2)).toBe(EARTH_CORE_STONE_HEALTH);
    });

    it('destroyRock breaks Brick into Gravel', () => {
        const tm = makeManager();
        expect(tm.destroyRock(2, 2, MASON)).toMatchObject({
            previousTerrainType: TerrainType.Brick,
            terrainType: TerrainType.Gravel,
        });
    });
});

describe('Unit.terrainAccess', () => {
    it('defaults to empty, is granted per unit, and is omitted from JSON when empty', () => {
        const unit = new Unit({
            id: 'u1', x: 0, y: 0, hp: 10, maxHp: 10, speed: 1, teamId: 'player', ownerId: 'p1',
            characterId: 'player', name: 'U', abilities: [],
        });
        expect(unit.terrainAccess.size).toBe(0);
        expect(unit.hasTerrainAccess('brick')).toBe(false);
        expect('terrainAccess' in unit.toJSON()).toBe(false);

        unit.grantTerrainAccess('brick');
        expect(unit.hasTerrainAccess('brick')).toBe(true);
        const json = JSON.parse(JSON.stringify(unit.toJSON())) as Record<string, unknown>;
        expect(json.terrainAccess).toEqual(['brick']);
        const restored = Unit.fromJSON(json, new EventBus());
        expect(restored.hasTerrainAccess('brick')).toBe(true);
    });

    it('the engine resolves a unit\'s access for TerrainManager, and it survives a checkpoint round trip', () => {
        const engine = buildTinyBattleEngine({ gridW: 5, gridH: 5, localPlayerId: TINY_BATTLE_PLAYER_ID });
        engine.terrainManager!.grid.set(2, 2, TerrainType.Brick);
        const mason = spawnTinyPlayerUnit(engine, {
            playerId: TINY_BATTLE_PLAYER_ID, x: 20, y: 20, abilities: [], terrainAccess: ['brick'],
        });
        const novice = spawnTinyPlayerUnit(engine, { playerId: 'tiny_p2', x: 180, y: 180, abilities: [] });
        expect(engine.terrainManager!.canSourceAffectRockAt(2, 2, mason.id)).toBe(true);
        expect(engine.terrainManager!.canSourceAffectRockAt(2, 2, novice.id)).toBe(false);
        engine.terrainManager!.damageRock(2, 2, EARTH_CORE_STONE_HEALTH / 2, mason.id);

        const grid = TerrainGrid.createFilledTerrain(5, 5, CELL_SIZE, TerrainType.Grass);
        grid.set(2, 2, TerrainType.Brick);
        const restored = GameEngine.fromJSON(
            JSON.parse(JSON.stringify(engine.toJSON())),
            TINY_BATTLE_PLAYER_ID,
            new TerrainManager(grid),
        );
        const restoredMason = restored.getUnit(mason.id)!;
        expect(restoredMason.hasTerrainAccess('brick')).toBe(true);
        expect(restored.getUnit(novice.id)!.terrainAccess.size).toBe(0);
        const tm = restored.terrainManager!;
        expect(tm.getEffectiveTerrainType(2, 2)).toBe(TerrainType.Brick);
        expect(tm.getRockHealth(2, 2)).toBe(EARTH_CORE_STONE_HEALTH / 2);
        expect(tm.destroyRock(2, 2, novice.id)).toBeNull();
        expect(tm.destroyRock(2, 2, mason.id)?.terrainType).toBe(TerrainType.Gravel);
    });
});

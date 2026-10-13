/**
 * Projectile tests: toJSON round-trip (saveable properties, held state, hit sets), held-projectile
 * lifecycle (hold, release, cancel, orphan limit) and terrain distance accounting.
 */
import { describe, it, expect, vi } from 'vitest';
import { Projectile, hitPolicyFromLegacyOptions } from './Projectile';
import { TerrainGrid } from '../../terrain/TerrainGrid';
import { TerrainType } from '../../terrain/TerrainType';
import { TerrainManager } from '../../terrain/TerrainManager';
import { MAX_HELD_PROJECTILE_SECONDS } from '../gameConstants';
import type { Unit } from '../units/Unit';
import { EventBus as RealEventBus, type EventBus } from '../EventBus';
import { TerrainLayerManager, type TerrainEffectRecord } from '../TerrainLayerManager';
import { TERRAIN_CLEARS } from '../terrainEffects/terrainClearing';

/** Minimal unit stand-in: only the members Projectile.checkCollision reads. */
function makeUnit(id: string, x: number, y: number) {
    return {
        id,
        x,
        y,
        radius: 10,
        teamId: 'enemy',
        isAlive: () => true,
        hasIFrames: () => false,
        takeDamage: vi.fn(),
    };
}

const eventBus = { emit: vi.fn() } as unknown as EventBus;

describe('Projectile', () => {
    it('serializes and restores to an equivalent object', () => {
        const proj = new Projectile({
            id: 'proj_1',
            x: 200,
            y: 300,
            velocityX: 400,
            velocityY: 0,
            damage: 25,
            sourceTeamId: 'player',
            sourceUnitId: 'unit_1',
            sourceAbilityId: 'throw_knife',
            maxDistance: 500,
        });
        proj.active = true;
        proj.distanceTraveled = 100;
        proj.radius = 5;

        const json = proj.toJSON();
        const restored = Projectile.fromJSON(json);

        expect(restored.id).toBe(proj.id);
        expect(restored.x).toBe(proj.x);
        expect(restored.y).toBe(proj.y);
        expect(restored.active).toBe(proj.active);
        expect(restored.velocityX).toBe(proj.velocityX);
        expect(restored.velocityY).toBe(proj.velocityY);
        expect(restored.damage).toBe(proj.damage);
        expect(restored.sourceTeamId).toBe(proj.sourceTeamId);
        expect(restored.sourceUnitId).toBe(proj.sourceUnitId);
        expect(restored.sourceAbilityId).toBe(proj.sourceAbilityId);
        expect(restored.maxDistance).toBe(proj.maxDistance);
        expect(restored.distanceTraveled).toBe(proj.distanceTraveled);
        expect(restored.radius).toBe(proj.radius);
    });

    it('normal projectile consumes distance while traveling through rock', () => {
        const terrainGrid = TerrainGrid.createFilledTerrain(5, 1, 10, TerrainType.Grass);
        terrainGrid.set(1, 0, TerrainType.Rock);
        terrainGrid.set(2, 0, TerrainType.Rock);
        const terrainManager = new TerrainManager(terrainGrid);

        const proj = new Projectile({
            x: 5,
            y: 5,
            velocityX: 20,
            velocityY: 0,
            damage: 10,
            sourceTeamId: 'player',
            sourceUnitId: 'unit_1',
            sourceAbilityId: 'throw_rock',
            maxDistance: 100,
        });

        proj.update(1, { terrainManager });

        expect(proj.distanceTraveled).toBeCloseTo(20, 5);
    });

    it('stonephase projectile preserves range while traveling through rock', () => {
        const terrainGrid = TerrainGrid.createFilledTerrain(5, 1, 10, TerrainType.Grass);
        terrainGrid.set(0, 0, TerrainType.Rock);
        terrainGrid.set(1, 0, TerrainType.Rock);
        terrainGrid.set(2, 0, TerrainType.Rock);
        const terrainManager = new TerrainManager(terrainGrid);

        const proj = new Projectile({
            x: 5,
            y: 5,
            velocityX: 20,
            velocityY: 0,
            damage: 10,
            sourceTeamId: 'player',
            sourceUnitId: 'unit_1',
            sourceAbilityId: 'throw_rock',
            maxDistance: 100,
            modifiers: ['stonephase'],
        });

        proj.update(1, { terrainManager });

        expect(proj.distanceTraveled).toBeCloseTo(0, 5);
    });

    it('stonephase mixed path counts air distance but excludes rock distance', () => {
        const terrainGrid = TerrainGrid.createFilledTerrain(10, 1, 10, TerrainType.Grass);
        terrainGrid.set(2, 0, TerrainType.Rock);
        terrainGrid.set(3, 0, TerrainType.Rock);
        const terrainManager = new TerrainManager(terrainGrid);

        const proj = new Projectile({
            x: 5,
            y: 5,
            velocityX: 40,
            velocityY: 0,
            damage: 10,
            sourceTeamId: 'player',
            sourceUnitId: 'unit_1',
            sourceAbilityId: 'throw_rock',
            maxDistance: 100,
            modifiers: ['stonephase'],
        });

        proj.update(1, { terrainManager });

        expect(proj.distanceTraveled).toBeCloseTo(20, 5);
    });

    it('held projectile round-trips its holder and held time through JSON', () => {
        const proj = new Projectile({
            x: 100,
            y: 100,
            velocityX: 0,
            velocityY: 0,
            damage: 10,
            sourceTeamId: 'player',
            sourceUnitId: 'caster_1',
            sourceAbilityId: 'rock_slide',
            maxDistance: 500,
            heldBy: { unitId: 'caster_1', abilityId: 'rock_slide' },
        });
        proj.update(0.5, {});

        const restored = Projectile.fromJSON(JSON.parse(JSON.stringify(proj.toJSON())));

        expect(restored.isHeld).toBe(true);
        expect(restored.heldBy).toEqual({ unitId: 'caster_1', abilityId: 'rock_slide' });
        expect(restored.heldTime).toBeCloseTo(0.5, 5);
    });

    it('a unit already hit before a checkpoint is not hit again after fromJSON', () => {
        const unit = makeUnit('enemy_1', 110, 100);
        const proj = new Projectile({
            id: 'proj_hits',
            x: 100,
            y: 100,
            velocityX: 0,
            velocityY: 0,
            damage: 10,
            sourceTeamId: 'player',
            sourceUnitId: 'caster_1',
            sourceAbilityId: 'throw_rock',
            maxDistance: 500,
            pierce: 1,
        });
        proj.checkCollision([unit as unknown as Unit], eventBus, 0);
        expect(unit.takeDamage).toHaveBeenCalledTimes(1);

        const restored = Projectile.fromJSON(JSON.parse(JSON.stringify(proj.toJSON())));
        expect(restored.hitUnitIds.has('enemy_1')).toBe(true);

        restored.checkCollision([unit as unknown as Unit], eventBus, 0);
        expect(unit.takeDamage).toHaveBeenCalledTimes(1);
    });
});

describe('held projectiles', () => {
    it('a held projectile does not move or hit until released', () => {
        const proj = new Projectile({
            x: 100,
            y: 100,
            velocityX: 600,
            velocityY: 0,
            damage: 10,
            sourceTeamId: 'player',
            sourceUnitId: 'caster_1',
            sourceAbilityId: 'rock_slide',
            maxDistance: 500,
            heldBy: { unitId: 'caster_1', abilityId: 'rock_slide' },
        });
        const unit = makeUnit('enemy_1', 110, 100);

        expect(proj.isHeld).toBe(true);
        proj.update(1 / 60, {});
        expect(proj.x).toBe(100);
        expect(proj.distanceTraveled).toBe(0);
        expect(proj.checkCollision([unit as unknown as Unit], eventBus, 0)).toBeNull();
        expect(unit.takeDamage).not.toHaveBeenCalled();
    });

    it('release launches the projectile, which then moves and hits', () => {
        const proj = new Projectile({
            x: 100,
            y: 100,
            velocityX: 600,
            velocityY: 0,
            damage: 10,
            sourceTeamId: 'player',
            sourceUnitId: 'caster_1',
            sourceAbilityId: 'rock_slide',
            maxDistance: 500,
            heldBy: { unitId: 'caster_1', abilityId: 'rock_slide' },
        });
        const unit = makeUnit('enemy_1', 110, 100);

        proj.release(600, 0);
        expect(proj.isHeld).toBe(false);
        proj.update(1 / 60, {});
        expect(proj.x).toBeCloseTo(110, 5);

        const hit = proj.checkCollision([unit as unknown as Unit], eventBus, 0);
        expect(hit).toBe(unit);
        expect(unit.takeDamage).toHaveBeenCalledTimes(1);
    });

    it('cancelHeld deactivates the projectile without an expire effect', () => {
        const proj = new Projectile({
            x: 100,
            y: 100,
            velocityX: 600,
            velocityY: 0,
            damage: 10,
            sourceTeamId: 'player',
            sourceUnitId: 'caster_1',
            sourceAbilityId: 'rock_slide',
            maxDistance: 500,
            heldBy: { unitId: 'caster_1', abilityId: 'rock_slide' },
        });

        proj.cancelHeld();

        expect(proj.isHeld).toBe(false);
        expect(proj.active).toBe(false);
    });

    it('a held projectile past the limit is deleted with a warning naming the holder', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        try {
            const proj = new Projectile({
                x: 100,
                y: 100,
                velocityX: 600,
                velocityY: 0,
                damage: 10,
                sourceTeamId: 'player',
                sourceUnitId: 'caster_1',
                sourceAbilityId: 'rock_slide',
                maxDistance: 500,
                heldBy: { unitId: 'caster_1', abilityId: 'rock_slide' },
            });
            const engine = { gameTick: 42, gameTime: 7.5, getUnit: () => undefined };

            proj.update(MAX_HELD_PROJECTILE_SECONDS, engine);
            expect(proj.active).toBe(true);

            proj.update(1 / 60, engine);
            expect(proj.active).toBe(false);
            expect(warn).toHaveBeenCalledTimes(1);

            const [message, details] = warn.mock.calls[0];
            expect(String(message)).toContain('[Projectile] held projectile orphaned');
            expect(String(message)).toContain('caster_1');
            expect(String(message)).toContain('rock_slide');
            expect(details).toMatchObject({
                projectileId: proj.id,
                heldBy: { unitId: 'caster_1', abilityId: 'rock_slide' },
                holderExists: false,
                gameTick: 42,
            });
        } finally {
            warn.mockRestore();
        }
    });
});

describe('projectile wall stops and stonephase', () => {
    it('stopsAtWalls does not tunnel through a rock cell it crosses within a single update', () => {
        // Cells are 10px. Rock occupies x in [20, 30); the projectile starts at x=5 and moves 60px,
        // so its end point (x=65) is clear. A single end-point test would miss the wall.
        const grid = TerrainGrid.createFilledTerrain(10, 1, 10, TerrainType.Grass);
        grid.set(2, 0, TerrainType.Rock);
        const terrainManager = new TerrainManager(grid);

        const proj = new Projectile({
            x: 5,
            y: 5,
            velocityX: 600,
            velocityY: 0,
            damage: 10,
            sourceTeamId: 'player',
            sourceUnitId: 'unit_1',
            sourceAbilityId: 'rock_slide',
            maxDistance: 1000,
            modifiers: ['stopsAtWalls'],
        });

        proj.update(0.1, { terrainManager });

        expect(proj.active).toBe(false);
        expect(proj.x).toBeGreaterThanOrEqual(19 - 1e-6);
        expect(proj.x).toBeLessThan(20);
    });

    it('collidesWithTerrain stops at a listed terrain type without stopsAtWalls, and ignores unlisted ones', () => {
        const grid = TerrainGrid.createFilledTerrain(10, 1, 10, TerrainType.Grass);
        grid.set(2, 0, TerrainType.Rock);
        const terrainManager = new TerrainManager(grid);
        const make = (collidesWithTerrain: TerrainType[]) =>
            new Projectile({
                x: 5,
                y: 5,
                velocityX: 600,
                velocityY: 0,
                damage: 10,
                sourceTeamId: 'player',
                sourceUnitId: 'unit_1',
                sourceAbilityId: 'x',
                maxDistance: 1000,
                collidesWithTerrain,
            });

        const blocked = make([TerrainType.Rock]);
        blocked.update(0.1, { terrainManager });
        expect(blocked.active).toBe(false);
        expect(blocked.x).toBeLessThan(20);

        const free = make([TerrainType.Impassable]);
        free.update(0.1, { terrainManager });
        expect(free.active).toBe(true);
        expect(free.x).toBeCloseTo(65);

        const restored = Projectile.fromJSON(JSON.parse(JSON.stringify(blocked.toJSON())));
        expect(restored.collidesWithTerrain).toEqual([TerrainType.Rock]);
    });

    it('stonephase flies through rock and stops at the first Impassable cell it cannot cross', () => {
        // Rock at cols 2 and 3 (x in [20, 40)), Impassable at col 4 (x in [40, 50)).
        const grid = TerrainGrid.createFilledTerrain(10, 1, 10, TerrainType.Grass);
        grid.set(2, 0, TerrainType.Rock);
        grid.set(3, 0, TerrainType.Rock);
        grid.set(4, 0, TerrainType.Impassable);
        const terrainManager = new TerrainManager(grid);

        const proj = new Projectile({
            x: 5,
            y: 5,
            velocityX: 600,
            velocityY: 0,
            damage: 10,
            sourceTeamId: 'player',
            sourceUnitId: 'unit_1',
            sourceAbilityId: 'rock_slide',
            maxDistance: 1000,
            modifiers: ['stonephase', 'stopsAtWalls'],
        });

        proj.update(0.1, { terrainManager });

        expect(proj.active).toBe(false);
        expect(proj.x).toBeGreaterThanOrEqual(39 - 1e-6);
        expect(proj.x).toBeLessThan(40);
    });

    it('stonephase reaching max distance inside rock expires there', () => {
        // Cols 0-1 are grass (x < 20), everything from col 2 onward is rock. Only the grass part
        // counts toward distance, so 15px of grass exhausts maxDistance 15 at x = 35, inside rock.
        const grid = TerrainGrid.createFilledTerrain(20, 1, 10, TerrainType.Rock);
        grid.set(0, 0, TerrainType.Grass);
        grid.set(1, 0, TerrainType.Grass);
        const terrainManager = new TerrainManager(grid);

        const proj = new Projectile({
            x: 5,
            y: 5,
            velocityX: 300,
            velocityY: 0,
            damage: 10,
            sourceTeamId: 'player',
            sourceUnitId: 'unit_1',
            sourceAbilityId: 'rock_slide',
            maxDistance: 15,
            modifiers: ['stonephase', 'stopsAtWalls'],
        });

        proj.update(0.1, { terrainManager });

        expect(proj.active).toBe(false);
        expect(proj.x).toBeCloseTo(35, 5);
        expect(terrainManager.getProjectileTerrainAt(proj.x, proj.y)).toBe(TerrainType.Rock);
    });

    it('the stopsAtWalls modifier is passed through the constructor and the default hit policy is a single stop', () => {
        const proj = new Projectile({
            x: 0,
            y: 0,
            velocityX: 0,
            velocityY: 0,
            damage: 0,
            sourceTeamId: 'player',
            sourceUnitId: 'unit_1',
            sourceAbilityId: 'rock_slide',
            maxDistance: 100,
            modifiers: ['stopsAtWalls'],
        });

        expect(proj.modifiers).toEqual(['stopsAtWalls']);
        expect(proj.hitPolicy).toEqual({ damagingHits: 1, overflow: 'stop' });
    });

    it('legacy hit options map onto a hitPolicy', () => {
        expect(hitPolicyFromLegacyOptions({ pierce: 4, knockbackBeyondMaxHits: true, continueAfterMaxHits: true, knockbackTier: 2, knockbackMode: 'side45' })).toEqual({
            damagingHits: 5,
            overflow: 'knockbackOnly',
            knockback: { tier: 2, direction: { kind: 'sideOfTravel', angleDeg: 45 } },
        });
        expect(hitPolicyFromLegacyOptions({ continueAfterMaxHits: true })).toEqual({
            damagingHits: 1,
            overflow: 'passThrough',
        });
        expect(hitPolicyFromLegacyOptions({ knockbackTier: 0 })).toEqual({ damagingHits: 1, overflow: 'stop' });
    });
});

describe('projectile terrain clearing', () => {
    function brambleAt(id: string, col: number, row: number, layer: 'ground' | 'air' = 'ground'): TerrainEffectRecord {
        return {
            id,
            layer,
            effectType: 'bramble_slow',
            placedAtGameTime: 0,
            area: { type: 'cell', col, row },
            params: {},
        };
    }

    function makeStubEngine() {
        const terrainLayers = new TerrainLayerManager();
        const bus = new RealEventBus();
        const clearedEvents: unknown[] = [];
        bus.on('terrain_effects_cleared', (e) => clearedEvents.push(e));
        return { engine: { terrainLayers, eventBus: bus }, terrainLayers, clearedEvents };
    }

    function makeClearingProjectile(y: number, extra: Partial<ConstructorParameters<typeof Projectile>[0]> = {}) {
        return new Projectile({
            x: 20,
            y,
            velocityX: 400,
            velocityY: 0,
            damage: 0,
            sourceTeamId: 'player',
            sourceUnitId: 'caster_1',
            sourceAbilityId: 'rock_slide',
            maxDistance: 10000,
            clearsTerrainEffects: { spec: TERRAIN_CLEARS.scour },
            ...extra,
        });
    }

    it('clears only cells within its width of the path', () => {
        const { engine, terrainLayers, clearedEvents } = makeStubEngine();
        terrainLayers.add(brambleAt('spawn', 0, 0));
        terrainLayers.add(brambleAt('path', 2, 0));
        terrainLayers.add(brambleAt('beside', 2, 1));
        terrainLayers.add(brambleAt('air', 1, 0, 'air'));
        const proj = makeClearingProjectile(20);
        proj.radius = 5;

        // 400 px/s * 0.3 s = 120 px: crosses tiles 0..3 of row 0.
        for (let i = 0; i < 18; i++) proj.update(1 / 60, engine);

        expect(terrainLayers.getGroundEffectAt(0, 0)).toBeNull();
        expect(terrainLayers.getGroundEffectAt(2, 0)).toBeNull();
        expect(terrainLayers.getGroundEffectAt(2, 1)?.id).toBe('beside');
        expect(terrainLayers.getAirEffectAt(1, 0)?.id).toBe('air');
        expect(clearedEvents.length).toBeGreaterThan(0);
        expect(clearedEvents[0]).toMatchObject({ source: { unitId: 'caster_1', abilityId: 'rock_slide' } });
    });

    it('a wide sweep on an off-grid path reaches tiles a narrow one misses', () => {
        // Path along y = 38: inside row 0, 2 px from the row 1 boundary.
        const run = (sweepWidth: number) => {
            const { engine, terrainLayers } = makeStubEngine();
            terrainLayers.add(brambleAt('below', 2, 1));
            const proj = makeClearingProjectile(38, {
                clearsTerrainEffects: { spec: TERRAIN_CLEARS.scour, sweepWidth },
            });
            for (let i = 0; i < 18; i++) proj.update(1 / 60, engine);
            return terrainLayers.getGroundEffectAt(2, 1);
        };
        expect(run(1)?.id).toBe('below');
        expect(run(10)).toBeNull();
    });

    it('defaults the sweep width to the projectile radius', () => {
        const { engine, terrainLayers } = makeStubEngine();
        terrainLayers.add(brambleAt('below', 2, 1));
        const proj = makeClearingProjectile(38);
        proj.radius = 10;
        for (let i = 0; i < 18; i++) proj.update(1 / 60, engine);
        expect(terrainLayers.getGroundEffectAt(2, 1)).toBeNull();
    });

    it('clears nothing while held, then clears once released', () => {
        const { engine, terrainLayers } = makeStubEngine();
        terrainLayers.add(brambleAt('spawn', 0, 0));
        const proj = makeClearingProjectile(20, {
            velocityX: 0,
            heldBy: { unitId: 'caster_1', abilityId: 'rock_slide' },
        });

        proj.update(1 / 60, engine);
        expect(terrainLayers.getGroundEffectAt(0, 0)?.id).toBe('spawn');

        proj.release(400, 0);
        proj.update(1 / 60, engine);
        expect(terrainLayers.getGroundEffectAt(0, 0)).toBeNull();
    });

    it('does nothing when the engine has no terrainLayers or eventBus', () => {
        const proj = makeClearingProjectile(20);
        expect(() => proj.update(1 / 60, {})).not.toThrow();
        expect(proj.clearedTerrainCells.size).toBe(0);
    });

    it('does not re-clear tiles it already swept', () => {
        const { engine, terrainLayers } = makeStubEngine();
        const proj = makeClearingProjectile(20);
        for (let i = 0; i < 3; i++) proj.update(1 / 60, engine);
        // An effect placed behind the projectile on an already-swept tile survives.
        terrainLayers.add(brambleAt('late', 0, 0));
        proj.update(1 / 60, engine);
        expect(terrainLayers.getGroundEffectAt(0, 0)?.id).toBe('late');
    });

    it('survives a JSON round-trip with the property and the cleared set', () => {
        const { engine } = makeStubEngine();
        const proj = makeClearingProjectile(20, {
            clearsTerrainEffects: { spec: TERRAIN_CLEARS.blast, sweepWidth: 12 },
        });
        for (let i = 0; i < 6; i++) proj.update(1 / 60, engine);
        expect(proj.clearedTerrainCells.size).toBeGreaterThan(0);

        const restored = Projectile.fromJSON(JSON.parse(JSON.stringify(proj.toJSON())));

        expect(restored.clearsTerrainEffects).toEqual({
            spec: { layers: ['ground', 'air'] },
            sweepWidth: 12,
        });
        expect([...restored.clearedTerrainCells]).toEqual([...proj.clearedTerrainCells]);
    });

    it('a projectile without the property serializes without it', () => {
        const proj = makeClearingProjectile(20, { clearsTerrainEffects: undefined });
        const json = proj.toJSON();
        expect(json.clearsTerrainEffects).toBeUndefined();
        expect(Projectile.fromJSON(json).clearsTerrainEffects).toBeUndefined();
    });
});

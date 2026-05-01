/**
 * Projectile serialization tests: toJSON round-trip restores all saveable properties.
 */
import { describe, it, expect } from 'vitest';
import { Projectile } from './Projectile';
import { TerrainGrid } from '../../terrain/TerrainGrid';
import { TerrainType } from '../../terrain/TerrainType';
import { TerrainManager } from '../../terrain/TerrainManager';

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
});

/**
 * Projectile serialization tests: toJSON round-trip restores all saveable properties.
 */
import { describe, it, expect } from 'vitest';
import { Projectile } from './Projectile';

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
        expect(restored.maxDistance).toBe(proj.maxDistance);
        expect(restored.distanceTraveled).toBe(proj.distanceTraveled);
        expect(restored.radius).toBe(proj.radius);
    });
});

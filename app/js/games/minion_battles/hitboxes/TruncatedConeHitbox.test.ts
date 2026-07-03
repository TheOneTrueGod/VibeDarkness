import { describe, expect, it } from 'vitest';
import { TruncatedConeHitboxSpec } from '../hitboxes/TruncatedConeHitbox';
import { pointInCone } from '../abilities/coneGeometry';
import type { Unit } from '../game/units/Unit';

function makeUnit(id: string, x: number, y: number, teamId: string): Unit {
    return {
        id,
        x,
        y,
        teamId,
        isAlive: () => true,
    } as Unit;
}

describe('TruncatedConeHitboxSpec', () => {
    const outerR = 200;
    const halfArc = Math.PI / 6;
    const minR = 25;
    const hitbox = new TruncatedConeHitboxSpec(outerR, halfArc, () => minR, 3);
    const caster = makeUnit('player', 0, 0, 'player');

    it('excludes units inside the inner cut-off', () => {
        const units = [makeUnit('near', 10, 0, 'enemy')];
        const hits = hitbox.resolveHits({ units } as never, caster as Unit, 100, 0);
        expect(hits).toHaveLength(0);
    });

    it('includes units in the forward wedge beyond minR', () => {
        const units = [makeUnit('mid', 80, 0, 'enemy')];
        const hits = hitbox.resolveHits({ units } as never, caster as Unit, 100, 0);
        expect(hits.map((u) => u.id)).toEqual(['mid']);
    });

    it('getGeometry uses resolveMinR for inner radius', () => {
        const geom = hitbox.getGeometry(caster, 50, 0);
        expect(geom.minR).toBe(minR);
        expect(geom.maxR).toBe(outerR);
        expect(pointInCone(0, 0, 80, 0, geom.dirX, geom.dirY, geom.minR, geom.maxR, geom.halfArcRad)).toBe(true);
        expect(pointInCone(0, 0, 10, 0, geom.dirX, geom.dirY, geom.minR, geom.maxR, geom.halfArcRad)).toBe(false);
    });
});

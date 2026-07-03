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
    const outerR = 100;
    const halfArc = Math.PI / 4;
    const originX = 40;
    const hitbox = new TruncatedConeHitboxSpec(
        outerR,
        halfArc,
        () => 0,
        3,
        () => ({ x: originX, y: 0 }),
    );
    const caster = makeUnit('player', 0, 0, 'player');

    it('uses resolveOrigin as the cone apex', () => {
        const geom = hitbox.getGeometry(caster, 200, 0);
        expect(geom.originX).toBe(originX);
        expect(geom.originY).toBe(0);
        expect(geom.maxR).toBe(outerR);
        expect(geom.minR).toBe(0);
    });

    it('includes units in the forward wedge from the origin', () => {
        const units = [makeUnit('mid', 90, 0, 'enemy')];
        const hits = hitbox.resolveHits({ units } as never, caster as Unit, 200, 0);
        expect(hits.map((u) => u.id)).toEqual(['mid']);
    });

    it('excludes units outside the arc', () => {
        const units = [makeUnit('side', 90, 90, 'enemy')];
        const hits = hitbox.resolveHits({ units } as never, caster as Unit, 200, 0);
        expect(hits).toHaveLength(0);
        const geom = hitbox.getGeometry(caster, 200, 0);
        expect(pointInCone(
            geom.originX,
            geom.originY,
            90,
            90,
            geom.dirX,
            geom.dirY,
            geom.minR,
            geom.maxR,
            geom.halfArcRad,
        )).toBe(false);
    });
});

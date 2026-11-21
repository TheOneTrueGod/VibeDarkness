/**
 * The Heart's thorn rings (Spike Ring, Bloom Burst): `count` slow thorns fired evenly around the caster at a random
 * turn. The thorns are Wild: they hit everything that is not plant kin (`UnitTag.GardenKin`), the Heart's own side
 * included, so the Heart's attacks hurt the dark wolves and the like as well as the party.
 */

import type { CastBehaviourTickContext } from '../../abilities/castBehaviourTypes';
import { fireProjectileRing } from '../../abilities/projectileRing';
import { Projectile } from '../../game/projectiles/Projectile';
import { THORN_PROJECTILE_TYPE } from '../../game/projectiles/projectile_defs/thornDef';
import { TerrainType } from '../../terrain/TerrainType';
import { GARDEN_WILD_HIT_RULE } from './gardenHeartConstants';

/** The Wild rule every Garden Heart attack uses: hit everything but plant kin. */
export { GARDEN_WILD_HIT_RULE };

export interface GardenThornRingSpec {
    abilityId: string;
    count: number;
    /** px/s. */
    speed: number;
    damage: number;
    radius: number;
    /** px. */
    range: number;
}

/** Fire one ring from the caster, turned a random whole number of degrees (engine RNG: the same on every client). */
export function fireGardenThornRing(ctx: CastBehaviourTickContext, spec: GardenThornRingSpec): void {
    const caster = ctx.caster;
    const rotation = (ctx.engine.generateRandomInteger(0, 359) * Math.PI) / 180;
    fireProjectileRing({ count: spec.count, rotation }, (dx, dy) => {
        const thorn = new Projectile({
            x: caster.x,
            y: caster.y,
            velocityX: dx * spec.speed,
            velocityY: dy * spec.speed,
            damage: spec.damage,
            sourceTeamId: caster.teamId,
            sourceUnitId: caster.id,
            sourceAbilityId: spec.abilityId,
            maxDistance: spec.range,
            projectileType: THORN_PROJECTILE_TYPE,
            collidesWithTerrain: [TerrainType.Rock],
            hitRule: GARDEN_WILD_HIT_RULE,
        });
        thorn.radius = spec.radius;
        ctx.engine.addProjectile(thorn);
        return thorn;
    });
}

/**
 * Spike Ring - the Garden Heart. It swells for a moment, then fires a ring of slow thorns evenly around itself; the
 * answer is to step into a gap. Each ring is turned a random amount, so rings never line up into safe lanes.
 *
 * The Heart never chooses this itself (it is not on its ability list): its `cadenceCast` component fires it at the
 * rate of the `GARDEN_SPIKE_RING_RATE_RULE_ID` rule (`gardenSpikeRingRate`), which climbs as the party cuts the
 * current growth phase's tree down: about once a round in phase 2, up to 8 a round with the final tree gone.
 */

import type { AbilityStatic } from '../../../abilities/Ability';
import { AbilityPhase } from '../../../abilities/abilityTimings';
import { defineAbility } from '../../../abilities/defineAbility';
import { CastBehaviours } from '../../../abilities/CastBehaviours';
import type { CastBehaviourTickContext } from '../../../abilities/castBehaviourTypes';
import type { TargetDef } from '../../../abilities/targeting';
import { deactivateProjectileOnBlock } from '../../../abilities/effectHelpers';
import { fireProjectileRing } from '../../../abilities/projectileRing';
import { Effect } from '../../../game/effects/Effect';
import { Projectile } from '../../../game/projectiles/Projectile';
import { TerrainType } from '../../../terrain/TerrainType';
import { THORN_PROJECTILE_TYPE } from '../../../game/projectiles/projectile_defs/thornDef';
import type { CardDef } from '../../types';
import {
    NIGHTBLOOM_PRIMARY,
    NIGHTBLOOM_SECONDARY,
    SPIKE_RING_ABILITY_ID,
    SPIKE_RING_COUNT,
    SPIKE_RING_CURVE,
    SPIKE_RING_DAMAGE,
    SPIKE_RING_RADIUS,
    SPIKE_RING_RANGE,
    SPIKE_RING_RATES,
    SPIKE_RING_SPEED,
    SPIKE_RING_WINDUP_SEC,
} from '../gardenHeartConstants';
import IMAGE from './spikeRing.svg?raw';

const FIRE_END = SPIKE_RING_WINDUP_SEC + 1 / 60;
const COOLDOWN_END = FIRE_END + 0.3;

/**
 * Spike Rings per round for growth phase `phase` with `destroyedFraction` (0-1) of that phase's tree gone. 0 in a
 * phase with no entry (phase 1). See `SPIKE_RING_RATES` and `SPIKE_RING_CURVE`.
 */
export function gardenSpikeRingRate(phase: number, destroyedFraction: number): number {
    const r = SPIKE_RING_RATES[phase];
    if (!r) return 0;
    const f = Math.min(1, Math.max(0, destroyedFraction));
    return r.base + (r.max - r.base) * f ** SPIKE_RING_CURVE;
}

function swell(ctx: CastBehaviourTickContext): void {
    ctx.engine.addEffect(
        new Effect({
            x: ctx.caster.x,
            y: ctx.caster.y,
            duration: SPIKE_RING_WINDUP_SEC,
            effectType: 'Pulse',
            effectData: { colors: [NIGHTBLOOM_SECONDARY, NIGHTBLOOM_PRIMARY], maxRadius: ctx.caster.radius * 2 },
        }),
    );
}

function fireRing(ctx: CastBehaviourTickContext): void {
    const caster = ctx.caster;
    // A random turn per ring (engine RNG: deterministic on every client), in whole degrees.
    const rotation = (ctx.engine.generateRandomInteger(0, 359) * Math.PI) / 180;
    fireProjectileRing({ count: SPIKE_RING_COUNT, rotation }, (dx, dy) => {
        const thorn = new Projectile({
            x: caster.x,
            y: caster.y,
            velocityX: dx * SPIKE_RING_SPEED,
            velocityY: dy * SPIKE_RING_SPEED,
            damage: SPIKE_RING_DAMAGE,
            sourceTeamId: caster.teamId,
            sourceUnitId: caster.id,
            sourceAbilityId: SPIKE_RING_ABILITY_ID,
            maxDistance: SPIKE_RING_RANGE,
            projectileType: THORN_PROJECTILE_TYPE,
            collidesWithTerrain: [TerrainType.Rock],
        });
        thorn.radius = SPIKE_RING_RADIUS;
        ctx.engine.addProjectile(thorn);
        return thorn;
    });
}

export const SpikeRingAbility_1605: AbilityStatic = defineAbility({
    id: SPIKE_RING_ABILITY_ID,
    name: 'Spike Ring',
    image: IMAGE,
    resourceCost: null,
    rechargeTurns: 0,
    prefireTime: SPIKE_RING_WINDUP_SEC,
    abilityTimings: [
        {
            id: 'swell',
            start: 0,
            end: SPIKE_RING_WINDUP_SEC,
            abilityPhase: AbilityPhase.Windup,
            castBehaviours: [{ timingStart: 'start', behaviour: CastBehaviours.Instant(swell) }],
        },
        {
            id: 'fire',
            start: SPIKE_RING_WINDUP_SEC,
            end: FIRE_END,
            abilityPhase: AbilityPhase.Active,
            doNotRefund: true,
            timelineDanger: 'end',
            castBehaviours: [{ timingStart: 'start', behaviour: CastBehaviours.Instant(fireRing) }],
        },
        { id: 'cooldown', start: FIRE_END, end: COOLDOWN_END, abilityPhase: AbilityPhase.Cooldown },
    ],
    targets: [] as TargetDef[],
    aiSettings: { minRange: 0, maxRange: SPIKE_RING_RANGE },
    getRange: () => ({ minRange: 0, maxRange: SPIKE_RING_RANGE }),
    getDamage: () => SPIKE_RING_DAMAGE,
    onAttackBlocked(_engine, _defender, attackInfo) {
        deactivateProjectileOnBlock(attackInfo);
    },
    getTooltipText(): string[] {
        return [
            `Fires a ring of ${SPIKE_RING_COUNT} slow thorns around itself, ${SPIKE_RING_DAMAGE} damage each`,
            'Fires more often as its plant is cut down',
        ];
    },
});

export const SpikeRingCard_1605: CardDef = { abilityId: SPIKE_RING_ABILITY_ID };

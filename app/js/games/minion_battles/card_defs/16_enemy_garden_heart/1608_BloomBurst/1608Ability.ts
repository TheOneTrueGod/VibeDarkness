/**
 * Bloom Burst - the Garden Heart's phase-1 opening. The moment the Heart is Bared (its last node dies) it throws one
 * ring of slow thorns evenly around itself; the answer is to step through a gap and hit the open Heart. Wild: the
 * thorns hit everything that is not plant kin.
 *
 * The Heart never chooses this itself (it is not on its ability list): the Bared callback casts it
 * (`gardenHeartRegistrations.ts`).
 */

import type { AbilityStatic } from '../../../abilities/Ability';
import { AbilityPhase } from '../../../abilities/abilityTimings';
import { defineAbility } from '../../../abilities/defineAbility';
import { CastBehaviours } from '../../../abilities/CastBehaviours';
import type { CastBehaviourTickContext } from '../../../abilities/castBehaviourTypes';
import { Effect } from '../../../game/effects/Effect';
import type { TargetDef } from '../../../abilities/targeting';
import { deactivateProjectileOnBlock } from '../../../abilities/effectHelpers';
import type { CardDef } from '../../types';
import {
    BARED_THORN_DAMAGE,
    BARED_THORN_RADIUS,
    BARED_THORN_RANGE,
    BLOOM_BURST_ABILITY_ID,
    BLOOM_BURST_COUNT,
    BLOOM_BURST_SPEED,
    NIGHTBLOOM_PRIMARY,
    NIGHTBLOOM_SECONDARY,
} from '../gardenHeartConstants';
import { fireGardenThornRing } from '../thornRing';
import IMAGE from './bloomBurst.svg?raw';

/** A quick swell before the ring (an instant at time 0 would not fire, and the swell is the cue). */
const WINDUP_SEC = 0.2;
const FIRE_END = WINDUP_SEC + 1 / 60;
const COOLDOWN_END = FIRE_END + 0.3;

function swell(ctx: CastBehaviourTickContext): void {
    ctx.engine.addEffect(
        new Effect({
            x: ctx.caster.x,
            y: ctx.caster.y,
            duration: WINDUP_SEC,
            effectType: 'Pulse',
            effectData: { colors: [NIGHTBLOOM_SECONDARY, NIGHTBLOOM_PRIMARY], maxRadius: ctx.caster.radius * 2 },
        }),
    );
}

function burst(ctx: CastBehaviourTickContext): void {
    fireGardenThornRing(ctx, {
        abilityId: BLOOM_BURST_ABILITY_ID,
        count: BLOOM_BURST_COUNT,
        speed: BLOOM_BURST_SPEED,
        damage: BARED_THORN_DAMAGE,
        radius: BARED_THORN_RADIUS,
        range: BARED_THORN_RANGE,
    });
}

export const BloomBurstAbility_1608: AbilityStatic = defineAbility({
    id: BLOOM_BURST_ABILITY_ID,
    name: 'Bloom Burst',
    image: IMAGE,
    resourceCost: null,
    rechargeTurns: 0,
    prefireTime: WINDUP_SEC,
    abilityTimings: [
        {
            id: 'swell',
            start: 0,
            end: WINDUP_SEC,
            abilityPhase: AbilityPhase.Windup,
            castBehaviours: [{ timingStart: 'start', behaviour: CastBehaviours.Instant(swell) }],
        },
        {
            id: 'burst',
            start: WINDUP_SEC,
            end: FIRE_END,
            abilityPhase: AbilityPhase.Active,
            doNotRefund: true,
            castBehaviours: [{ timingStart: 'start', behaviour: CastBehaviours.Instant(burst) }],
        },
        { id: 'cooldown', start: FIRE_END, end: COOLDOWN_END, abilityPhase: AbilityPhase.Cooldown },
    ],
    targets: [] as TargetDef[],
    aiSettings: { minRange: 0, maxRange: BARED_THORN_RANGE },
    getRange: () => ({ minRange: 0, maxRange: BARED_THORN_RANGE }),
    getDamage: () => BARED_THORN_DAMAGE,
    onAttackBlocked(_engine, _defender, attackInfo) {
        deactivateProjectileOnBlock(attackInfo);
    },
    getTooltipText(): string[] {
        return [
            `When the Heart is bared, throws one ring of ${BLOOM_BURST_COUNT} slow thorns, ${BARED_THORN_DAMAGE} damage each`,
            'The thorns hit everything that is not a plant',
        ];
    },
});

export const BloomBurstCard_1608: CardDef = { abilityId: BLOOM_BURST_ABILITY_ID };

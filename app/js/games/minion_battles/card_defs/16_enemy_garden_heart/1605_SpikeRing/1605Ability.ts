/**
 * Spike Ring - the Garden Heart. It swells for a moment, then fires a ring of slow thorns evenly around itself; the
 * answer is to step into a gap. Each ring is turned a random amount, so rings never line up into safe lanes.
 *
 * The Heart never chooses this itself (it is not on its ability list): its `cadenceCast` component fires it at the
 * rate of the `GARDEN_SPIKE_RING_RATE_RULE_ID` rule (`gardenSpikeRingRate`): the phase's base rate (1, 1.5, 2 a round
 * in phases 2-4) while the Heart is shelled, and none while it is Bared. The thorns are Wild: they hit everything that
 * is not plant kin.
 */

import type { AbilityStatic } from '../../../abilities/Ability';
import { AbilityPhase } from '../../../abilities/abilityTimings';
import { defineAbility } from '../../../abilities/defineAbility';
import { CastBehaviours } from '../../../abilities/CastBehaviours';
import type { CastBehaviourTickContext } from '../../../abilities/castBehaviourTypes';
import type { TargetDef } from '../../../abilities/targeting';
import { deactivateProjectileOnBlock } from '../../../abilities/effectHelpers';
import { Effect } from '../../../game/effects/Effect';
import type { CardDef } from '../../types';
import {
    NIGHTBLOOM_PRIMARY,
    NIGHTBLOOM_SECONDARY,
    SPIKE_RING_ABILITY_ID,
    SPIKE_RING_COUNT,
    SPIKE_RING_DAMAGE,
    SPIKE_RING_RADIUS,
    SPIKE_RING_RANGE,
    SPIKE_RING_RATES,
    SPIKE_RING_SPEED,
    SPIKE_RING_WINDUP_SEC,
} from '../gardenHeartConstants';
import { fireGardenThornRing } from '../thornRing';
import IMAGE from './spikeRing.svg?raw';

const FIRE_END = SPIKE_RING_WINDUP_SEC + 1 / 60;
const COOLDOWN_END = FIRE_END + 0.3;

/** Spike Rings per round for growth phase `phase` while the Heart is shelled (0 in a phase with no entry: phase 1). See `SPIKE_RING_RATES`. */
export function gardenSpikeRingRate(phase: number): number {
    return SPIKE_RING_RATES[phase] ?? 0;
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
    fireGardenThornRing(ctx, {
        abilityId: SPIKE_RING_ABILITY_ID,
        count: SPIKE_RING_COUNT,
        speed: SPIKE_RING_SPEED,
        damage: SPIKE_RING_DAMAGE,
        radius: SPIKE_RING_RADIUS,
        range: SPIKE_RING_RANGE,
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
            'Only while it has a node growing; it holds its fire when bared',
            'The thorns hit everything that is not a plant',
        ];
    },
});

export const SpikeRingCard_1605: CardDef = { abilityId: SPIKE_RING_ABILITY_ID };

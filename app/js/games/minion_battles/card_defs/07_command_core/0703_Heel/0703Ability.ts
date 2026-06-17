/**
 * Heel — player command card.
 *
 * Instant cast, no targets. All pets disengage, hold a tight tether,
 * and are healed for 30% of their max HP. Dead pets are revived at that HP.
 * Good for keeping pets alive mid-fight or pulling them back after an overcommit.
 */

import { AbilityPhase, type AbilityTimingInterval } from '../../../abilities/abilityTimings';
import { AbilityGroupId, formatGroupId } from '../../AbilityGroupId';
import { getPetsOfUnit } from '../../../game/units/petHelpers';
import { commandHeel } from '../../../abilities/petCommands';
import { DoubleDamageBuff } from '../../../buffs/DoubleDamageBuff';
import { ROUND_DURATION } from '../../../game/units/unitAI/utils';
import { CastBehaviours } from '../../../abilities/CastBehaviours';
import { defineAbility } from '../../../abilities/defineAbility';
import { type CardDef } from '../../types';
import type { AbilityRecoveryRule } from '../../../abilities/Ability';
import { nullHitbox } from '../../../hitboxes';
import heelIconUrl from './heel.png';

const CARD_ID = `${formatGroupId(AbilityGroupId.Command)}03`;
const SIC_EM_ABILITY_ID = `${formatGroupId(AbilityGroupId.Command)}04`;
const MAX_USES = 2;
const RECOVERIES: AbilityRecoveryRule[] = [
    { chargeType: 'roundCharge', chargesPerRecovery: 1, usesRecovered: 1 },
];

const HEAL_FRACTION = 0.30;
const HEEL_TETHER_RANGE = 30;
// Duration: ~1 round in game-time seconds.
const HEEL_DURATION = ROUND_DURATION / 4;

const CAST_DURATION = 0.1;
const COOLDOWN_DURATION = 0.5;

const ABILITY_TIMINGS: AbilityTimingInterval[] = [
    {
        id: 'active',
        start: 0,
        end: CAST_DURATION,
        abilityPhase: AbilityPhase.Active,
        targetDef: { kind: 'select', label: 'Confirm', hitbox: nullHitbox, filter: 'any', allowMiss: true },
        castBehaviours: [
            {
                timingStart: 'start',
                behaviour: CastBehaviours.Instant((ctx) => {
                    const eng = ctx.engine;
                    const pets = getPetsOfUnit(ctx.caster, eng.units);
                    commandHeel(ctx.caster, pets, eng, {
                        healFraction: HEAL_FRACTION,
                        tetherRange: HEEL_TETHER_RANGE,
                        durationSeconds: HEEL_DURATION,
                    });
                    ctx.caster.addBuff(new DoubleDamageBuff(SIC_EM_ABILITY_ID), eng.gameTime, 1);
                }),
            },
        ],
    },
    { id: 'cooldown', start: CAST_DURATION, end: CAST_DURATION + COOLDOWN_DURATION, abilityPhase: AbilityPhase.Cooldown },
];

const HEEL_IMAGE = `<img src="${heelIconUrl}" width="56" height="56" alt="" style="object-fit: contain; display: block; margin: 0 auto;" />`;

export const HeelAbility = defineAbility({
    id: CARD_ID,
    name: 'Heel',
    image: HEEL_IMAGE,
    resourceCost: null,
    rechargeTurns: 0,
    maxUses: MAX_USES,
    recoveries: RECOVERIES,
    prefireTime: 0,
    targets: [],
    abilityTimings: ABILITY_TIMINGS,

    getRange: () => ({ minRange: 0, maxRange: 0 }),

    getTooltipText(): string[] {
        return [
            `Command all pets to return and hold position. Living pets heal {${Math.round(HEAL_FRACTION * 100)}%} of max HP; dead pets revive at that amount.`,
        ];
    },
});

export const HeelCard: CardDef = {
    abilityId: CARD_ID,
};

/**
 * Heel — player command card.
 *
 * Instant cast, no targets. All living pets disengage, hold a tight tether,
 * and are healed for 25% of their max HP. Good for keeping pets alive mid-fight
 * or pulling them back after an overcommit.
 */

import type { AbilityStatic, AbilityStateEntry } from '../../../abilities/Ability';
import { AbilityPhase, type AbilityTimingInterval } from '../../../abilities/abilityTimings';
import { AbilityGroupId, formatGroupId } from '../../AbilityGroupId';
import { getLivingPetsOfUnit } from '../../../game/units/petHelpers';
import { commandHeel } from '../../../abilities/petCommands';
import { ROUND_DURATION } from '../../../game/units/unitAI/utils';
import type { Unit } from '../../../game/units/Unit';
import type { ResolvedTarget } from '../../../game/types';
import type { Effect } from '../../../game/effects/Effect';
import { type CardDef } from '../../types';
import heelIconUrl from './heel.png';

const CARD_ID = `${formatGroupId(AbilityGroupId.Command)}03`;

const HEAL_FRACTION = 0.25;
const HEEL_TETHER_RANGE = 30;
// Duration: ~1 round in game-time seconds.
const HEEL_DURATION = ROUND_DURATION;

const CAST_DURATION = 0.1;
const COOLDOWN_DURATION = 1.5;

const ABILITY_TIMINGS: AbilityTimingInterval[] = [
    { id: 'active', start: 0, end: CAST_DURATION, abilityPhase: AbilityPhase.Active },
    { id: 'cooldown', start: CAST_DURATION, end: CAST_DURATION + COOLDOWN_DURATION, abilityPhase: AbilityPhase.Cooldown },
];

interface HeelEngineLike {
    gameTime: number;
    gameTick: number;
    units: Unit[];
    addEffect(effect: Effect): void;
    state: {
        orderMgr: {
            queueOrder(
                atTick: number,
                order: { unitId: string; abilityId: string; targets: ResolvedTarget[] },
            ): void;
        };
    };
}

const HEEL_IMAGE = `<img src="${heelIconUrl}" width="56" height="56" alt="" style="object-fit: contain; display: block; margin: 0 auto;" />`;

export const HeelAbility: AbilityStatic = {
    id: CARD_ID,
    name: 'Heel',
    image: HEEL_IMAGE,
    resourceCost: null,
    rechargeTurns: 0,
    prefireTime: 0,
    targets: [],
    abilityTimings: ABILITY_TIMINGS,

    getTooltipText(): string[] {
        return [
            `Command all pets to return and hold position. Each pet heals {${Math.round(HEAL_FRACTION * 100)}%} of its max HP.`,
        ];
    },

    getAbilityStates(): AbilityStateEntry[] {
        return [];
    },

    doCardEffect(
        engine: unknown,
        caster: Unit,
        _targets: ResolvedTarget[],
        prevTime: number,
        _currentTime: number,
    ): void {
        // Fire once on the first tick only.
        if (prevTime > 0) return;

        const eng = engine as HeelEngineLike;
        const pets = getLivingPetsOfUnit(caster, eng.units);
        commandHeel(caster, pets, eng, {
            healFraction: HEAL_FRACTION,
            tetherRange: HEEL_TETHER_RANGE,
            durationSeconds: HEEL_DURATION,
        });
    },

    onAttackBlocked(): void {},
};

export const HeelCard: CardDef = {
    abilityId: CARD_ID,
};

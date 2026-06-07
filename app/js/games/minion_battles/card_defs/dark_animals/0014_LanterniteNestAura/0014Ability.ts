/*
 * LanterniteNestAura — passive radiant field sustained by a living nest.
 * Every 1 second (1/8 of a round) the nest pulses light that burns nearby dark creatures,
 * dealing 2 damage to every dark creature within range. No targeting or casting is needed;
 * the aura fires automatically as long as the nest is alive.
 */

import type { AbilityStatic, AbilityStateEntry } from '../../../abilities/Ability';
import { AbilityGroupId, formatGroupId } from '../../AbilityGroupId';
import type { PassiveDef } from '../../../abilities/passiveDef';

export const LANTERNITE_NEST_AURA_ID = `${formatGroupId(AbilityGroupId.Enemy)}14`;

const TICK_INTERVAL_SEC = 1.0; // 1/8 of an 8-second round
const AURA_DAMAGE = 2;
const PULSE_RADIUS = 210; // ~60% of the original 350 px pulse

const nestAuraPassive: PassiveDef = {
    trigger: { type: 'onTick', intervalSec: TICK_INTERVAL_SEC },
    effects: [
        {
            type: 'aoe_damage',
            damage: AURA_DAMAGE,
            range: PULSE_RADIUS,
            targetFilter: { creatureType: 'dark_creature' },
            pulseRadius: PULSE_RADIUS,
        },
    ],
};

export const LanterniteNestAuraAbility: AbilityStatic = {
    id: LANTERNITE_NEST_AURA_ID,
    name: 'Radiant Aura',
    image: '',
    resourceCost: null,
    rechargeTurns: 0,
    prefireTime: 0,
    abilityTimings: [],
    targets: [],
    passive: nestAuraPassive,

    getTooltipText(): string[] {
        return [
            `Passive: every {${TICK_INTERVAL_SEC}s} the nest pulses light, dealing {${AURA_DAMAGE}} damage to nearby dark creatures.`,
        ];
    },

    getAbilityStates(): AbilityStateEntry[] {
        return [];
    },
};

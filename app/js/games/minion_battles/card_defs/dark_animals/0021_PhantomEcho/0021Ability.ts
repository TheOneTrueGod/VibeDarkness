/**
 * PhantomEcho - Displacer Spirit passive. Each time the spirit fires a projectile (its bolt, the frenzied
 * bolt, each bolt of Light Eater's ring), it conjures one decoy beside itself while fewer than
 * `PHANTOM_ECHO_MAX_DECOYS` decoys are alive. Clones never carry it, so their echoed bolts conjure nothing.
 */

import type { AbilityStatic, AbilityStateEntry } from '../../../abilities/Ability';
import type { PassiveDef } from '../../../abilities/passiveDef';
import { AbilityGroupId, formatGroupId } from '../../AbilityGroupId';
import { ENEMY_DISPLACER_CLONE } from '../../../constants/enemyConstants';
import { enemySpawnDefToSpawnDefinition } from '../../../game/units/spawning/adapters';
import {
    PHANTOM_ECHO_MAX_DECOYS,
    PHANTOM_ECHO_MAX_DISTANCE,
    PHANTOM_ECHO_MIN_DISTANCE,
    PHANTOM_DECOY_MIN_SPACING,
} from '../../../game/displacer/displacerConstants';

export const PHANTOM_ECHO_ID = `${formatGroupId(AbilityGroupId.Enemy)}21`;

const SPIRIT_PULSE_COLORS = [0x3366cc, 0x9fc2ff, 0x112244] as const;

const phantomEchoPassive: PassiveDef = {
    trigger: { type: 'onProjectileFired' },
    effects: [
        {
            type: 'spawn_units',
            template: {
                ...enemySpawnDefToSpawnDefinition(ENEMY_DISPLACER_CLONE, 'ai'),
                controllable: false,
                unitTags: [],
            },
            count: 1,
            maxLiving: PHANTOM_ECHO_MAX_DECOYS,
            placement: {
                minDistance: PHANTOM_ECHO_MIN_DISTANCE,
                maxDistance: PHANTOM_ECHO_MAX_DISTANCE,
                minSpacing: PHANTOM_DECOY_MIN_SPACING,
            },
            inheritHpFraction: true,
            pulseColors: SPIRIT_PULSE_COLORS,
        },
    ],
};

export const PhantomEchoAbility: AbilityStatic = {
    id: PHANTOM_ECHO_ID,
    name: 'Phantom Echo',
    image: '',
    resourceCost: null,
    rechargeTurns: 0,
    prefireTime: 0,
    abilityTimings: [],
    targets: [],
    passive: phantomEchoPassive,

    getTooltipText(): string[] {
        return [
            `Passive: each projectile the spirit fires conjures a decoy beside it, while fewer than {${PHANTOM_ECHO_MAX_DECOYS}} decoys remain`,
            'Decoys never conjure more decoys',
        ];
    },

    getAbilityStates(): AbilityStateEntry[] {
        return [];
    },
};

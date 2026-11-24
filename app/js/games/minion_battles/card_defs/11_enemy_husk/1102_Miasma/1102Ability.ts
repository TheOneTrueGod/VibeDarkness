/*
 * Miasma — passive gas trail. Every time the Husk steps into a new cell it exhales one cell of
 * `miasma` on the air layer, lasting `MIASMA_DURATION_SEC`: on its own cell, or — when that cell already
 * holds miasma — on a random adjacent cell that doesn't. With every neighbour gassed, nothing spawns. The cloud itself (damage, who it hurts) is defined
 * by the `miasma` terrain effect def; this ability only decides where and when it appears.
 */

import type { AbilityStatic, AbilityStateEntry } from '../../../abilities/Ability';
import type { PassiveDef } from '../../../abilities/passiveDef';
import { AbilityGroupId, formatGroupId } from '../../AbilityGroupId';
import {
    MIASMA_DAMAGE,
    MIASMA_DURATION_SEC,
    MIASMA_EFFECT_TYPE,
    MIASMA_INTERVAL_SEC,
} from '../../../game/terrainEffects/terrainEffectDefs';

export const MIASMA_ABILITY_ID = `${formatGroupId(AbilityGroupId.EnemyHusk)}02`;

export { MIASMA_DURATION_SEC };
/** Neighbourhood searched (Chebyshev cells) when the Husk's own cell already holds miasma. */
export const MIASMA_SPILLOVER_CELL_RADIUS = 1;

const miasmaPassive: PassiveDef = {
    trigger: { type: 'onCellEnter' },
    effects: [
        {
            type: 'place_terrain',
            effectType: MIASMA_EFFECT_TYPE,
            layer: 'air',
            cellRadius: 0,
            count: 1,
            spillover: { cellRadius: MIASMA_SPILLOVER_CELL_RADIUS },
            durationSec: MIASMA_DURATION_SEC,
            skipImpassable: true,
        },
    ],
};

export const MiasmaAbility: AbilityStatic = {
    id: MIASMA_ABILITY_ID,
    name: 'Miasma',
    image: '',
    resourceCost: null,
    rechargeTurns: 0,
    prefireTime: 0,
    abilityTimings: [],
    targets: [],
    passive: miasmaPassive,

    getTooltipText(): string[] {
        return [
            `Passive: each step leaves a cloud of foul gas behind the Husk for {${MIASMA_DURATION_SEC}s}. Anything but a darkness creature standing in it takes {${MIASMA_DAMAGE}} damage every {${MIASMA_INTERVAL_SEC}s}.`,
        ];
    },

    getAbilityStates(): AbilityStateEntry[] {
        return [];
    },
};

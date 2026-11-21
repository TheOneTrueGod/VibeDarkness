/**
 * Pinwheel - the Garden Heart's Bared attack in phases 2-4. While the Heart is Bared it spins arms of slow thorns
 * for the whole window (`GARDEN_BARED_SECONDS`): walk with the turn, or stand beside it. Wild: the thorns hit
 * everything that is not plant kin.
 *
 * The arms come from a preset (`abilities/pinwheelPresets.ts`), fixed per ability: 1607 is Gentle (phases 2 and 3),
 * 1609 is Doubled (phase 4). The Heart never chooses these itself (they are not on its ability list): the Bared callback
 * casts the one for the current phase (`GARDEN_PINWHEEL_PRESET_BY_PHASE`, `gardenHeartRegistrations.ts`).
 */

import type { AbilityStatic } from '../../../abilities/Ability';
import { AbilityPhase } from '../../../abilities/abilityTimings';
import { defineAbility } from '../../../abilities/defineAbility';
import { CastBehaviours } from '../../../abilities/CastBehaviours';
import { PINWHEEL_PRESETS, pinwheelConfig, type PinwheelPresetId } from '../../../abilities/pinwheelPresets';
import type { TargetDef } from '../../../abilities/targeting';
import { deactivateProjectileOnBlock } from '../../../abilities/effectHelpers';
import { THORN_PROJECTILE_TYPE } from '../../../game/projectiles/projectile_defs/thornDef';
import type { CardDef } from '../../types';
import {
    BARED_THORN_DAMAGE,
    BARED_THORN_RADIUS,
    BARED_THORN_RANGE,
    GARDEN_BARED_SECONDS,
    PINWHEEL_ABILITY_ID,
    PINWHEEL_DOUBLED_ABILITY_ID,
} from '../gardenHeartConstants';
import { GARDEN_WILD_HIT_RULE } from '../thornRing';
import IMAGE from './pinwheel.svg?raw';

const COOLDOWN_END = GARDEN_BARED_SECONDS + 0.3;

function definePinwheelAbility(id: string, name: string, presetId: PinwheelPresetId): AbilityStatic {
    const preset = PINWHEEL_PRESETS[presetId];
    const armCount = preset.arms + preset.counterArms;
    const armWord = armCount === 1 ? 'one arm' : `${armCount} arms`;
    return defineAbility({
        id,
        name,
        image: IMAGE,
        resourceCost: null,
        rechargeTurns: 0,
        prefireTime: 0,
        abilityTimings: [
            {
                id: 'spin',
                start: 0,
                end: GARDEN_BARED_SECONDS,
                abilityPhase: AbilityPhase.Active,
                doNotRefund: true,
                castBehaviours: [
                    {
                        timingStart: 'start',
                        timingEnd: 'end',
                        behaviour: CastBehaviours.Pinwheel(
                            pinwheelConfig(presetId, {
                                damage: BARED_THORN_DAMAGE,
                                radius: BARED_THORN_RADIUS,
                                range: BARED_THORN_RANGE,
                                type: THORN_PROJECTILE_TYPE,
                                hitRule: GARDEN_WILD_HIT_RULE,
                            }),
                        ),
                    },
                ],
            },
            { id: 'cooldown', start: GARDEN_BARED_SECONDS, end: COOLDOWN_END, abilityPhase: AbilityPhase.Cooldown },
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
                `While the Heart is bared, spins ${armWord} of slow thorns, ${BARED_THORN_DAMAGE} damage each`,
                'The thorns hit everything that is not a plant',
            ];
        },
    });
}

export const PinwheelAbility_1607: AbilityStatic = definePinwheelAbility(PINWHEEL_ABILITY_ID, 'Pinwheel', 'gentle');
export const PinwheelDoubledAbility_1609: AbilityStatic = definePinwheelAbility(
    PINWHEEL_DOUBLED_ABILITY_ID,
    'Double Pinwheel',
    'doubled',
);

export const PinwheelCard_1607: CardDef = { abilityId: PINWHEEL_ABILITY_ID };
export const PinwheelDoubledCard_1609: CardDef = { abilityId: PINWHEEL_DOUBLED_ABILITY_ID };

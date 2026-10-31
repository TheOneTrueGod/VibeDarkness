/**
 * Release Charge — the held buckler's strike. Cone of Light's burst in Armory colours (from the theme), paid for in Charge.
 * Single use. The buckler is put away after, and leaves nothing on the ground.
 */

import { defineConeStrike } from '../../../abilities/archetypes/defineConeStrike';
import releaseChargeSvg from './releaseCharge.svg?raw';
import { type CardDef } from '../../types';
import { resolveTooltipContext } from '../../../abilities/abilityModifierHelpers';
import { formatTooltipLegacyLines, type TooltipTokenBindings } from '../../../abilities/tooltipTokens';
import { ResourceId } from '../../../resources/resourceIds';
import {
    CONE_OF_LIGHT_ACTIVE_END,
    CONE_OF_LIGHT_ARC_DEGREES,
    CONE_OF_LIGHT_COOLDOWN_END,
    CONE_OF_LIGHT_DAMAGE,
    CONE_OF_LIGHT_FLASH_DURATION,
    CONE_OF_LIGHT_HALF_ANGLE_RAD,
    CONE_OF_LIGHT_MAX_TARGETS,
    CONE_OF_LIGHT_RANGE,
    CONE_OF_LIGHT_STUN_CHARGES,
    CONE_OF_LIGHT_STUN_SECONDS,
    CONE_OF_LIGHT_WINDUP_END,
} from '../../0121_ConeOfLight/0121Ability';
import {
    ARMORY_ABILITY_CHARGE_COST,
    RELEASE_CHARGE_ABILITY_ID,
    SHIELD_FOLLOWUP_USES,
} from '../armoryConstants';

const RELEASE_CHARGE_AIM_LABEL = 'Direction';

const TOOLTIP_LINES = [
    'Release the buckler\'s charge in a cone.',
    'Deals {{DAMAGE}} damage to up to {{MAX_TARGETS}} enemies in a {{ARC_DEGREES}}° arc',
    'Stuns hit enemies for {{STUN}} seconds',
] as const;

const TOOLTIP_BINDINGS: TooltipTokenBindings = {
    DAMAGE: { kind: 'damage', base: CONE_OF_LIGHT_DAMAGE },
    MAX_TARGETS: { kind: 'plain', value: CONE_OF_LIGHT_MAX_TARGETS },
    ARC_DEGREES: { kind: 'plain', value: CONE_OF_LIGHT_ARC_DEGREES },
    STUN: { kind: 'plain', value: CONE_OF_LIGHT_STUN_SECONDS },
};

export const ReleaseChargeAbility_1009 = defineConeStrike({
    id: RELEASE_CHARGE_ABILITY_ID,
    name: 'Release Charge',
    image: releaseChargeSvg,
    resourceCost: { resourceId: ResourceId.Charge, amount: ARMORY_ABILITY_CHARGE_COST },
    maxUses: SHIELD_FOLLOWUP_USES,
    recoveries: [],
    range: CONE_OF_LIGHT_RANGE,
    halfAngleRad: CONE_OF_LIGHT_HALF_ANGLE_RAD,
    damage: CONE_OF_LIGHT_DAMAGE,
    maxTargets: CONE_OF_LIGHT_MAX_TARGETS,
    stunSeconds: CONE_OF_LIGHT_STUN_SECONDS,
    stunCcCharges: CONE_OF_LIGHT_STUN_CHARGES,
    windupEnd: CONE_OF_LIGHT_WINDUP_END,
    activeEnd: CONE_OF_LIGHT_ACTIVE_END,
    cooldownEnd: CONE_OF_LIGHT_COOLDOWN_END,
    aimLabel: RELEASE_CHARGE_AIM_LABEL,
    flashDuration: CONE_OF_LIGHT_FLASH_DURATION,

    getTooltipText(gameState?: unknown): string[] {
        return formatTooltipLegacyLines(
            TOOLTIP_LINES,
            TOOLTIP_BINDINGS,
            resolveTooltipContext(gameState, { ability: { id: RELEASE_CHARGE_ABILITY_ID } }),
        );
    },
});

export const ReleaseChargeCard: CardDef = {
    abilityId: RELEASE_CHARGE_ABILITY_ID,
};

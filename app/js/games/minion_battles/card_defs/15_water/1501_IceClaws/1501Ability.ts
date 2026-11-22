/**
 * Ice Claws — Bloody Claws (0306) grown out of ice: the same swipe left, swipe right, X combo, but each
 * claw is longer and wider and lands a little harder, and the cast costs Water instead of HP. The slot
 * has an Ice / Blood mode strip: when Ice can't be paid for, the slot casts Bloody Claws instead (when
 * the character owns it). Hits still add bleed, so the overlap feeds Blood Splinters.
 */

import { AbilityEventType } from '../../../abilities/Ability';
import { buildClawCombo } from '../../../abilities/clawCombo';
import { defineAbility } from '../../../abilities/defineAbility';
import { resolveTooltipContext } from '../../../abilities/abilityModifierHelpers';
import { formatTooltipLegacyLines, type TooltipTokenBindings } from '../../../abilities/tooltipTokens';
import type { AimFrameSegmentHitboxSpec } from '../../../hitboxes';
import { MOTE_PRESETS } from '../../../game/effects/motes';
import { ResourceId } from '../../../resources/resourceIds';
import { getThemeById } from '../../../themes/abilityTheme';
import { cssHexToNumber, mixCssHex } from '../../../themes/colorUtils';
import { AbilityGroupId, formatGroupId } from '../../AbilityGroupId';
import { type CardDef } from '../../types';
import {
    BLOODY_CLAWS_BLEED_STACKS,
    BLOODY_CLAWS_FIRST_STRIKE_LUNGE,
    BLOODY_CLAWS_FOLLOW_UP_LUNGE,
    BLOODY_CLAWS_HITBOX_COUNT,
    BLOODY_CLAWS_LUNGE_DURATION,
    BLOODY_CLAWS_MAX_TURN_DEGREES,
    BLOODY_CLAWS_MAX_USES,
    BLOODY_CLAWS_RECOVERIES,
    BLOODY_CLAWS_STRIKE_SLIDE,
    BLOODY_CLAWS_TARGETS_PER_CLAW,
    BLOODY_CLAWS_TIMINGS,
    BloodyClawsAbility_0306,
} from '../../03_blood_mage/0306_BloodyClaws/0306Ability';
import iceClawsSvg from './iceClaws.svg?raw';

const CARD_ID = `${formatGroupId(AbilityGroupId.Water)}01`;

export const ICE_CLAWS_DAMAGE = 6;
export const ICE_CLAWS_WATER_COST = 2;
/** Mode ids on the card's Ice / Blood strip. */
export const ICE_CLAWS_ICE_MODE = 'ice';
export const ICE_CLAWS_BLOOD_MODE = 'blood';
/** Same uses (and round refill) as Bloody Claws; the Ice mode also needs a use left. */
export const ICE_CLAWS_MAX_USES = BLOODY_CLAWS_MAX_USES;
/** Left claw ("/") in the aim frame: Bloody Claws' claw pushed out and lengthened (artbook `ICE_CLAWS_CLAW`). */
export const ICE_CLAWS_CLAW_BASE = { forward: 16, side: -60 };
export const ICE_CLAWS_CLAW_TIP = { forward: 92, side: 26 };
export const ICE_CLAWS_CLAW_HALF_THICKNESS = 12;

const WATER = getThemeById('water');
/** Tidewater slash: seafoam under-stroke, seafoam lifted toward white for the bright streak (the studio's `light`). */
const ICE_CLAWS_SLASH_GLOW = WATER.secondaryNum;
const ICE_CLAWS_SLASH_CORE = cssHexToNumber(mixCssHex(WATER.secondary, '#ffffff', 0.55));

const COMBO = buildClawCombo({
    base: ICE_CLAWS_CLAW_BASE,
    tip: ICE_CLAWS_CLAW_TIP,
    halfThickness: ICE_CLAWS_CLAW_HALF_THICKNESS,
    targetsPerClaw: BLOODY_CLAWS_TARGETS_PER_CLAW,
    damage: ICE_CLAWS_DAMAGE,
    maxTurnDegrees: BLOODY_CLAWS_MAX_TURN_DEGREES,
    firstStrikeLunge: BLOODY_CLAWS_FIRST_STRIKE_LUNGE,
    followUpLunge: BLOODY_CLAWS_FOLLOW_UP_LUNGE,
    lungeDuration: BLOODY_CLAWS_LUNGE_DURATION,
    strikeSlide: BLOODY_CLAWS_STRIKE_SLIDE,
    timings: BLOODY_CLAWS_TIMINGS,
    slash: {
        glowColor: ICE_CLAWS_SLASH_GLOW,
        coreColor: ICE_CLAWS_SLASH_CORE,
        spacing: 7,
        trail: { spec: MOTE_PRESETS.frostTrail(WATER.id), count: 6, jitterPx: 4 },
        hitBurst: { spec: MOTE_PRESETS.iceShards(WATER.id), count: 5 },
    },
});

export const ICE_LEFT_CLAW_HITBOX: AimFrameSegmentHitboxSpec = COMBO.leftClaw;
export const ICE_RIGHT_CLAW_HITBOX: AimFrameSegmentHitboxSpec = COMBO.rightClaw;

const TOOLTIP_LINES = [
    `Swipe left, swipe right, then rake both claws in an X for {{DAMAGE}} x ${BLOODY_CLAWS_HITBOX_COUNT} damage.`,
    `Each claw hits up to {${BLOODY_CLAWS_TARGETS_PER_CLAW}} enemies and adds {${BLOODY_CLAWS_BLEED_STACKS}} {bleeding} stack.`,
    `When you can't pay for it, the slot casts Bloody Claws instead.`,
] as const;

const TOOLTIP_BINDINGS: TooltipTokenBindings = {
    DAMAGE: { kind: 'damage', base: ICE_CLAWS_DAMAGE },
};

export const IceClawsAbility_1501 = defineAbility({
    id: CARD_ID,
    tags: ['melee'],
    name: 'Ice Claws',
    image: iceClawsSvg,
    flavorText: 'Frost runs down your fingers and sets into talons.',
    // Spent as the cast starts; refunded if interrupted before the first swipe (its `doNotRefund`).
    resourceCost: { resourceId: ResourceId.Water, amount: ICE_CLAWS_WATER_COST },
    rechargeTurns: 1,
    maxUses: ICE_CLAWS_MAX_USES,
    recoveries: BLOODY_CLAWS_RECOVERIES,
    prefireTime: BLOODY_CLAWS_TIMINGS.swipeLeftImpact,
    targets: [],
    abilityTimings: COMBO.abilityTimings,
    movementLock: { until: BLOODY_CLAWS_TIMINGS.xStrikeEnd },
    aiSettings: { minRange: 0, maxRange: COMBO.aiMaxRange },
    abilityModes: {
        // Blood is always the left segment of a Blood / Ice strip.
        modes: [ICE_CLAWS_BLOOD_MODE, ICE_CLAWS_ICE_MODE],
        defaultMode: ICE_CLAWS_ICE_MODE,
        toggleStyle: 'cycle',
        modeAbilityIds: { [ICE_CLAWS_BLOOD_MODE]: BloodyClawsAbility_0306.id },
        modeLabels: { [ICE_CLAWS_ICE_MODE]: 'Ice', [ICE_CLAWS_BLOOD_MODE]: 'Blood' },
        modeDescriptions: {
            [ICE_CLAWS_ICE_MODE]: 'Rake with long claws of ice, paying Water',
            [ICE_CLAWS_BLOOD_MODE]: 'Cast Bloody Claws instead, paying HP',
        },
        fallbackMode: ICE_CLAWS_BLOOD_MODE,
        ownedCardModes: [ICE_CLAWS_BLOOD_MODE],
    },
    abilityEvents: {
        [AbilityEventType.ON_ATTACK_HIT]: [
            {
                conditions: [{ type: 'hitResultIs', result: 'hit' }],
                effects: [{ type: 'applyBleedToPrimaryTarget', stacks: BLOODY_CLAWS_BLEED_STACKS }],
            },
        ],
    },

    getTooltipText(gameState?: unknown): string[] {
        return formatTooltipLegacyLines(
            TOOLTIP_LINES,
            TOOLTIP_BINDINGS,
            resolveTooltipContext(gameState, { ability: { id: CARD_ID } }),
        );
    },
});

export const IceClawsCard_1501: CardDef = {
    abilityId: CARD_ID,
};

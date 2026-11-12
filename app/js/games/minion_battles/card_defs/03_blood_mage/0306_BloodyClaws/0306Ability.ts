/**
 * Bloody Claws — a fast three-beat melee combo: swipe left, swipe right, then rake both claws
 * in a crossing X. Each claw is a long, thin slash fixed in front of the caster ("/o\" with the
 * claws crossing just ahead), and every claw that connects adds bleed. Strikes two and three are
 * re-aimed independently but may only turn a little from the previous strike.
 */

import type { AbilityRecoveryRule } from '../../../abilities/Ability';
import { AbilityEventType } from '../../../abilities/Ability';
import { buildClawCombo, type ClawComboTimings } from '../../../abilities/clawCombo';
import { defineAbility } from '../../../abilities/defineAbility';
import { payHpCostBehaviour } from '../../../abilities/hpCost';
import { resolveTooltipContext } from '../../../abilities/abilityModifierHelpers';
import { formatTooltipLegacyLines, type TooltipTokenBindings } from '../../../abilities/tooltipTokens';
import type { AimFrameSegmentHitboxSpec } from '../../../hitboxes';
import { DEFAULT_UNIT_RADIUS } from '../../../game/units/unit_defs/unitConstants';
import { AbilityGroupId, formatGroupId } from '../../AbilityGroupId';
import { type CardDef } from '../../types';

const CARD_ID = `${formatGroupId(AbilityGroupId.Mage)}06`;

export const BLOODY_CLAWS_DAMAGE = 5;
/** Four claw hitboxes: left, right, then both for the X. */
export const BLOODY_CLAWS_HITBOX_COUNT = 4;
export const BLOODY_CLAWS_TARGETS_PER_CLAW = 3;
export const BLOODY_CLAWS_BLEED_STACKS = 1;
export const BLOODY_CLAWS_HP_COST = 3;
export const BLOODY_CLAWS_MAX_USES = 3;
/** Strikes two and three may turn this far either side of the previous strike's aim. */
export const BLOODY_CLAWS_MAX_TURN_DEGREES = 30;

/**
 * Left claw ("/") in the caster's aim frame (px from caster centre; side < 0 is the caster's left).
 * The base sits beside the caster, clear of its body; the tip reaches forward across the aim line, so the left
 * and right claws cross just in front of the caster with their tips pointing outward. Everything
 * stays within two body lengths (`BLOODY_CLAWS_MAX_REACH`) of the caster's centre so it reads as melee.
 */
export const BLOODY_CLAWS_MAX_REACH = 4 * DEFAULT_UNIT_RADIUS;
export const BLOODY_CLAWS_CLAW_BASE = { forward: 12, side: -48 };
export const BLOODY_CLAWS_CLAW_TIP = { forward: 62, side: 18 };
export const BLOODY_CLAWS_CLAW_HALF_THICKNESS = 8;

/**
 * Each strike window opens 0.1s before its impact. In that lead the caster takes a real step toward
 * the strike's own target (a step lunge, `SelectTargetDef.lunge`), and a small drawn slide
 * (`BLOODY_CLAWS_STRIKE_SLIDE`) adds weight, easing back after the hit. A shorter lead (a few frames)
 * makes the motion unreadable, especially under the impact hit-pause. Ice Claws (1501) shares this table.
 */
export const BLOODY_CLAWS_TIMINGS: ClawComboTimings = {
    windupEnd: 0.05,
    swipeLeftImpact: 0.15,
    swipeLeftEnd: 0.23,
    swipeRightStart: 0.25,
    swipeRightImpact: 0.35,
    swipeRightEnd: 0.43,
    xStrikeStart: 0.5,
    xStrikeImpact: 0.6,
    xStrikeEnd: 0.68,
    cooldownEnd: 1.5,
};
/** Step lunges (real movement, px): the first swipe closes more distance than the follow-ups. */
export const BLOODY_CLAWS_FIRST_STRIKE_LUNGE = 20;
export const BLOODY_CLAWS_FOLLOW_UP_LUNGE = 15;
/** Each step lunge finishes just before its strike's impact (0.1s lead). */
export const BLOODY_CLAWS_LUNGE_DURATION = 0.08;
/** Small drawn slide on top of the step (no movement): ease forward into the hit, settle behind. */
export const BLOODY_CLAWS_STRIKE_SLIDE = { forwardDistance: 6, backwardDistance: 2 };

/** Uses refill every round (`roundCharge`). Ice Claws reuses the same rule. */
export const BLOODY_CLAWS_RECOVERIES: AbilityRecoveryRule[] = [
    { chargeType: 'roundCharge', chargesPerRecovery: 1, usesRecovered: BLOODY_CLAWS_MAX_USES },
];

const COMBO = buildClawCombo({
    base: BLOODY_CLAWS_CLAW_BASE,
    tip: BLOODY_CLAWS_CLAW_TIP,
    halfThickness: BLOODY_CLAWS_CLAW_HALF_THICKNESS,
    targetsPerClaw: BLOODY_CLAWS_TARGETS_PER_CLAW,
    damage: BLOODY_CLAWS_DAMAGE,
    maxTurnDegrees: BLOODY_CLAWS_MAX_TURN_DEGREES,
    firstStrikeLunge: BLOODY_CLAWS_FIRST_STRIKE_LUNGE,
    followUpLunge: BLOODY_CLAWS_FOLLOW_UP_LUNGE,
    lungeDuration: BLOODY_CLAWS_LUNGE_DURATION,
    strikeSlide: BLOODY_CLAWS_STRIKE_SLIDE,
    timings: BLOODY_CLAWS_TIMINGS,
    firstStrikeStart: [payHpCostBehaviour(BLOODY_CLAWS_HP_COST)],
});

export const LEFT_CLAW_HITBOX: AimFrameSegmentHitboxSpec = COMBO.leftClaw;
export const RIGHT_CLAW_HITBOX: AimFrameSegmentHitboxSpec = COMBO.rightClaw;

const BLOODY_CLAWS_IMAGE = `<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="0" width="64" height="64" rx="6" fill="#2C2C2A"/>
  <path d="M14 50 L36 12 M20 54 L42 16 M26 58 L48 20" stroke="#E24B4A" stroke-width="3" stroke-linecap="round" fill="none"/>
  <path d="M50 50 L28 12 M44 54 L22 16 M38 58 L16 20" stroke="#F09595" stroke-width="3" stroke-linecap="round" fill="none"/>
</svg>`;

const TOOLTIP_LINES = [
    `Swipe left, swipe right, then rake both claws in an X for {{DAMAGE}} x ${BLOODY_CLAWS_HITBOX_COUNT} damage.`,
    `Each claw hits up to {${BLOODY_CLAWS_TARGETS_PER_CLAW}} enemies and adds {${BLOODY_CLAWS_BLEED_STACKS}} {bleeding} stack.`,
    `Costs {${BLOODY_CLAWS_HP_COST}} HP to cast.`,
] as const;

const TOOLTIP_BINDINGS: TooltipTokenBindings = {
    DAMAGE: { kind: 'damage', base: BLOODY_CLAWS_DAMAGE },
};

export const BloodyClawsAbility_0306 = defineAbility({
    id: CARD_ID,
    tags: ['melee'],
    name: 'Bloody Claws',
    image: BLOODY_CLAWS_IMAGE,
    resourceCost: null,
    hpCost: BLOODY_CLAWS_HP_COST,
    // Default 'requireSurplus' gate (hp > cost to cast); paid on the first swipe.
    rechargeTurns: 1,
    maxUses: BLOODY_CLAWS_MAX_USES,
    recoveries: BLOODY_CLAWS_RECOVERIES,
    prefireTime: BLOODY_CLAWS_TIMINGS.swipeLeftImpact,
    targets: [],
    abilityTimings: COMBO.abilityTimings,
    movementLock: { until: BLOODY_CLAWS_TIMINGS.xStrikeEnd },
    // Step lunges extend each strike's reach (defineAbility adds the largest to getRange too).
    aiSettings: { minRange: 0, maxRange: COMBO.aiMaxRange },
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

export const BloodyClawsCard_0306: CardDef = {
    abilityId: CARD_ID,
};

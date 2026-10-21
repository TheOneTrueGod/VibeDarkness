/**
 * Bloody Claws — a fast three-beat melee combo: swipe left, swipe right, then rake both claws
 * in a crossing X. Each claw is a long, thin slash fixed in front of the caster ("/o\" with the
 * claws crossing just ahead), and every claw that connects adds bleed. Strikes two and three are
 * re-aimed independently but may only turn a little from the previous strike.
 */

import type { AbilityRecoveryRule } from '../../../abilities/Ability';
import { AbilityEventType } from '../../../abilities/Ability';
import { AbilityPhase, type AbilityTimingInterval } from '../../../abilities/abilityTimings';
import type { CastBehaviourEntry, CastBehaviourTickContext } from '../../../abilities/castBehaviourTypes';
import { CastBehaviours } from '../../../abilities/CastBehaviours';
import { defineAbility } from '../../../abilities/defineAbility';
import { payHpCostBehaviour } from '../../../abilities/hpCost';
import { resolveTooltipContext } from '../../../abilities/abilityModifierHelpers';
import { formatTooltipLegacyLines, type TooltipTokenBindings } from '../../../abilities/tooltipTokens';
import type { SelectTargetDef } from '../../../abilities/timingTargetDef';
import { aimFrameSegmentHitbox, type AimFrameSegmentHitboxSpec } from '../../../hitboxes';
import { DEFAULT_UNIT_RADIUS } from '../../../game/units/unit_defs/unitConstants';
import { Effect } from '../../../game/effects/Effect';
import { CLAW_SLASH_EFFECT_TYPE } from '../../../game/effect_defs/clawSlashEffects';
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
 * makes the motion unreadable, especially under the impact hit-pause.
 */
export const BLOODY_CLAWS_TIMINGS = {
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
} as const;
const T = BLOODY_CLAWS_TIMINGS;
/** Where `impact` falls within the strike window `[start, end)`, as window progress (0-1). */
function impactProgress(start: number, impact: number, end: number): number {
    return (impact - start) / (end - start);
}
/** Step lunges (real movement, px): the first swipe closes more distance than the follow-ups. */
export const BLOODY_CLAWS_FIRST_STRIKE_LUNGE = 20;
export const BLOODY_CLAWS_FOLLOW_UP_LUNGE = 15;
/** Each step lunge finishes just before its strike's impact (0.1s lead). */
export const BLOODY_CLAWS_LUNGE_DURATION = 0.08;
/** Small drawn slide on top of the step (no movement): ease forward into the hit, settle behind. */
export const BLOODY_CLAWS_STRIKE_SLIDE = { forwardDistance: 6, backwardDistance: 2 };
const NO_SLIDE = { forwardDistance: 0, backwardDistance: 0 };

const LABEL_SWIPE_LEFT = 'Swipe left';
const LABEL_SWIPE_RIGHT = 'Swipe right';
const LABEL_X_STRIKE = 'X strike';
const SLASH_DURATION = 0.22;

const RECOVERIES: AbilityRecoveryRule[] = [
    { chargeType: 'roundCharge', chargesPerRecovery: 1, usesRecovered: BLOODY_CLAWS_MAX_USES },
];

export const LEFT_CLAW_HITBOX: AimFrameSegmentHitboxSpec = aimFrameSegmentHitbox({
    from: BLOODY_CLAWS_CLAW_BASE,
    to: BLOODY_CLAWS_CLAW_TIP,
    halfThickness: BLOODY_CLAWS_CLAW_HALF_THICKNESS,
    numTargets: BLOODY_CLAWS_TARGETS_PER_CLAW,
});
export const RIGHT_CLAW_HITBOX: AimFrameSegmentHitboxSpec = LEFT_CLAW_HITBOX.mirrored();

/** Three claw streaks sweeping base -> tip along the claw that just struck. */
function spawnClawSlash(hitbox: AimFrameSegmentHitboxSpec) {
    return (ctx: CastBehaviourTickContext, _hitUnits: unknown[], aimX: number, aimY: number): void => {
        const seg = hitbox.getSegment(ctx.caster, { x: aimX, y: aimY });
        ctx.engine.addEffect(new Effect({
            x: seg.x0,
            y: seg.y0,
            duration: SLASH_DURATION,
            effectType: CLAW_SLASH_EFFECT_TYPE,
            effectData: { dx: seg.x1 - seg.x0, dy: seg.y1 - seg.y0, fingers: 3, spacing: 4 },
        }));
    };
}

/**
 * `impactAt`: where the hit lands within the strike window. `slide: false` for a second claw in the
 * same window, so the caster's drawn slide is not doubled.
 */
function claw(hitbox: AimFrameSegmentHitboxSpec, opts: { impactAt: number; slide?: boolean }) {
    return CastBehaviours.MeleeAttack()
        .withHitbox(hitbox)
        .withDamage(BLOODY_CLAWS_DAMAGE)
        // Each strike has its own select step; never borrow another strike's lock-ons or aim.
        .withOwnTargetOnly()
        .withImpactAt(opts.impactAt)
        .withSlide(opts.slide === false ? NO_SLIDE : BLOODY_CLAWS_STRIKE_SLIDE)
        .withImpactVFX(spawnClawSlash(hitbox));
}

function strike(...behaviours: ReturnType<typeof claw>[]): CastBehaviourEntry[] {
    return behaviours.map((behaviour) => ({ timingStart: 'start', timingEnd: 'end', behaviour }));
}

function clawSelect(
    label: string,
    hitbox: AimFrameSegmentHitboxSpec,
    opts: { lunge: number; turnFrom?: string; companion?: AimFrameSegmentHitboxSpec },
): SelectTargetDef {
    return {
        kind: 'select',
        label,
        hitbox,
        filter: 'enemy',
        allowMiss: true,
        lunge: { distance: opts.lunge, duration: BLOODY_CLAWS_LUNGE_DURATION },
        ...(opts.turnFrom ? { turnLimit: { fromLabel: opts.turnFrom, maxDegrees: BLOODY_CLAWS_MAX_TURN_DEGREES } } : {}),
        // The second claw strikes whether or not the first finds a target.
        ...(opts.companion ? { companionHitboxes: [{ hitbox: opts.companion, independent: true }] } : {}),
    };
}

const X_STRIKE_IMPACT_AT = impactProgress(T.xStrikeStart, T.xStrikeImpact, T.xStrikeEnd);

const ABILITY_TIMINGS: AbilityTimingInterval[] = [
    { id: 'windup', start: 0, end: T.windupEnd, abilityPhase: AbilityPhase.Windup },
    {
        id: 'swipe_left',
        start: T.windupEnd,
        end: T.swipeLeftEnd,
        abilityPhase: AbilityPhase.Active,
        doNotRefund: true,
        timelineLabel: 'Swipe left',
        targetDef: clawSelect(LABEL_SWIPE_LEFT, LEFT_CLAW_HITBOX, { lunge: BLOODY_CLAWS_FIRST_STRIKE_LUNGE }),
        castBehaviours: [
            { timingStart: 'start', behaviour: payHpCostBehaviour(BLOODY_CLAWS_HP_COST) },
            ...strike(claw(LEFT_CLAW_HITBOX, { impactAt: impactProgress(T.windupEnd, T.swipeLeftImpact, T.swipeLeftEnd) })),
        ],
    },
    { id: 'gap_1', start: T.swipeLeftEnd, end: T.swipeRightStart, abilityPhase: AbilityPhase.Waiting, timelineLabel: 'Between swipes' },
    {
        id: 'swipe_right',
        start: T.swipeRightStart,
        end: T.swipeRightEnd,
        abilityPhase: AbilityPhase.Active,
        timelineLabel: 'Swipe right',
        targetDef: clawSelect(LABEL_SWIPE_RIGHT, RIGHT_CLAW_HITBOX, {
            lunge: BLOODY_CLAWS_FOLLOW_UP_LUNGE,
            turnFrom: LABEL_SWIPE_LEFT,
        }),
        castBehaviours: strike(
            claw(RIGHT_CLAW_HITBOX, { impactAt: impactProgress(T.swipeRightStart, T.swipeRightImpact, T.swipeRightEnd) }),
        ),
    },
    { id: 'gap_2', start: T.swipeRightEnd, end: T.xStrikeStart, abilityPhase: AbilityPhase.Waiting, timelineLabel: 'Between swipes' },
    {
        id: 'x_strike',
        start: T.xStrikeStart,
        end: T.xStrikeEnd,
        abilityPhase: AbilityPhase.Active,
        timelineLabel: 'X strike',
        targetDef: clawSelect(LABEL_X_STRIKE, LEFT_CLAW_HITBOX, {
            lunge: BLOODY_CLAWS_FOLLOW_UP_LUNGE,
            turnFrom: LABEL_SWIPE_RIGHT,
            companion: RIGHT_CLAW_HITBOX,
        }),
        // Two independent claws: a unit where they cross is hit by both. The right claw is the
        // select's companion hitbox, so it tethers the companion lock-ons, not the left claw's.
        castBehaviours: strike(
            claw(LEFT_CLAW_HITBOX, { impactAt: X_STRIKE_IMPACT_AT }),
            claw(RIGHT_CLAW_HITBOX, { impactAt: X_STRIKE_IMPACT_AT, slide: false }).withLockOnRole('companion'),
        ),
    },
    { id: 'cooldown', start: T.xStrikeEnd, end: T.cooldownEnd, abilityPhase: AbilityPhase.Cooldown },
];

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
    recoveries: RECOVERIES,
    prefireTime: T.swipeLeftImpact,
    targets: [],
    abilityTimings: ABILITY_TIMINGS,
    movementLock: { until: T.xStrikeEnd },
    // Step lunges extend each strike's reach (defineAbility adds the largest to getRange too).
    aiSettings: { minRange: 0, maxRange: LEFT_CLAW_HITBOX.maxRange + BLOODY_CLAWS_FIRST_STRIKE_LUNGE },
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

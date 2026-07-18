/**
 * BeastClaw - Player melee ability from BeastCore.
 * Box in front of caster, slashing effect. Swings twice in opposite directions.
 * Knocks back away from caster on both swings.
 * Smaller knockback than Swing Bat, interrupt on hit.
 */

import { AbilityPhase } from '../../../abilities/abilityTimings';
import { AbilityGroupId, formatGroupId } from '../../AbilityGroupId';
import { createSlashTrailEffect } from '../../../abilities/effectHelpers';
import { convexQuadHitbox } from '../../../hitboxes/ConvexQuadHitbox';
import { CastBehaviours } from '../../../abilities/CastBehaviours';
import { defineAbility } from '../../../abilities/defineAbility';
import {
    ABILITY_DAMAGE_MODIFIER_MULTIPLIER_OVERRIDES,
    DEFAULT_DAMAGE_MODIFIER_MULTIPLIER,
} from '../../../abilities/damageModifiers';
import type { CardDef } from '../../types';

const CARD_ID = `${formatGroupId(AbilityGroupId.Utility)}11`;
const PREFIRE_TIME = 0.25;
const SWING1_START = 0.2;
const SWING1_END   = 0.3;
const SWING2_START = 0.6;
const SWING2_END   = 0.7;
const TOTAL_DURATION = PREFIRE_TIME + 2.3;
const DAMAGE = 8;
const CLAW_EFFECT_DURATION = 0.3;
const CLAW_SLASH_DELAY = 0.03;
const KNOCKBACK_TIER = 2;
const REACH = 10;
const BOX_SIZE = 28;

const HITBOX = convexQuadHitbox(REACH, BOX_SIZE);

/**
 * Spawn the triple slash-trail VFX for one swing.
 * `isSecondSwing` reverses the order so the two swings go in opposite directions.
 */
function spawnSlashVFX(
    corners: readonly { x: number; y: number }[],
    addEffect: (effect: import('../../../game/effects/Effect').Effect) => void,
    isSecondSwing: boolean,
): void {
    // corners layout: [0=near-left, 1=near-right, 2=far-right, 3=far-left]
    const slashes = [
        { startX: corners[0]!.x, startY: corners[0]!.y, endX: corners[3]!.x, endY: corners[3]!.y },
        {
            startX: (corners[0]!.x + corners[1]!.x) / 2,
            startY: (corners[0]!.y + corners[1]!.y) / 2,
            endX: (corners[3]!.x + corners[2]!.x) / 2,
            endY: (corners[3]!.y + corners[2]!.y) / 2,
        },
        { startX: corners[1]!.x, startY: corners[1]!.y, endX: corners[2]!.x, endY: corners[2]!.y },
    ];
    const order = isSecondSwing ? [2, 1, 0] : [0, 1, 2];
    for (let i = 0; i < order.length; i++) {
        const s = slashes[order[i]!]!;
        addEffect(createSlashTrailEffect(
            s.startX, s.startY, s.endX, s.endY,
            CLAW_EFFECT_DURATION, 16, 0xc9a055,
            i * CLAW_SLASH_DELAY,
        ));
    }
}

function makeSwingBehaviour(isSecondSwing: boolean) {
    return CastBehaviours.MeleeAttack()
        .withHitbox(HITBOX)
        .withDamage(DAMAGE, { attackType: 'melee' })
        .withKnockback(KNOCKBACK_TIER)
        .withImpactAt(0.4)
        .withSlide({ forwardDistance: 8, backwardDistance: 0 })
        .withImpactVFX((ctx, _hitUnits, aimX, aimY) => {
            const { corners } = HITBOX.getQuadGeometry(ctx.caster, { x: aimX, y: aimY });
            spawnSlashVFX(corners, ctx.engine.addEffect.bind(ctx.engine), isSecondSwing);
        });
}

const SWING1_BEHAVIOUR = makeSwingBehaviour(false);
const SWING2_BEHAVIOUR = makeSwingBehaviour(true);

const CLAW_IMAGE = `<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="beastClawGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#8b7355"/>
      <stop offset="50%" stop-color="#5d4e37"/>
      <stop offset="100%" stop-color="#3d3528"/>
    </linearGradient>
  </defs>
  <path d="M20 44 L26 32 L34 40 L42 28 M24 48 L30 36 L38 44" stroke="url(#beastClawGrad)" stroke-width="3" fill="none" stroke-linecap="round"/>
  <path d="M28 40 L32 28 L40 36" stroke="#8b7355" stroke-width="2" fill="none" stroke-linecap="round"/>
  <circle cx="32" cy="32" r="14" fill="#2d2d2d" stroke="#1a1a1a"/>
</svg>`;

export const BeastClawAbility = defineAbility({
    id: CARD_ID,
    name: 'Beast Claw',
    image: CLAW_IMAGE,
    resourceCost: null,
    rechargeTurns: 1,
    damageModifierMultiplier: ABILITY_DAMAGE_MODIFIER_MULTIPLIER_OVERRIDES[CARD_ID] ?? DEFAULT_DAMAGE_MODIFIER_MULTIPLIER,
    prefireTime: PREFIRE_TIME,
    targets: [{ type: 'pixel', label: 'Target point' }],
    abilityTimings: [
        { id: 'windup',   start: 0,           end: PREFIRE_TIME,  abilityPhase: AbilityPhase.Windup },
        {
            id: 'slash1',
            start: SWING1_START,
            end: SWING1_END,
            abilityPhase: AbilityPhase.Active,
            doNotRefund: true,
            targetDef: { kind: 'select', label: 'Target', hitbox: HITBOX, filter: 'enemy', allowMiss: true },
            behaviour: SWING1_BEHAVIOUR,
        },
        {
            id: 'gap',
            start: SWING1_END,
            end: SWING2_START,
            abilityPhase: AbilityPhase.Waiting,
            timelineLabel: 'Between slashes',
            timelineDescription: 'Brief pause before the second slash.',
        },
        {
            id: 'slash2',
            start: SWING2_START,
            end: SWING2_END,
            abilityPhase: AbilityPhase.Active,
            targetDef: { kind: 'select', label: 'Target', hitbox: HITBOX, filter: 'enemy', allowMiss: true },
            behaviour: SWING2_BEHAVIOUR,
        },
        {
            id: 'cooldown',
            start: SWING2_END,
            end: TOTAL_DURATION,
            abilityPhase: AbilityPhase.Cooldown,
        },
    ],
    aiSettings: {
        minRange: 0,
        maxRange: HITBOX.maxRange,
    },
    movementLock: { until: SWING2_END },
    getTooltipText(_gameState?: unknown): string[] {
        return [
            `Double slash in front dealing {${DAMAGE}} damage each hit. Interrupts and knocks back enemies.`,
        ];
    },
});

export const BeastClawCard: CardDef = {
    abilityId: CARD_ID,
};

/**
 * Swing Sword â€” Warrior melee (crafted sword).
 *
 * Perpendicular slash up to 2 targets, small knockback, metallic gray slash trail.
 * Each hit inflicts 3 Bleed stacks.
 * Composition-based refactor: all combat logic lives in CastBehaviours;
 * `beginActiveCast` survives only for the charge-up VFX.
 *
 * Timings:
 *   0.00â€“0.20  windup
 *   0.20â€“0.24  lunge forward (impactAt=0.4 â†’ fires 40% through the active window)
 *   0.24â€“0.30  backstep
 *   0.30â€“1.30  cooldown
 */

import { AbilityEventType, type AbilityRecoveryRule } from '../../abilities/Ability';
import { defineAbility } from '../../abilities/defineAbility';
import swordItemIconSvg from '../../character_defs/items/assets/013_sword.svg?raw';
import { AbilityPhase, type AbilityTimingInterval } from '../../abilities/abilityTimings';
import { CastBehaviours } from '../../abilities/CastBehaviours';
import { AbilityGroupId, formatGroupId } from '../AbilityGroupId';
import { DEFAULT_UNIT_RADIUS, DEFAULT_MELEE_LUNGE } from '../../game/units/unit_defs/unitConstants';
import { perpendicularSwingHitbox } from '../../hitboxes';
import { createSlashTrailEffect } from '../../abilities/effectHelpers';
import {
    createChargeUpConfig,
    spawnMeleeChargeUpEffect,
    type MeleeAnimationProfile,
} from '../../abilities/meleeAnimationProfile';
import type { Unit } from '../../game/units/Unit';
import type { ActiveAbility, ResolvedTarget } from '../../game/types';
import { type CardDef } from '../types';
import { Effect } from '../../game/effects/Effect';
import { resolveTooltipContext } from '../../abilities/abilityModifierHelpers';
import {
    formatTooltipLegacyLines,
    type TooltipTokenBindings,
} from '../../abilities/tooltipTokens';

const CARD_ID = `${formatGroupId(AbilityGroupId.Warrior)}12`;
export const SWORD_BASE_MAX_USES = 4;
const RECOVERIES: AbilityRecoveryRule[] = [
    { chargeType: 'staminaCharge', chargesPerRecovery: 1, usesRecovered: 1 },
];

const BASE_MAX_RANGE = 48;
export const SWING_SWORD_DAMAGE = 10;
const DAMAGE = SWING_SWORD_DAMAGE;
const KNOCKBACK_TIER = 1;
/** A bit more push than a plain tier-1 nudge. */
const KNOCKBACK_MAGNITUDE_SCALE = 1.5;
const MAX_TARGETS = 2;
const LINE_THICKNESS = 36;
const SWING_LENGTH = 80;
const SLASH_TRAIL_DURATION = 0.35;
const SLASH_TRAIL_THICKNESS = 14;
const SLASH_TRAIL_COLOR = 0xc0c8d0;
/** Bleed stacks applied to each unit the sword hits. */
const BLEED_STACKS_ON_HIT = 3;

const TOOLTIP_LINES = [
    'Slash with the sword dealing {{DAMAGE}} damage to up to {{MAX_TARGETS}} enemies, nudging them back. Inflicts {Bleed}.',
] as const;

const TOOLTIP_BINDINGS: TooltipTokenBindings = {
    DAMAGE: { kind: 'damage', base: DAMAGE },
    MAX_TARGETS: { kind: 'plain', value: MAX_TARGETS },
};

const SWING_SWORD_HITBOX = perpendicularSwingHitbox(BASE_MAX_RANGE, SWING_LENGTH, LINE_THICKNESS, MAX_TARGETS);

// ---- Charge-up VFX profile (used in beginActiveCast only) ----

const BASE_PROFILE: MeleeAnimationProfile = {
    chargeUp: createChargeUpConfig('medium', {
        startTime: 0.04,
        endTime: 0.1,
        radius: DEFAULT_UNIT_RADIUS,
        color: 0xb7c5d8,
    }),
};

function spawnChargeUp(engine: { addEffect(effect: Effect): void }, caster: Unit): void {
    if (!BASE_PROFILE.chargeUp) return;
    const chargeUp = {
        ...BASE_PROFILE.chargeUp,
        pulses: BASE_PROFILE.chargeUp.pulses.map(p => ({
            ...p,
            startRadius: p.startRadius + caster.radius - DEFAULT_UNIT_RADIUS,
            endRadius:   p.endRadius   + caster.radius - DEFAULT_UNIT_RADIUS,
        })),
    };
    spawnMeleeChargeUpEffect(engine, caster, { ...BASE_PROFILE, chargeUp });
}

// ---- Behaviour ----

const swingSwordBehaviour = CastBehaviours.MeleeAttack()
    .withHitbox(SWING_SWORD_HITBOX)
    .withSlide({ forwardDistance: 9, backwardDistance: 4 })
    .withImpactVFX((ctx, _hitUnits, aimX, aimY) => {
        const ep = SWING_SWORD_HITBOX.getEndpoints(ctx.caster, aimX, aimY);
        ctx.engine.addEffect(
            createSlashTrailEffect(
                ep.leftX, ep.leftY,
                ep.rightX, ep.rightY,
                SLASH_TRAIL_DURATION,
                SLASH_TRAIL_THICKNESS,
                SLASH_TRAIL_COLOR,
            ),
        );
    })
    .withDamage(DAMAGE)
    .withKnockback(KNOCKBACK_TIER, { magnitudeScale: KNOCKBACK_MAGNITUDE_SCALE });

// ---- Timings ----

const ABILITY_TIMINGS: AbilityTimingInterval[] = [
    { id: 'windup',   start: 0,   end: 0.2,  abilityPhase: AbilityPhase.Windup },
    { id: 'slash',    start: 0.2, end: 0.3,  abilityPhase: AbilityPhase.Active, doNotRefund: true,
      targetDef: { kind: 'select', label: 'Target', hitbox: SWING_SWORD_HITBOX, filter: 'enemy', allowMiss: true },
      behaviour: swingSwordBehaviour },
    { id: 'cooldown', start: 0.3, end: 1.3,  abilityPhase: AbilityPhase.Cooldown },
];

// ---- Image ----

/** Same icon as the sword equipment (raw SVG markup, as ability images are injected as HTML). */
const SWING_SWORD_IMAGE = swordItemIconSvg;

// ---- Ability export ----

export const SwingSwordAbility = defineAbility({
    id: CARD_ID,
    tags: ['melee'],
    name: 'Swing Sword',
    image: SWING_SWORD_IMAGE,
    resourceCost: null,
    resourceCosts: [],
    rechargeTurns: 1,
    maxUses: SWORD_BASE_MAX_USES,
    recoveries: RECOVERIES,
    prefireTime: 0.2,
    targets: [],
    abilityTimings: ABILITY_TIMINGS,
    aiSettings: { minRange: 0, maxRange: SWING_SWORD_HITBOX.maxRange + DEFAULT_MELEE_LUNGE },
    lunge: { distance: DEFAULT_MELEE_LUNGE },
    // movementLock: lock movement through windup; release on lunge.
    movementLock: { until: 0.2 },

    // Every unit the sword hits bleeds.
    abilityEvents: {
        [AbilityEventType.ON_ATTACK_HIT]: [
            {
                conditions: [{ type: 'hitResultIs', result: 'hit' }],
                effects: [{ type: 'applyBleedToPrimaryTarget', stacks: BLEED_STACKS_ON_HIT }],
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

    beginActiveCast(engine: unknown, caster: Unit, _targets: ResolvedTarget[], _active: ActiveAbility): void {
        spawnChargeUp(engine as { addEffect(effect: Effect): void }, caster);
    },
});

export const SwingSwordCard: CardDef = {
    abilityId: CARD_ID,
};

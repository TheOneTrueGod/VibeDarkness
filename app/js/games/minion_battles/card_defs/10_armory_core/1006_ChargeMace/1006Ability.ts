/**
 * Charge Mace — the strike a conjured Armory mace grants.
 *
 * Same swing as Swing Mace: reach, targets, knockback, and timing, at that swing's
 * base damage. Two uses, and no refill. Training Regime does not apply here.
 * Spending the last use discards the mace on the impact frame.
 *
 * Timings match Swing Mace:
 *   0.00–0.20  windup
 *   0.20–0.30  hit
 *   0.30–1.65  cooldown
 */

import { defineAbility } from '../../../abilities/defineAbility';
import chargeMaceSvg from '../chargeMace.svg?raw';
import { AbilityPhase, type AbilityTimingInterval } from '../../../abilities/abilityTimings';
import { CastBehaviours } from '../../../abilities/CastBehaviours';
import { MELEE_ATTACK_DEFAULT_IMPACT_AT } from '../../../abilities/CastBehaviours/MeleeAttack';
import type { CastBehaviourTickContext } from '../../../abilities/castBehaviourTypes';
import { releaseHeldConjuredWeapon } from '../../../game/conjuredWeapons/runtime';
import { DEFAULT_MELEE_LUNGE, DEFAULT_UNIT_RADIUS } from '../../../game/units/unit_defs/unitConstants';
import type { Unit } from '../../../game/units/Unit';
import type { ActiveAbility, ResolvedTarget } from '../../../game/types';
import { type CardDef } from '../../types';
import { Effect } from '../../../game/effects/Effect';
import { setupWindupLungePayload } from '../../../abilities/WindupLunge';
import {
    createChargeUpConfig,
    spawnRadiusScaledChargeUp,
    type MeleeAnimationProfile,
} from '../../../abilities/meleeAnimationProfile';
import { resolveTooltipContext } from '../../../abilities/abilityModifierHelpers';
import { formatTooltipLegacyLines, type TooltipTokenBindings } from '../../../abilities/tooltipTokens';
import {
    SWING_BAT_BASE_DAMAGE,
    SWING_BAT_COOLDOWN_END,
    SWING_BAT_EFFECT_DURATION,
    SWING_BAT_HIT_END,
    SWING_BAT_HITBOX,
    SWING_BAT_KNOCKBACK_TIER,
    SWING_BAT_SLIDE_BACKWARD,
    SWING_BAT_SLIDE_FORWARD,
    SWING_BAT_WINDUP_END,
} from '../../0115_SwingBat/0115Ability';
import {
    ARMORY_PRIMARY_COLOR_NUM,
    CHARGE_MACE_ABILITY_ID,
    CHARGE_MACE_MAX_USES,
} from '../armoryConstants';

const MAX_TARGETS = SWING_BAT_HITBOX.numTargets;
/** Game time of the swing hit, measured from the start of the cast. */
export const CHARGE_MACE_IMPACT_TIME = SWING_BAT_WINDUP_END
    + MELEE_ATTACK_DEFAULT_IMPACT_AT * (SWING_BAT_HIT_END - SWING_BAT_WINDUP_END);

const CHARGE_MACE_PROFILE: MeleeAnimationProfile = {
    chargeUp: createChargeUpConfig('high', {
        startTime: 0.04,
        endTime: 0.1,
        radius: DEFAULT_UNIT_RADIUS,
        color: ARMORY_PRIMARY_COLOR_NUM,
    }),
};

const TOOLTIP_LINES = [
    'A conjured mace. Swing for {{DAMAGE}} damage to up to {{MAX_TARGETS}} enemies.',
    `{knockback ${SWING_BAT_KNOCKBACK_TIER}}`,
] as const;

const TOOLTIP_BINDINGS: TooltipTokenBindings = {
    DAMAGE: { kind: 'damage', base: SWING_BAT_BASE_DAMAGE },
    MAX_TARGETS: { kind: 'plain', value: MAX_TARGETS },
};

const swing = CastBehaviours.MeleeAttack()
    .withHitbox(SWING_BAT_HITBOX)
    .withSlide({ forwardDistance: SWING_BAT_SLIDE_FORWARD, backwardDistance: SWING_BAT_SLIDE_BACKWARD })
    .withImpactVFX((ctx, _hitUnits, aimX, aimY) => {
        const ep = SWING_BAT_HITBOX.getEndpoints(ctx.caster, aimX, aimY);
        ctx.engine.addEffect(new Effect({
            x: ep.rightX,
            y: ep.rightY,
            startX: ep.leftX,
            startY: ep.leftY,
            duration: SWING_BAT_EFFECT_DURATION,
            effectType: 'punch',
        }));
        discardMaceOnLastImpact(ctx);
    })
    .withDamage(SWING_BAT_BASE_DAMAGE)
    .withKnockback(SWING_BAT_KNOCKBACK_TIER);

const ABILITY_TIMINGS: AbilityTimingInterval[] = [
    { id: 'windup', start: 0, end: SWING_BAT_WINDUP_END, abilityPhase: AbilityPhase.Windup },
    {
        id: 'hit',
        start: SWING_BAT_WINDUP_END,
        end: SWING_BAT_HIT_END,
        abilityPhase: AbilityPhase.Active,
        doNotRefund: true,
        targetDef: { kind: 'select', label: 'Target', hitbox: SWING_BAT_HITBOX, filter: 'enemy', allowMiss: true },
        behaviour: swing,
    },
    { id: 'cooldown', start: SWING_BAT_HIT_END, end: SWING_BAT_COOLDOWN_END, abilityPhase: AbilityPhase.Cooldown },
];

/** The last swing's uses are already spent by the impact frame. Earlier swings still have uses left. */
function discardMaceOnLastImpact(ctx: CastBehaviourTickContext): void {
    const uses = ctx.caster.abilityRuntime[CHARGE_MACE_ABILITY_ID]?.currentUses ?? 0;
    if (uses > 0) return;
    releaseHeldConjuredWeapon(ctx.caster, ctx.engine, { leaveToken: true });
}

export const ChargeMaceAbility_1006 = defineAbility({
    id: CHARGE_MACE_ABILITY_ID,
    tags: ['melee'],
    name: 'Charge Mace',
    image: chargeMaceSvg,
    resourceCost: null,
    resourceCosts: [],
    rechargeTurns: 1,
    maxUses: CHARGE_MACE_MAX_USES,
    recoveries: [],
    prefireTime: SWING_BAT_WINDUP_END,
    targets: [],
    abilityTimings: ABILITY_TIMINGS,
    aiSettings: { minRange: 0, maxRange: SWING_BAT_HITBOX.maxRange + DEFAULT_MELEE_LUNGE },
    lunge: { distance: DEFAULT_MELEE_LUNGE },
    movementLock: { until: SWING_BAT_WINDUP_END },
    getTooltipText(gameState?: unknown): string[] {
        return formatTooltipLegacyLines(
            TOOLTIP_LINES,
            TOOLTIP_BINDINGS,
            resolveTooltipContext(gameState, { ability: { id: CHARGE_MACE_ABILITY_ID } }),
        );
    },
    beginActiveCast(engine: unknown, caster: Unit, targets: ResolvedTarget[], active: ActiveAbility): void {
        setupWindupLungePayload(engine, caster, targets, active, { distance: DEFAULT_MELEE_LUNGE }, SWING_BAT_HITBOX.maxRange);
        spawnRadiusScaledChargeUp(engine as { addEffect(effect: Effect): void }, caster, CHARGE_MACE_PROFILE);
    },
});

export const ChargeMaceCard: CardDef = {
    abilityId: CHARGE_MACE_ABILITY_ID,
};

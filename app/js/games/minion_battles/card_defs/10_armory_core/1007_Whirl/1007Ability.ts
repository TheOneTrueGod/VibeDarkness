/**
 * Whirl — the release a conjured mace grants in place of Create Mace.
 *
 * One swing in a ring around the caster. After the windup, the player confirms
 * on their own position: the ring and the units in it are shown, and the click
 * can still be undone. It damages, knocks back, and stuns up to five enemies
 * in that ring. The mace then falls. One use. The weapon is gone either way.
 *
 * Timings match Swing Mace's windup and hit, then the same cooldown.
 */

import type { IAbilityPreviewGraphics } from '../../../abilities/Ability';
import { defineAbility } from '../../../abilities/defineAbility';
import whirlSvg from './whirl.svg?raw';
import { AbilityPhase, type AbilityTimingInterval } from '../../../abilities/abilityTimings';
import { CastBehaviours } from '../../../abilities/CastBehaviours';
import { MELEE_ATTACK_DEFAULT_IMPACT_AT } from '../../../abilities/CastBehaviours/MeleeAttack';
import type { CastBehaviourTickContext } from '../../../abilities/castBehaviourTypes';
import { releaseHeldConjuredWeapon } from '../../../game/conjuredWeapons/runtime';
import { tryApplyHardCcStun } from '../../../crowdControl/tryApplyHardCcStun';
import type { EngineContext } from '../../../game/EngineContext';
import { ringHitbox } from '../../../hitboxes';
import type { Unit } from '../../../game/units/Unit';
import { type CardDef } from '../../types';
import { DEFAULT_UNIT_RADIUS } from '../../../game/units/unit_defs/unitConstants';
import { Effect } from '../../../game/effects/Effect';
import { resolveTooltipContext } from '../../../abilities/abilityModifierHelpers';
import { formatTooltipLegacyLines, type TooltipTokenBindings } from '../../../abilities/tooltipTokens';
import {
    SWING_BAT_BASE_DAMAGE,
    SWING_BAT_COOLDOWN_END,
    SWING_BAT_HIT_END,
    SWING_BAT_KNOCKBACK_TIER,
    SWING_BAT_WINDUP_END,
} from '../../0115_SwingBat/0115Ability';
import { ARMORY_SECONDARY_COLOR_NUM, WHIRL_ABILITY_ID } from '../armoryConstants';
import {
    MACE_WHIRL_EFFECT_DURATION,
    MACE_WHIRL_INNER_CLEARANCE,
    MACE_WHIRL_MAX_TARGETS,
    MACE_WHIRL_OUTER_RADIUS,
    MACE_WHIRL_STUN_SECONDS,
    MACE_WHIRL_VISUAL_RADIUS,
} from './1007Constants';
import { WEAPON_WHIRL_EFFECT_TYPE } from '../../../game/effect_defs/weaponEffects';

/** Game time of the whirl hit, measured from the start of the cast. */
export const MACE_WHIRL_IMPACT_TIME = SWING_BAT_WINDUP_END
    + MELEE_ATTACK_DEFAULT_IMPACT_AT * (SWING_BAT_HIT_END - SWING_BAT_WINDUP_END);

export const WHIRL_TARGET_LABEL = 'Target';

const WHIRL_HITBOX = ringHitbox({
    innerRadius: (caster) => (caster?.radius ?? DEFAULT_UNIT_RADIUS) + MACE_WHIRL_INNER_CLEARANCE,
    outerRadius: MACE_WHIRL_OUTER_RADIUS,
    numTargets: MACE_WHIRL_MAX_TARGETS,
    previewStyle: {
        color: ARMORY_SECONDARY_COLOR_NUM,
        lineWidth: 2,
        lineAlpha: 0,
        fillAlpha: 0.12,
        strokeAlpha: 0.85,
        showCrosshair: false,
    },
});

const TOOLTIP_LINES = [
    'Deal {{DAMAGE}} damage to {{MAX_TARGETS}} adjacent enemies. The mace drops.',
    `{knockback ${SWING_BAT_KNOCKBACK_TIER}}`,
    `{Stun ${MACE_WHIRL_STUN_SECONDS}}`,
] as const;

const TOOLTIP_BINDINGS: TooltipTokenBindings = {
    DAMAGE: { kind: 'damage', base: SWING_BAT_BASE_DAMAGE },
    MAX_TARGETS: { kind: 'plain', value: MACE_WHIRL_MAX_TARGETS },
};

const whirl = CastBehaviours.MeleeAttack()
    .withHitbox(WHIRL_HITBOX)
    .withLockOnMode('strictHitbox')
    .withImpactVFX((ctx) => {
        ctx.engine.addEffect(new Effect({
            x: ctx.caster.x,
            y: ctx.caster.y,
            duration: MACE_WHIRL_EFFECT_DURATION,
            effectType: WEAPON_WHIRL_EFFECT_TYPE,
            timeDomain: 'wall',
            pauseBehaviour: 'continue',
            effectData: { radius: MACE_WHIRL_VISUAL_RADIUS, color: ARMORY_SECONDARY_COLOR_NUM },
        }));
        releaseHeldConjuredWeapon(ctx.caster, ctx.engine, { leaveToken: true });
    })
    .withDamage(SWING_BAT_BASE_DAMAGE)
    .withKnockback(SWING_BAT_KNOCKBACK_TIER)
    .onDamage((ctx, unit) => {
        stunWhirlTarget(ctx, unit);
    });

const ABILITY_TIMINGS: AbilityTimingInterval[] = [
    { id: 'windup', start: 0, end: SWING_BAT_WINDUP_END, abilityPhase: AbilityPhase.Windup },
    {
        id: 'hit',
        start: SWING_BAT_WINDUP_END,
        end: SWING_BAT_HIT_END,
        abilityPhase: AbilityPhase.Active,
        doNotRefund: true,
        targetDef: {
            kind: 'select',
            label: WHIRL_TARGET_LABEL,
            hitbox: WHIRL_HITBOX,
            filter: 'enemy',
            allowMiss: true,
            confirmAtCaster: true,
            lockOnMode: 'strictHitbox',
        },
        behaviour: whirl,
    },
    { id: 'cooldown', start: SWING_BAT_HIT_END, end: SWING_BAT_COOLDOWN_END, abilityPhase: AbilityPhase.Cooldown },
];

function stunWhirlTarget(ctx: CastBehaviourTickContext, unit: Unit): void {
    const result = tryApplyHardCcStun(
        unit,
        MACE_WHIRL_STUN_SECONDS,
        ctx.engine.gameTime,
        ctx.engine.roundNumber ?? 0,
        ctx.engine.eventBus,
    );
    if (result.outcome === 'applied') {
        unit.interruptAllAbilities(ctx.engine as EngineContext);
    }
}

export const WhirlAbility_1007 = defineAbility({
    id: WHIRL_ABILITY_ID,
    tags: ['melee'],
    name: 'Whirl',
    flavorText: 'You spin once, then hand the weight back to the earth.',
    image: whirlSvg,
    resourceCost: null,
    resourceCosts: [],
    rechargeTurns: 1,
    maxUses: 1,
    recoveries: [],
    prefireTime: SWING_BAT_WINDUP_END,
    targets: [],
    getRange: () => ({ minRange: 0, maxRange: MACE_WHIRL_OUTER_RADIUS }),
    abilityTimings: ABILITY_TIMINGS,
    movementLock: { until: SWING_BAT_WINDUP_END },
    getTooltipText(gameState?: unknown): string[] {
        return formatTooltipLegacyLines(
            TOOLTIP_LINES,
            TOOLTIP_BINDINGS,
            resolveTooltipContext(gameState, { ability: { id: WHIRL_ABILITY_ID } }),
        );
    },
    renderTargetingPreview(
        gr: IAbilityPreviewGraphics,
        caster: Unit,
        _currentTargets: unknown[],
        _mouseWorld: { x: number; y: number },
        units: Unit[],
    ): void {
        WHIRL_HITBOX.renderTargetingPreview(gr, caster, { x: caster.x, y: caster.y }, units);
    },
});

export const WhirlCard: CardDef = {
    abilityId: WHIRL_ABILITY_ID,
};

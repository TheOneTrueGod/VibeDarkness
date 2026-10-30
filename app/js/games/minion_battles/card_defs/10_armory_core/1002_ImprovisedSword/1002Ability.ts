/**
 * Improvised Sword — the strike a conjured Armory sword grants.
 *
 * Same slash as Swing Sword (reach, bleed, knockback) at a higher damage, two uses,
 * and no refill. Spending the last use discards the weapon on the slash's impact frame.
 * The token exists then; its resting picture stays hidden until the toss finishes.
 * Tagged melee and sword. Swing Sword modifiers do not apply here.
 *
 * Timings match Swing Sword:
 *   0.00–0.20  windup
 *   0.20–0.30  slash
 *   0.30–1.30  cooldown
 */

import { AbilityEventType } from '../../../abilities/Ability';
import { defineAbility } from '../../../abilities/defineAbility';
import swordItemIconSvg from '../../../character_defs/items/assets/013_sword.svg?raw';
import { AbilityPhase, type AbilityTimingInterval } from '../../../abilities/abilityTimings';
import { CastBehaviours } from '../../../abilities/CastBehaviours';
import { MELEE_ATTACK_DEFAULT_IMPACT_AT } from '../../../abilities/CastBehaviours/MeleeAttack';
import type { CastBehaviourTickContext } from '../../../abilities/castBehaviourTypes';
import { releaseHeldConjuredWeapon } from '../../../game/conjuredWeapons/runtime';
import { createSlashTrailEffect } from '../../../abilities/effectHelpers';
import { DEFAULT_MELEE_LUNGE } from '../../../game/units/unit_defs/unitConstants';
import type { Unit } from '../../../game/units/Unit';
import type { ActiveAbility, ResolvedTarget } from '../../../game/types';
import { type CardDef } from '../../types';
import { resolveTooltipContext } from '../../../abilities/abilityModifierHelpers';
import { formatTooltipLegacyLines, type TooltipTokenBindings } from '../../../abilities/tooltipTokens';
import {
    SWING_SWORD_BLEED_STACKS,
    SWING_SWORD_HITBOX,
    SWING_SWORD_KNOCKBACK_MAGNITUDE_SCALE,
    SWING_SWORD_KNOCKBACK_TIER,
    SwingSwordAbility,
} from '../../0112_SwingSword/0112Ability';
import {
    IMPROVISED_SWORD_ABILITY_ID,
    IMPROVISED_SWORD_COOLDOWN_END,
    IMPROVISED_SWORD_DAMAGE,
    IMPROVISED_SWORD_MAX_USES,
    IMPROVISED_SWORD_SLASH_END,
    IMPROVISED_SWORD_SLASH_START,
} from '../armoryConstants';
import '../armoryWeapons';

const MAX_TARGETS = SWING_SWORD_HITBOX.numTargets;
/** Game time of the slash hit, measured from the start of the cast. */
export const IMPROVISED_SWORD_IMPACT_TIME = IMPROVISED_SWORD_SLASH_START
    + MELEE_ATTACK_DEFAULT_IMPACT_AT * (IMPROVISED_SWORD_SLASH_END - IMPROVISED_SWORD_SLASH_START);
const SLASH_TRAIL_DURATION = 0.35;
const SLASH_TRAIL_THICKNESS = 14;
const SLASH_TRAIL_COLOR = 0xe7e5e4;

const TOOLTIP_LINES = [
    'A conjured blade. Slash up to {{MAX_TARGETS}} enemies for {{DAMAGE}} damage.',
    `{Bleed ${SWING_SWORD_BLEED_STACKS}}`,
    `{knockback ${SWING_SWORD_KNOCKBACK_TIER}}`,
] as const;

const TOOLTIP_BINDINGS: TooltipTokenBindings = {
    DAMAGE: { kind: 'damage', base: IMPROVISED_SWORD_DAMAGE },
    MAX_TARGETS: { kind: 'plain', value: MAX_TARGETS },
};

const slash = CastBehaviours.MeleeAttack()
    .withHitbox(SWING_SWORD_HITBOX)
    .withSlide({ forwardDistance: 9, backwardDistance: 4 })
    .withImpactVFX((ctx, _hitUnits, aimX, aimY) => {
        const ep = SWING_SWORD_HITBOX.getEndpoints(ctx.caster, aimX, aimY);
        ctx.engine.addEffect(createSlashTrailEffect(
            ep.leftX, ep.leftY, ep.rightX, ep.rightY,
            SLASH_TRAIL_DURATION, SLASH_TRAIL_THICKNESS, SLASH_TRAIL_COLOR,
        ));
        discardSwordOnLastImpact(ctx);
    })
    .withDamage(IMPROVISED_SWORD_DAMAGE)
    .withKnockback(SWING_SWORD_KNOCKBACK_TIER, { magnitudeScale: SWING_SWORD_KNOCKBACK_MAGNITUDE_SCALE });

const ABILITY_TIMINGS: AbilityTimingInterval[] = [
    { id: 'windup', start: 0, end: IMPROVISED_SWORD_SLASH_START, abilityPhase: AbilityPhase.Windup },
    {
        id: 'slash',
        start: IMPROVISED_SWORD_SLASH_START,
        end: IMPROVISED_SWORD_SLASH_END,
        abilityPhase: AbilityPhase.Active,
        doNotRefund: true,
        targetDef: { kind: 'select', label: 'Target', hitbox: SWING_SWORD_HITBOX, filter: 'enemy', allowMiss: true },
        behaviour: slash,
    },
    { id: 'cooldown', start: IMPROVISED_SWORD_SLASH_END, end: IMPROVISED_SWORD_COOLDOWN_END, abilityPhase: AbilityPhase.Cooldown },
];

/** The last swing's uses are already spent by the impact frame. Earlier swings still have uses left. */
function discardSwordOnLastImpact(ctx: CastBehaviourTickContext): void {
    const uses = ctx.caster.abilityRuntime[IMPROVISED_SWORD_ABILITY_ID]?.currentUses ?? 0;
    if (uses > 0) return;
    releaseHeldConjuredWeapon(ctx.caster, ctx.engine, { leaveToken: true });
}

export const ImprovisedSwordAbility = defineAbility({
    id: IMPROVISED_SWORD_ABILITY_ID,
    tags: ['melee', 'sword'],
    name: 'Improvised Sword',
    image: swordItemIconSvg,
    resourceCost: null,
    resourceCosts: [],
    rechargeTurns: 1,
    maxUses: IMPROVISED_SWORD_MAX_USES,
    recoveries: [],
    prefireTime: IMPROVISED_SWORD_SLASH_START,
    targets: [],
    abilityTimings: ABILITY_TIMINGS,
    aiSettings: { minRange: 0, maxRange: SWING_SWORD_HITBOX.maxRange + DEFAULT_MELEE_LUNGE },
    lunge: { distance: DEFAULT_MELEE_LUNGE },
    movementLock: { until: IMPROVISED_SWORD_SLASH_START },
    abilityEvents: {
        [AbilityEventType.ON_ATTACK_HIT]: [
            {
                conditions: [{ type: 'hitResultIs', result: 'hit' }],
                effects: [{ type: 'applyBleedToPrimaryTarget', stacks: SWING_SWORD_BLEED_STACKS }],
            },
        ],
    },
    getTooltipText(gameState?: unknown): string[] {
        return formatTooltipLegacyLines(
            TOOLTIP_LINES,
            TOOLTIP_BINDINGS,
            resolveTooltipContext(gameState, { ability: { id: IMPROVISED_SWORD_ABILITY_ID } }),
        );
    },
    beginActiveCast(engine: unknown, caster: Unit, targets: ResolvedTarget[], active: ActiveAbility): void {
        SwingSwordAbility.beginActiveCast?.(engine, caster, targets, active);
    },
});

export const ImprovisedSwordCard: CardDef = {
    abilityId: IMPROVISED_SWORD_ABILITY_ID,
};

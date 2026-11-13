/**
 * Whirl — the release a conjured mace grants in place of Create Mace.
 *
 * One spin in a ring around the caster. After the windup, the player confirms
 * on their own position: the ring and the units in it are shown, and the click
 * can still be undone. The spin is an arc sweep (`CastBehaviours.ArcSweep`): one
 * arc segment a tick turns around the caster, fading from Armory primary to
 * secondary, and each segment strikes what it covers. It damages, knocks back,
 * and stuns up to five enemies. The mace falls as the spin starts. One use.
 * Costs Charge. Echo: the same whirlwind turns around each of the caster's dropped
 * maces, which are destroyed. The mace this whirl drops does not echo.
 *
 * The windup and cooldown match Swing Mace; the hit window is as long as the sweep.
 */

import type { IAbilityPreviewGraphics } from '../../../abilities/Ability';
import { defineAbility } from '../../../abilities/defineAbility';
import whirlSvg from './whirl.svg?raw';
import { AbilityPhase, type AbilityTimingInterval } from '../../../abilities/abilityTimings';
import { CastBehaviours } from '../../../abilities/CastBehaviours';
import { sweepSeconds, type ArcSweepConfig } from '../../../abilities/CastBehaviours/ArcSweepBehaviour';
import { releaseHeldConjuredWeapon } from '../../../game/conjuredWeapons/runtime';
import { ringHitbox } from '../../../hitboxes';
import type { Unit } from '../../../game/units/Unit';
import { type CardDef } from '../../types';
import { DEFAULT_UNIT_RADIUS } from '../../../game/units/unit_defs/unitConstants';
import { resolveTooltipContext } from '../../../abilities/abilityModifierHelpers';
import { formatTooltipLegacyLines, type TooltipTokenBindings } from '../../../abilities/tooltipTokens';
import { drawEchoBurstPreviews, formatEchoLine } from '../../../abilities/echo/echo';
import { ResourceId } from '../../../resources/resourceIds';
import {
    SWING_BAT_COOLDOWN_END,
    SWING_BAT_KNOCKBACK_TIER,
    SWING_BAT_WINDUP_END,
} from '../../0115_SwingBat/0115Ability';
import {
    ARMORY_ECHO_CHARGE_COST,
    ARMORY_ECHO,
    ARMORY_PRIMARY_COLOR_NUM,
    ARMORY_SECONDARY_COLOR_NUM,
    WHIRL_ABILITY_ID,
} from '../armoryConstants';
import {
    MACE_WHIRL_INNER_CLEARANCE,
    MACE_WHIRL_MAX_TARGETS,
    MACE_WHIRL_OUTER_RADIUS,
    MACE_WHIRL_SEGMENT_LIFETIME,
    MACE_WHIRL_SEGMENT_SECONDS,
    MACE_WHIRL_SEGMENTS,
    MACE_WHIRL_STUN_SECONDS,
    WHIRL_DAMAGE,
} from './1007Constants';

const WHIRL_SWEEP: ArcSweepConfig = {
    innerRadius: (caster) => caster.radius + MACE_WHIRL_INNER_CLEARANCE,
    outerRadius: MACE_WHIRL_OUTER_RADIUS,
    segments: MACE_WHIRL_SEGMENTS,
    segmentSeconds: MACE_WHIRL_SEGMENT_SECONDS,
    segmentLifetime: MACE_WHIRL_SEGMENT_LIFETIME,
    maxTargets: MACE_WHIRL_MAX_TARGETS,
    strike: {
        damage: WHIRL_DAMAGE,
        knockbackTier: SWING_BAT_KNOCKBACK_TIER,
        stunSeconds: MACE_WHIRL_STUN_SECONDS,
    },
    visual: { colorFrom: ARMORY_PRIMARY_COLOR_NUM, colorTo: ARMORY_SECONDARY_COLOR_NUM },
    echo: ARMORY_ECHO,
    onStart: (ctx) => releaseHeldConjuredWeapon(ctx.caster, ctx.engine, { leaveToken: true }),
};

/** Game time, from the start of the cast, when the whirl's last segment strikes. */
export const MACE_WHIRL_SWEEP_END = SWING_BAT_WINDUP_END + sweepSeconds(WHIRL_SWEEP);

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
    `{Knockback ${SWING_BAT_KNOCKBACK_TIER}}`,
    `{Stun ${MACE_WHIRL_STUN_SECONDS}}`,
    formatEchoLine(ARMORY_ECHO),
];

const TOOLTIP_BINDINGS: TooltipTokenBindings = {
    DAMAGE: { kind: 'damage', base: WHIRL_DAMAGE },
    MAX_TARGETS: { kind: 'plain', value: MACE_WHIRL_MAX_TARGETS },
};

const whirl = CastBehaviours.ArcSweep(WHIRL_SWEEP);

const ABILITY_TIMINGS: AbilityTimingInterval[] = [
    { id: 'windup', start: 0, end: SWING_BAT_WINDUP_END, abilityPhase: AbilityPhase.Windup },
    {
        id: 'hit',
        start: SWING_BAT_WINDUP_END,
        end: MACE_WHIRL_SWEEP_END,
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
    { id: 'cooldown', start: MACE_WHIRL_SWEEP_END, end: SWING_BAT_COOLDOWN_END, abilityPhase: AbilityPhase.Cooldown },
];

export const WhirlAbility_1007 = defineAbility({
    id: WHIRL_ABILITY_ID,
    tags: ['melee'],
    name: 'Whirl',
    flavorText: 'You spin once, then hand the weight back to the earth.',
    image: whirlSvg,
    resourceCost: { resourceId: ResourceId.Charge, amount: ARMORY_ECHO_CHARGE_COST },
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
    renderSelectTargetPreviewExtras(gr: IAbilityPreviewGraphics, caster: Unit, gameState?: unknown): void {
        drawEchoBurstPreviews(gr, gameState, caster, ARMORY_ECHO, MACE_WHIRL_OUTER_RADIUS, {
            color: ARMORY_SECONDARY_COLOR_NUM,
        });
    },
});

export const WhirlCard: CardDef = {
    abilityId: WHIRL_ABILITY_ID,
};

/**
 * Shaking Ground: an Earth Core quake. After a short windup the ground shakes in a 100px radius
 * around the caster, damaging every enemy in it, and cracks the stone tile under the caster. Built on
 * `MeleeAttack` (circle hitbox at the caster) plus `TerrainStrike`, so the hit and the rock damage
 * share one cast window and no `doCardEffect` is needed.
 */

import type { AbilityStatic, IAbilityPreviewGraphics } from '../../../abilities/Ability';
import { AbilityPhase, type AbilityTimingInterval } from '../../../abilities/abilityTimings';
import { CastBehaviours } from '../../../abilities/CastBehaviours';
import type { Unit } from '../../../game/units/Unit';
import { type CardDef } from '../../types';
import { SHAKING_GROUND_ABILITY_ID } from '../../../abilities/earthCoreMeleePassives';
import { formatTooltipLegacyLines, type TooltipTokenBindings } from '../../../abilities/tooltipTokens';
import { resolveTooltipContext } from '../../../abilities/abilityModifierHelpers';

const RADIUS = 100;
const DAMAGE = 10;
const TOOLTIP_LINES = [
    'Shake the ground in a {{RADIUS}} radius for {{DAMAGE}} damage',
    'Damages one stone tile under the caster',
] as const;
const TOOLTIP_BINDINGS: TooltipTokenBindings = {
    RADIUS: { kind: 'plain', value: RADIUS },
    DAMAGE: { kind: 'damage', base: DAMAGE },
};

/** Area hit around the caster. No lunge and no impact effect: the ground itself is the telegraph. */
const quakeHit = CastBehaviours.MeleeAttack()
    .withHitbox({ shape: 'circle', range: RADIUS })
    .withImpactAt(0)
    .withSlide({ forwardDistance: 0, backwardDistance: 0 })
    .withImpactVFX(() => {})
    .withDamage(DAMAGE);

/** Cracks the stone tile under the caster, after the hit. Default Earth Core stone damage. */
const quakeCrack = CastBehaviours.TerrainStrike().atPoint((ctx) => ctx.caster).damageRock();

const TIMINGS: AbilityTimingInterval[] = [
    { id: 'windup', start: 0, end: 0.35, abilityPhase: AbilityPhase.Windup },
    {
        id: 'quake',
        start: 0.35,
        end: 0.45,
        abilityPhase: AbilityPhase.Active,
        doNotRefund: true,
        castBehaviours: [
            { timingStart: 'start', timingEnd: 'end', behaviour: quakeHit },
            { timingStart: 'start', timingEnd: 'end', behaviour: quakeCrack },
        ],
    },
    { id: 'recover', start: 0.45, end: 1.5, abilityPhase: AbilityPhase.Cooldown },
];

export const ShakingGroundAbility: AbilityStatic = {
    id: SHAKING_GROUND_ABILITY_ID,
    name: 'Shaking Ground',
    image: '',
    resourceCost: null,
    resourceCosts: [{ resourceId: 'resonance', amount: 25 }],
    rechargeTurns: 2,
    prefireTime: 0.35,
    abilityTimings: TIMINGS,
    targets: [],
    getTooltipText(gameState?: unknown): string[] {
        return formatTooltipLegacyLines(
            TOOLTIP_LINES,
            TOOLTIP_BINDINGS,
            resolveTooltipContext(gameState, { ability: { id: SHAKING_GROUND_ABILITY_ID } }),
        );
    },
    getAbilityStates(): [] {
        return [];
    },
    renderTargetingPreview(
        gr: IAbilityPreviewGraphics,
        caster: Unit,
    ): void {
        gr.circle(caster.x, caster.y, RADIUS);
        gr.stroke({ width: 2, color: 0xc4b5fd, alpha: 0.9 });
    },
};

export const ShakingGroundCard: CardDef = {
    abilityId: SHAKING_GROUND_ABILITY_ID,
};

/**
 * Earthern Punch: an Earth Core melee strike. The caster punches a thick line toward the aim point
 * for 12 damage, plus 4 more against targets standing on stone. Built on `MeleeAttack` (no
 * `doCardEffect`); the stone bonus is a damage function, so the same shape serves any "stronger on
 * stone" punch.
 */

import type { IAbilityPreviewGraphics } from '../../../abilities/Ability';
import { defineAbility } from '../../../abilities/defineAbility';
import { AbilityPhase, type AbilityTimingInterval } from '../../../abilities/abilityTimings';
import { CastBehaviours } from '../../../abilities/CastBehaviours';
import type { Unit } from '../../../game/units/Unit';
import type { ResolvedTarget } from '../../../game/types';
import type { TargetDef } from '../../../abilities/targeting';
import { type CardDef } from '../../types';
import { EARTHERN_PUNCH_ABILITY_ID } from '../../../abilities/earthCoreMeleePassives';
import { getAimPointClampedToMaxRange } from '../../../abilities/targetHelpers';
import { ThickLineHitbox, meleeLineHitbox } from '../../../hitboxes';
import { isUnitOnStone } from '../../../abilities/earthCoreHelpers';
import { resolveTooltipContext } from '../../../abilities/abilityModifierHelpers';
import {
    formatTooltipLegacyLines,
    type TooltipTokenBindings,
} from '../../../abilities/tooltipTokens';

const MAX_RANGE = 75;
const LINE_THICKNESS = 20;
const BASE_DAMAGE = 12;
const STONE_BONUS_DAMAGE = 4;

const TOOLTIP_LINES = [
    'Punch through enemies for {{DAMAGE}} damage',
    'Deal +{{DAMAGE_2}} damage to targets standing on stone',
] as const;

const TOOLTIP_BINDINGS: TooltipTokenBindings = {
    DAMAGE: { kind: 'damage', base: BASE_DAMAGE },
    DAMAGE_2: { kind: 'damage', base: STONE_BONUS_DAMAGE },
};
const TARGETS: TargetDef[] = [{ type: 'pixel', label: 'Punch direction' }];

const PUNCH_HITBOX = meleeLineHitbox(MAX_RANGE, LINE_THICKNESS);

/** The strike lands on the first tick of the `hit` window (`impactAt(0)`), with no caster lunge. */
const punchBehaviour = CastBehaviours.MeleeAttack()
    .withHitbox(PUNCH_HITBOX)
    .withImpact('punch')
    .withImpactAt(0)
    .withSlide({ forwardDistance: 0, backwardDistance: 0 })
    .withDamage((ctx, unit) => BASE_DAMAGE + (isUnitOnStone(ctx.engine.terrainManager, unit) ? STONE_BONUS_DAMAGE : 0));

const TIMINGS: AbilityTimingInterval[] = [
    { id: 'windup', start: 0, end: 0.2, abilityPhase: AbilityPhase.Windup },
    { id: 'hit', start: 0.2, end: 0.3, abilityPhase: AbilityPhase.Active, doNotRefund: true, behaviour: punchBehaviour },
    { id: 'recover', start: 0.3, end: 1.1, abilityPhase: AbilityPhase.Cooldown },
];

export const EarthernPunchAbility = defineAbility({
    id: EARTHERN_PUNCH_ABILITY_ID,
    tags: ['melee'],
    name: 'Earthern Punch',
    image: '',
    resourceCost: null,
    rechargeTurns: 1,
    prefireTime: 0.2,
    abilityTimings: TIMINGS,
    targets: TARGETS,
    getTooltipText(gameState?: unknown): string[] {
        return formatTooltipLegacyLines(
            TOOLTIP_LINES,
            TOOLTIP_BINDINGS,
            resolveTooltipContext(gameState, { ability: { id: EARTHERN_PUNCH_ABILITY_ID } }),
        );
    },
    getRange(caster: Unit): { minRange: number; maxRange: number } {
        return { minRange: 0, maxRange: MAX_RANGE + caster.radius };
    },
    renderTargetingPreview(
        gr: IAbilityPreviewGraphics,
        caster: Unit,
        _currentTargets: ResolvedTarget[],
        mouseWorld: { x: number; y: number },
        _units: Unit[],
    ): void {
        const aim = getAimPointClampedToMaxRange(caster, mouseWorld, MAX_RANGE + caster.radius);
        ThickLineHitbox.renderTargetingPreview(gr, caster, aim, MAX_RANGE + caster.radius, LINE_THICKNESS);
    },
});

export const EarthernPunchCard: CardDef = {
    abilityId: EARTHERN_PUNCH_ABILITY_ID,
};

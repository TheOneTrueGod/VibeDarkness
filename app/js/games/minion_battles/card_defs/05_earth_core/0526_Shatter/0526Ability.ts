/**
 * Shatter: an Earth Core finisher. The caster picks a point; the enemy nearest to it takes 6 damage
 * plus twice the caster's Earth armour, and the stone beside that enemy is consumed. A `MeleeAttack`
 * over a "nearest enemy to the aim point" hitbox does the hit and `TerrainStrike` (consume mode) does
 * the rock, so no `doCardEffect` is needed.
 */

import type { IAbilityPreviewGraphics } from '../../../abilities/Ability';
import { defineAbility } from '../../../abilities/defineAbility';
import { AbilityPhase, type AbilityTimingInterval } from '../../../abilities/abilityTimings';
import { CastBehaviours } from '../../../abilities/CastBehaviours';
import type { HitboxDef } from '../../../abilities/hitboxDef';
import type { Unit } from '../../../game/units/Unit';
import type { ResolvedTarget } from '../../../game/types';
import type { TargetDef } from '../../../abilities/targeting';
import { resolveTargetToPoint } from '../../../abilities/targeting';
import { areEnemies } from '../../../game/teams';
import { type CardDef } from '../../types';
import { SHATTER_ABILITY_ID } from '../../../abilities/earthCoreMeleePassives';
import { getEarthCoreArmour } from '../../../abilities/earthCoreArmour';
import { resolveTooltipContext } from '../../../abilities/abilityModifierHelpers';
import {
    formatTooltipLegacyLines,
    type TooltipTokenBindings,
} from '../../../abilities/tooltipTokens';

const RANGE = 180;
const BASE_DAMAGE = 6;
const ARMOUR_TO_DAMAGE_RATIO = 2;

const TOOLTIP_LINES = [
    'Shatter a target for {{DAMAGE}} + {{ARMOUR_RATIO}}x current armour damage',
    'Consumes one nearby stone at the target',
] as const;

const TOOLTIP_BINDINGS: TooltipTokenBindings = {
    DAMAGE: { kind: 'damage', base: BASE_DAMAGE },
    ARMOUR_RATIO: { kind: 'plain', value: ARMOUR_TO_DAMAGE_RATIO },
};
/** Tile radius around the target's tile searched for the one rock to consume. */
const STONE_CONSUME_RADIUS = 1.5;
const TARGETS: TargetDef[] = [{ type: 'pixel', label: 'Shatter target' }];

/** The enemy nearest to `point`, at any distance (the pick is not range-limited), or undefined. */
function nearestEnemyTo(caster: Unit, point: { x: number; y: number }, units: readonly Unit[]): Unit | undefined {
    let best: Unit | undefined;
    let bestDistSq = Number.POSITIVE_INFINITY;
    for (const unit of units) {
        if (unit.id === caster.id || !unit.active || !unit.isAlive()) continue;
        if (!areEnemies(caster.teamId, unit.teamId)) continue;
        const distSq = (unit.x - point.x) ** 2 + (unit.y - point.y) ** 2;
        if (distSq < bestDistSq) {
            best = unit;
            bestDistSq = distSq;
        }
    }
    return best;
}

/** One hit: the enemy nearest to the aim point. */
const NEAREST_ENEMY_HITBOX: HitboxDef = {
    shape: 'custom',
    resolve: (caster, aim, units) => {
        const nearest = nearestEnemyTo(caster, aim, units);
        return nearest ? [nearest] : [];
    },
};

/**
 * Consumes the stone beside the enemy nearest to the aim point. It runs before the hit so both
 * resolve the same enemy: once the hit kills it, "nearest living enemy" would pick another one.
 */
const shatterStone = CastBehaviours.TerrainStrike()
    .atPoint((ctx) => {
        const aim = resolveTargetToPoint(ctx.target, ctx.engine);
        const nearest = aim ? nearestEnemyTo(ctx.caster, aim, ctx.engine.units) : undefined;
        return nearest ?? null;
    })
    .consumeRock(STONE_CONSUME_RADIUS);

const shatterHit = CastBehaviours.MeleeAttack()
    .withHitbox(NEAREST_ENEMY_HITBOX)
    .withImpactAt(0)
    .withSlide({ forwardDistance: 0, backwardDistance: 0 })
    .withImpactVFX(() => {})
    .withDamage((ctx) => BASE_DAMAGE + getEarthCoreArmour(ctx.caster) * ARMOUR_TO_DAMAGE_RATIO);

const TIMINGS: AbilityTimingInterval[] = [
    { id: 'windup', start: 0, end: 0.25, abilityPhase: AbilityPhase.Windup },
    {
        id: 'burst',
        start: 0.25,
        end: 0.35,
        abilityPhase: AbilityPhase.Active,
        doNotRefund: true,
        castBehaviours: [
            { timingStart: 'start', timingEnd: 'end', behaviour: shatterStone },
            { timingStart: 'start', timingEnd: 'end', behaviour: shatterHit },
        ],
    },
    { id: 'recover', start: 0.35, end: 1.2, abilityPhase: AbilityPhase.Cooldown },
];

export const ShatterAbility = defineAbility({
    id: SHATTER_ABILITY_ID,
    name: 'Shatter',
    image: '',
    resourceCost: null,
    resourceCosts: [{ resourceId: 'resonance', amount: 35 }],
    rechargeTurns: 2,
    prefireTime: 0.25,
    abilityTimings: TIMINGS,
    targets: TARGETS,
    getTooltipText(gameState?: unknown): string[] {
        return formatTooltipLegacyLines(
            TOOLTIP_LINES,
            TOOLTIP_BINDINGS,
            resolveTooltipContext(gameState, { ability: { id: SHATTER_ABILITY_ID } }),
        );
    },
    getRange(caster: Unit): { minRange: number; maxRange: number } {
        return { minRange: 0, maxRange: RANGE + caster.radius };
    },
    renderTargetingPreview(
        gr: IAbilityPreviewGraphics,
        _caster: Unit,
        _currentTargets: ResolvedTarget[],
        mouseWorld: { x: number; y: number },
    ): void {
        gr.circle(mouseWorld.x, mouseWorld.y, 30);
        gr.stroke({ width: 2, color: 0xf59e0b, alpha: 1 });
    },
});

export const ShatterCard: CardDef = {
    abilityId: SHATTER_ABILITY_ID,
};

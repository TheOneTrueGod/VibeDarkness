/**
 * Repair Post — toss a folded post onto an empty tile. It unfolds and, once each quarter round,
 * bursts its arcs outward and sends a green pulse that heals every ally within reach.
 *
 * The post is a deployable, not a unit: it cannot be attacked and does not block movement.
 * It pulses {@link REPAIR_POST_PULSES} times, then leaves. Costs Charge. One use, recovered at
 * each round start.
 *
 *   one pick: the tile (the ring shows the heal reach)
 *   the cast launches the folded post on the simulation clock
 *   the post appears when that projectile reaches the tile, then opens
 */

import type { AbilityRecoveryRule } from '../../../abilities/Ability';
import { ACTOR_ANIMATION_TYPE_ATTACK, ACTOR_ANIMATION_VARIANT_BURST } from '../../../game/animation/actorAnimation';
import { defineAbility } from '../../../abilities/defineAbility';
import { AbilityPhase, type AbilityTimingInterval } from '../../../abilities/abilityTimings';
import { CastBehaviours } from '../../../abilities/CastBehaviours';
import { groundPointHitbox } from '../../../hitboxes';
import { type CardDef } from '../../types';
import { resolveTooltipContext } from '../../../abilities/abilityModifierHelpers';
import { formatTooltipLegacyLines, type TooltipTokenBindings } from '../../../abilities/tooltipTokens';
import { ResourceId } from '../../../resources/resourceIds';
import type { CastBehaviourTickContext } from '../../../abilities/castBehaviourTypes';
import { deployablePlacementValidator } from '../../../abilities/archetypes/deployablePlacement';
import { spawnDeliveredDeployable } from '../../../game/fieldObjects/FieldObjectManager';
import type { Projectile } from '../../../game/projectiles/Projectile';
import repairPostSvg from './repairPost.svg?raw';
import {
    ARMORY_ABILITY_CHARGE_COST,
    ARMORY_REPAIR_POST_DEF_ID,
    REPAIR_POST_ABILITY_ID,
} from '../armoryConstants';
import {
    REPAIR_POST_BURST_DURATION,
    REPAIR_POST_COOLDOWN_END,
    REPAIR_POST_DEPLOY_WINDOW_END,
    REPAIR_POST_HEAL,
    REPAIR_POST_HEAL_RADIUS,
    REPAIR_POST_PLACE_LABEL,
    REPAIR_POST_PLACE_RANGE,
    REPAIR_POST_PLACE_RANGE_TILES,
    REPAIR_POST_PLACE_WINDOW_END,
    REPAIR_POST_PREVIEW_ALPHA,
    REPAIR_POST_PREVIEW_COLOR,
    REPAIR_POST_PULSES,
} from './1011Constants';

const RECOVERIES: AbilityRecoveryRule[] = [
    { chargeType: 'roundCharge', chargesPerRecovery: 1, usesRecovered: 1 },
];

/** The marker under the cursor is the heal reach, so the player can see who it will cover. */
const PLACE_HITBOX = groundPointHitbox(REPAIR_POST_PLACE_RANGE, {
    radius: REPAIR_POST_HEAL_RADIUS,
    color: REPAIR_POST_PREVIEW_COLOR,
    alpha: REPAIR_POST_PREVIEW_ALPHA,
});

export const validateRepairPostPlacement = deployablePlacementValidator(REPAIR_POST_PLACE_RANGE);

const TOOLTIP_LINES = [
    'Create a repair post within {{RANGE}} tiles that heals nearby allies for {{HEAL}}, {{PULSES}} times',
    'It heals once each quarter round.',
] as const;

const TOOLTIP_BINDINGS: TooltipTokenBindings = {
    RANGE: { kind: 'plain', value: REPAIR_POST_PLACE_RANGE_TILES },
    HEAL: { kind: 'plain', value: REPAIR_POST_HEAL },
    PULSES: { kind: 'plain', value: REPAIR_POST_PULSES },
};

const ABILITY_TIMINGS: AbilityTimingInterval[] = [
    {
        id: 'place',
        start: 0,
        end: REPAIR_POST_PLACE_WINDOW_END,
        abilityPhase: AbilityPhase.Windup,
        targetDef: {
            kind: 'select',
            label: REPAIR_POST_PLACE_LABEL,
            hitbox: PLACE_HITBOX,
            filter: 'any',
            allowMiss: true,
            clampPixelToRange: false,
            validatePick: validateRepairPostPlacement,
        },
    },
    {
        id: 'deploy',
        start: REPAIR_POST_PLACE_WINDOW_END,
        end: REPAIR_POST_DEPLOY_WINDOW_END,
        abilityPhase: AbilityPhase.Active,
        doNotRefund: true,
        behaviour: CastBehaviours.Instant((ctx) => deployRepairPost(ctx)),
    },
    {
        id: 'cooldown',
        start: REPAIR_POST_DEPLOY_WINDOW_END,
        end: REPAIR_POST_COOLDOWN_END,
        abilityPhase: AbilityPhase.Cooldown,
    },
];

export function deployRepairPost(ctx: CastBehaviourTickContext): void {
    const active = ctx.caster.activeAbilities.find((entry) => entry.abilityId === ctx.abilityId);
    const place = active?.targetsByLabel?.[REPAIR_POST_PLACE_LABEL]?.position
        ?? ctx.allTargets.find((target) => target.position)?.position;
    if (!place) return;
    ctx.engine.state?.fieldObjects?.launchDeployableDelivery(ctx.engine, {
        defId: ARMORY_REPAIR_POST_DEF_ID,
        fromX: ctx.caster.x,
        fromY: ctx.caster.y,
        toX: place.x,
        toY: place.y,
        facing: 0,
        teamId: ctx.caster.teamId,
        ownerUnitId: ctx.caster.id,
        abilityId: REPAIR_POST_ABILITY_ID,
    });
}

export const RepairPostAbility_1011 = defineAbility({
    id: REPAIR_POST_ABILITY_ID,
    tags: [],
    name: 'Repair Post',
    flavorText: 'Not every weapon is pointed outward.',
    image: repairPostSvg,
    resourceCost: { resourceId: ResourceId.Charge, amount: ARMORY_ABILITY_CHARGE_COST },
    resourceCosts: [],
    rechargeTurns: 1,
    maxUses: 1,
    recoveries: RECOVERIES,
    prefireTime: REPAIR_POST_PLACE_WINDOW_END,
    targets: [],
    abilityTimings: ABILITY_TIMINGS,
    movementLock: { until: REPAIR_POST_DEPLOY_WINDOW_END },
    /** Played by the placed post on each pulse: the arcs burst out, then retract. */
    animation: {
        type: ACTOR_ANIMATION_TYPE_ATTACK,
        variant: ACTOR_ANIMATION_VARIANT_BURST,
        duration: REPAIR_POST_BURST_DURATION,
    },
    onProjectileExpired(engine, caster, projectile): void {
        spawnDeliveredDeployable(engine, caster, projectile as Projectile, REPAIR_POST_ABILITY_ID, ARMORY_REPAIR_POST_DEF_ID);
    },
    getTooltipText(gameState?: unknown): string[] {
        return formatTooltipLegacyLines(
            TOOLTIP_LINES,
            TOOLTIP_BINDINGS,
            resolveTooltipContext(gameState, { ability: { id: REPAIR_POST_ABILITY_ID } }),
        );
    },
});

export const RepairPostCard: CardDef = {
    abilityId: REPAIR_POST_ABILITY_ID,
};

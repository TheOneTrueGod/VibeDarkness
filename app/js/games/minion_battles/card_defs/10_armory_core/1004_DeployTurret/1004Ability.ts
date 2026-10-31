/**
 * Deploy Turret — place a stationary turret (a deployable), then choose the direction it watches.
 *
 * The turret is not a unit. It cannot be attacked. It fires four rocks down a 45 degree
 * cone over one round, including a shot along its facing when the cone is empty.
 * Costs Charge. One use, recovered at each round start.
 *
 *   place, then facing, with no time between the two clicks
 *   the cast launches a folded-turret projectile on the simulation clock
 *   the turret appears when that projectile reaches the tile, then opens
 *
 * A cursor outside the ring, or on a blocked tile, is rejected. The ring stays visible.
 */

import type { AbilityRecoveryRule, IAbilityPreviewGraphics } from '../../../abilities/Ability';
import { ACTOR_ANIMATION_TYPE_ATTACK, ACTOR_ANIMATION_VARIANT_RANGED } from '../../../game/animation/actorAnimation';
import { defineAbility } from '../../../abilities/defineAbility';
import { AbilityPhase, type AbilityTimingInterval } from '../../../abilities/abilityTimings';
import { CastBehaviours } from '../../../abilities/CastBehaviours';
import { facingConeHitbox, groundPointHitbox } from '../../../hitboxes';
import { type CardDef } from '../../types';
import { resolveTooltipContext } from '../../../abilities/abilityModifierHelpers';
import { formatTooltipLegacyLines, type TooltipTokenBindings } from '../../../abilities/tooltipTokens';
import { ResourceId } from '../../../resources/resourceIds';
import type { CastBehaviourTickContext } from '../../../abilities/castBehaviourTypes';
import { deployablePlacementValidator } from '../../../abilities/archetypes/deployablePlacement';
import { spawnDeliveredDeployable } from '../../../game/fieldObjects/FieldObjectManager';
import type { Projectile } from '../../../game/projectiles/Projectile';
import {
    ARMORY_ABILITY_CHARGE_COST,
    ARMORY_TURRET_DEF_ID,
    DEPLOY_TURRET_ABILITY_ID,
} from '../armoryConstants';
import {
    TURRET_AIM_LABEL,
    TURRET_AIM_MIN_DISTANCE,
    TURRET_AIM_WINDOW_END,
    TURRET_BODY_PREVIEW_ALPHA,
    TURRET_CONE_HALF_ANGLE_RAD,
    TURRET_COOLDOWN_END,
    TURRET_DEPLOY_WINDOW_END,
    TURRET_PLACE_LABEL,
    TURRET_PLACE_RANGE,
    TURRET_PLACE_RANGE_TILES,
    TURRET_PLACE_WINDOW_END,
    TURRET_RANGED_ATTACK_DURATION,
    TURRET_SHOT_COUNT,
    TURRET_SHOT_DAMAGE,
    TURRET_SHOT_RANGE,
} from './1004Constants';
import { TURRET_BODY_COLOR } from '../../../game/effect_defs/turretDeployDraw';
import { TURRET_BODY_RADIUS } from '../../../game/effect_defs/turretDeployPose';

const RECOVERIES: AbilityRecoveryRule[] = [
    { chargeType: 'roundCharge', chargesPerRecovery: 1, usesRecovered: 1 },
];

const PLACE_HITBOX = groundPointHitbox(TURRET_PLACE_RANGE, {
    radius: TURRET_BODY_RADIUS,
    color: TURRET_BODY_COLOR,
    alpha: TURRET_BODY_PREVIEW_ALPHA,
});
const AIM_HITBOX = facingConeHitbox(TURRET_SHOT_RANGE, TURRET_CONE_HALF_ANGLE_RAD);

const TOOLTIP_LINES = [
    'Create a turret within {{RANGE}} tiles that shoots {{SHOTS}} times dealing {{DAMAGE}} damage',
    'It shoots down a narrow cone, once each quarter round.',
] as const;

const TOOLTIP_BINDINGS: TooltipTokenBindings = {
    RANGE: { kind: 'plain', value: TURRET_PLACE_RANGE_TILES },
    SHOTS: { kind: 'plain', value: TURRET_SHOT_COUNT },
    DAMAGE: { kind: 'damage', base: TURRET_SHOT_DAMAGE },
};

const TURRET_IMAGE = `<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <circle cx="32" cy="36" r="14" fill="#4f6d8c" stroke="#e7e5e4" stroke-width="3"/>
  <rect x="28" y="14" width="8" height="22" rx="2" fill="#e7e5e4" stroke="#4f6d8c" stroke-width="2"/>
</svg>`;

export interface TurretCastPayload {
    place?: { x: number; y: number };
    aim?: { x: number; y: number };
}

export const validateTurretPlacement = deployablePlacementValidator(TURRET_PLACE_RANGE);

const ABILITY_TIMINGS: AbilityTimingInterval[] = [
    {
        id: 'place',
        start: 0,
        end: TURRET_PLACE_WINDOW_END,
        abilityPhase: AbilityPhase.Windup,
        targetDef: {
            kind: 'select',
            label: TURRET_PLACE_LABEL,
            hitbox: PLACE_HITBOX,
            filter: 'any',
            allowMiss: true,
            clampPixelToRange: false,
            validatePick: validateTurretPlacement,
        },
        behaviour: CastBehaviours.Instant((ctx) => rememberTurretPick(ctx, 'place', TURRET_PLACE_LABEL)),
    },
    {
        id: 'aim',
        start: TURRET_PLACE_WINDOW_END,
        end: TURRET_AIM_WINDOW_END,
        abilityPhase: AbilityPhase.Windup,
        targetDef: {
            kind: 'select',
            label: TURRET_AIM_LABEL,
            hitbox: AIM_HITBOX,
            filter: 'any',
            allowMiss: true,
            chainImmediately: true,
            anchorLabel: TURRET_PLACE_LABEL,
            maxRangeFromAnchor: TURRET_SHOT_RANGE,
            minRangeFromAnchor: TURRET_AIM_MIN_DISTANCE,
        },
        behaviour: CastBehaviours.Instant((ctx) => rememberTurretPick(ctx, 'aim', TURRET_AIM_LABEL)),
    },
    {
        id: 'deploy',
        start: TURRET_AIM_WINDOW_END,
        end: TURRET_DEPLOY_WINDOW_END,
        abilityPhase: AbilityPhase.Active,
        doNotRefund: true,
        behaviour: CastBehaviours.Instant((ctx) => deployTurret(ctx)),
    },
    {
        id: 'cooldown',
        start: TURRET_DEPLOY_WINDOW_END,
        end: TURRET_COOLDOWN_END,
        abilityPhase: AbilityPhase.Cooldown,
    },
];

export function deployTurret(ctx: CastBehaviourTickContext): void {
    const payload = readPayload(ctx);
    const place = payload.place;
    const aim = payload.aim;
    if (!place || !aim) return;
    const facing = Math.atan2(aim.y - place.y, aim.x - place.x);
    ctx.engine.state?.fieldObjects?.launchDeployableDelivery(ctx.engine, {
        defId: ARMORY_TURRET_DEF_ID,
        fromX: ctx.caster.x,
        fromY: ctx.caster.y,
        toX: place.x,
        toY: place.y,
        facing,
        teamId: ctx.caster.teamId,
        ownerUnitId: ctx.caster.id,
        abilityId: DEPLOY_TURRET_ABILITY_ID,
    });
}


function rememberTurretPick(ctx: CastBehaviourTickContext, key: 'place' | 'aim', label: string): void {
    const active = ctx.caster.activeAbilities.find((entry) => entry.abilityId === ctx.abilityId);
    const labeled = active?.targetsByLabel?.[label];
    const pixels = ctx.allTargets.filter((target) => target.position);
    const fallback = key === 'aim' ? pixels[pixels.length - 1] : pixels[0];
    const point = labeled?.position ?? fallback?.position;
    if (!point || !active) return;
    const payload = readPayload(ctx);
    payload[key] = { x: point.x, y: point.y };
    active.castPayload = payload;
}

function drawTurretFootprint(gr: IAbilityPreviewGraphics, x: number, y: number): void {
    gr.circle(x, y, TURRET_BODY_RADIUS);
    gr.fill({ color: TURRET_BODY_COLOR, alpha: TURRET_BODY_PREVIEW_ALPHA });
}

function readPayload(ctx: CastBehaviourTickContext): TurretCastPayload {
    const active = ctx.caster.activeAbilities.find((entry) => entry.abilityId === ctx.abilityId);
    const payload = active?.castPayload;
    if (payload && typeof payload === 'object') return payload as TurretCastPayload;
    return {};
}

export const DeployTurretAbility = defineAbility({
    id: DEPLOY_TURRET_ABILITY_ID,
    tags: [],
    name: 'Deploy Turret',
    flavorText: 'Stone and scrap, folded tight, opening hungry.',
    image: TURRET_IMAGE,
    resourceCost: { resourceId: ResourceId.Charge, amount: ARMORY_ABILITY_CHARGE_COST },
    resourceCosts: [],
    rechargeTurns: 1,
    maxUses: 1,
    recoveries: RECOVERIES,
    prefireTime: TURRET_PLACE_WINDOW_END,
    targets: [],
    abilityTimings: ABILITY_TIMINGS,
    movementLock: { until: TURRET_DEPLOY_WINDOW_END },
    animation: {
        type: ACTOR_ANIMATION_TYPE_ATTACK,
        variant: ACTOR_ANIMATION_VARIANT_RANGED,
        duration: TURRET_RANGED_ATTACK_DURATION,
    },
    onProjectileExpired(engine, caster, projectile): void {
        spawnDeliveredDeployable(engine, caster, projectile as Projectile, DEPLOY_TURRET_ABILITY_ID, ARMORY_TURRET_DEF_ID);
    },
    renderTargetingPreviewSelectedTargets(gr, _caster, currentTargets, mouseWorld): void {
        const place = currentTargets[0]?.position;
        if (!place) return;
        AIM_HITBOX.renderTargetingPreview(gr, { x: place.x, y: place.y }, mouseWorld, []);
        drawTurretFootprint(gr, place.x, place.y);
    },
    getTooltipText(gameState?: unknown): string[] {
        return formatTooltipLegacyLines(
            TOOLTIP_LINES,
            TOOLTIP_BINDINGS,
            resolveTooltipContext(gameState, { ability: { id: DEPLOY_TURRET_ABILITY_ID } }),
        );
    },
});

export const DeployTurretCard: CardDef = {
    abilityId: DEPLOY_TURRET_ABILITY_ID,
};

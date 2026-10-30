/**
 * Deploy Turret — place a stationary sentry, then choose the direction it watches.
 *
 * The turret is not a unit. It cannot be attacked. It fires four rocks down a 45 degree
 * cone over one round, including a shot along its facing when the cone is empty.
 * Costs Charge. One use, recovered at each round start.
 *
 *   0.00–0.05  place on a walkable empty tile
 *   0.05–0.10  pick facing; the cone is previewed from the tile
 *   0.10–0.20  the turret appears
 */

import type { AbilityRecoveryRule } from '../../../abilities/Ability';
import { defineAbility } from '../../../abilities/defineAbility';
import { AbilityPhase, type AbilityTimingInterval } from '../../../abilities/abilityTimings';
import { CastBehaviours } from '../../../abilities/CastBehaviours';
import { facingConeHitbox, groundPointHitbox } from '../../../hitboxes';
import type { ResolvedTarget } from '../../../game/types';
import type { Unit } from '../../../game/units/Unit';
import { type CardDef } from '../../types';
import { resolveTooltipContext } from '../../../abilities/abilityModifierHelpers';
import { formatTooltipLegacyLines, type TooltipTokenBindings } from '../../../abilities/tooltipTokens';
import { ResourceId } from '../../../resources/resourceIds';
import type { CastBehaviourTickContext } from '../../../abilities/castBehaviourTypes';
import { isOpenLanding } from '../../../game/fieldObjects/landing';
import {
    ARMORY_ABILITY_CHARGE_COST,
    DEPLOY_TURRET_ABILITY_ID,
    TURRET_AIM_LABEL,
    TURRET_AIM_MIN_DISTANCE,
    TURRET_AIM_WINDOW_END,
    TURRET_CONE_HALF_ANGLE_RAD,
    TURRET_COOLDOWN_END,
    TURRET_DEPLOY_WINDOW_END,
    TURRET_PLACE_LABEL,
    TURRET_PLACE_RANGE,
    TURRET_PLACE_RANGE_TILES,
    TURRET_PLACE_WINDOW_END,
    TURRET_SHOT_COUNT,
    TURRET_SHOT_DAMAGE,
    TURRET_SHOT_RANGE,
} from '../armoryConstants';
import '../armoryWeapons';

const RECOVERIES: AbilityRecoveryRule[] = [
    { chargeType: 'roundCharge', chargesPerRecovery: 1, usesRecovered: 1 },
];

const PLACE_HITBOX = groundPointHitbox(TURRET_PLACE_RANGE);
const AIM_HITBOX = facingConeHitbox(TURRET_SHOT_RANGE, TURRET_CONE_HALF_ANGLE_RAD);

const TOOLTIP_LINES = [
    'Place a turret on an empty tile within {{RANGE}} tiles, then choose its facing.',
    'It fires {{SHOTS}} rocks down a narrow cone for {{DAMAGE}} each, then falls silent.',
] as const;

const TOOLTIP_BINDINGS: TooltipTokenBindings = {
    RANGE: { kind: 'plain', value: TURRET_PLACE_RANGE_TILES },
    SHOTS: { kind: 'plain', value: TURRET_SHOT_COUNT },
    DAMAGE: { kind: 'damage', base: TURRET_SHOT_DAMAGE },
};

const TURRET_IMAGE = `<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <circle cx="32" cy="36" r="14" fill="#a8a29e" stroke="#57534e" stroke-width="3"/>
  <rect x="28" y="14" width="8" height="22" rx="2" fill="#e7e5e4" stroke="#57534e" stroke-width="2"/>
</svg>`;

export interface TurretCastPayload {
    place?: { x: number; y: number };
    aim?: { x: number; y: number };
}

export function validateTurretPlacement(ctx: {
    caster: Unit;
    engine: unknown;
    pick: ResolvedTarget;
}): boolean {
    const point = ctx.pick.position;
    if (!point) return false;
    const dx = point.x - ctx.caster.x;
    const dy = point.y - ctx.caster.y;
    if (dx * dx + dy * dy > TURRET_PLACE_RANGE * TURRET_PLACE_RANGE) return false;
    const engine = ctx.engine as { terrainManager?: Parameters<typeof isOpenLanding>[0]['terrainManager']; units?: Unit[] };
    return isOpenLanding(
        { terrainManager: engine.terrainManager ?? null, units: engine.units ?? [] },
        point.x,
        point.y,
    );
}

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
    ctx.engine.state?.fieldObjects?.spawnSentry(ctx.engine, {
        x: place.x,
        y: place.y,
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

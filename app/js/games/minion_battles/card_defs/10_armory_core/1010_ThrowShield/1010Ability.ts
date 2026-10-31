/**
 * Throw Shield — hurl the conjured buckler. It strikes the first enemy, then bounces to the
 * nearest other enemy and falls there. With no second enemy in range it falls on the first.
 * A miss falls at max range. The token exists immediately; its picture stays hidden until the toss finishes.
 * Single use. Does not cost Charge. The trail is thicker than a bullet's and narrows to a point.
 * The card picture is the tipped buckler. Flight and the token use the upright one.
 */

import { defineAbility } from '../../../abilities/defineAbility';
import shieldThrowSvg from '../shieldThrow.svg?raw';
import { AbilityPhase, type AbilityTimingInterval } from '../../../abilities/abilityTimings';
import { CastBehaviours } from '../../../abilities/CastBehaviours';
import { nullHitbox } from '../../../hitboxes';
import { drawClampedLine } from '../../../abilities/previewHelpers';
import type { Projectile } from '../../../game/projectiles/Projectile';
import type { SpriteProjectileConfig } from '../../../game/projectiles/projectile_defs/types';
import { type CardDef } from '../../types';
import { resolveTooltipContext } from '../../../abilities/abilityModifierHelpers';
import { formatTooltipLegacyLines, type TooltipTokenBindings } from '../../../abilities/tooltipTokens';
import { THROW_RANGE } from '../../throwSharedTimings';
import type { CastBehaviourTickContext } from '../../../abilities/castBehaviourTypes';
import shieldProjectileUrl from '../shield.svg';
import {
    ARMORY_SECONDARY_COLOR_NUM,
    DROPPED_WEAPON_KIND_SHIELD,
    SHIELD_FOLLOWUP_USES,
    THROW_SHIELD_ABILITY_ID,
    THROW_SHIELD_ACTIVE_END,
    THROW_SHIELD_AIM_LABEL,
    THROW_SHIELD_BOUNCE_RANGE,
    THROW_SHIELD_COOLDOWN_END,
    THROW_SHIELD_DAMAGE,
    THROW_SHIELD_HIT_COUNT,
    THROW_SHIELD_HIT_RADIUS,
    THROW_SHIELD_SPRITE_SCALE,
    THROW_SHIELD_TRAIL_RADIUS,
    THROW_SHIELD_WINDUP_END,
    THROWN_WEAPON_SPIN_DEGREES_PER_SECOND,
    THROWN_WEAPON_SPEED,
} from '../armoryConstants';
import { launchThrownWeapon, leaveThrownWeapon } from '../thrownWeapon';
import '../armoryWeapons';

const THROW_SHIELD_SPRITE: SpriteProjectileConfig = {
    sprite: {
        fps: 8,
        scale: THROW_SHIELD_SPRITE_SCALE,
        frameFiles: [shieldProjectileUrl],
    },
    loop: true,
    animations: [{ type: 'rotation', mode: 'constant', degreesPerSecond: THROWN_WEAPON_SPIN_DEGREES_PER_SECOND }],
    trail: { effectType: 'BulletTrail' },
};

const TOOLTIP_LINES = [
    'Hurl the conjured buckler for {{DAMAGE}} damage. It bounces to one more nearby enemy, then your weapon returns.',
    'The buckler remains where it falls.',
] as const;

const TOOLTIP_BINDINGS: TooltipTokenBindings = {
    DAMAGE: { kind: 'damage', base: THROW_SHIELD_DAMAGE },
};

const ABILITY_TIMINGS: AbilityTimingInterval[] = [
    {
        id: 'windup',
        start: 0,
        end: THROW_SHIELD_WINDUP_END,
        abilityPhase: AbilityPhase.Windup,
        targetDef: {
            kind: 'select',
            label: THROW_SHIELD_AIM_LABEL,
            hitbox: nullHitbox,
            filter: 'any',
            allowMiss: true,
        },
    },
    {
        id: 'throw',
        start: THROW_SHIELD_WINDUP_END,
        end: THROW_SHIELD_ACTIVE_END,
        abilityPhase: AbilityPhase.Active,
        doNotRefund: true,
        behaviour: CastBehaviours.Instant((ctx) => launchThrownShield(ctx)),
    },
    {
        id: 'cooldown',
        start: THROW_SHIELD_ACTIVE_END,
        end: THROW_SHIELD_COOLDOWN_END,
        abilityPhase: AbilityPhase.Cooldown,
    },
];

function launchThrownShield(ctx: CastBehaviourTickContext): void {
    launchThrownWeapon(ctx, {
        abilityId: THROW_SHIELD_ABILITY_ID,
        speed: THROWN_WEAPON_SPEED,
        aimLabel: THROW_SHIELD_AIM_LABEL,
        damage: THROW_SHIELD_DAMAGE,
        spriteConfig: THROW_SHIELD_SPRITE,
        hitPolicy: { damagingHits: THROW_SHIELD_HIT_COUNT, overflow: 'stop' },
        bounceRange: THROW_SHIELD_BOUNCE_RANGE,
        hitRadius: THROW_SHIELD_HIT_RADIUS,
        trailRadius: THROW_SHIELD_TRAIL_RADIUS,
        trailTaper: true,
        trailColor: ARMORY_SECONDARY_COLOR_NUM,
    });
}

export const ThrowShieldAbility_1010 = defineAbility({
    id: THROW_SHIELD_ABILITY_ID,
    tags: [],
    name: 'Throw Shield',
    image: shieldThrowSvg,
    resourceCost: null,
    resourceCosts: [],
    rechargeTurns: 1,
    maxUses: SHIELD_FOLLOWUP_USES,
    recoveries: [],
    prefireTime: THROW_SHIELD_WINDUP_END,
    targets: [],
    abilityTimings: ABILITY_TIMINGS,
    aiSettings: { minRange: 0, maxRange: THROW_RANGE },
    onProjectileExpired(engine, caster, projectile): void {
        leaveThrownWeapon(engine, caster, projectile as Projectile, DROPPED_WEAPON_KIND_SHIELD, THROW_SHIELD_ABILITY_ID);
    },
    renderTargetingPreviewSelectedTargets(gr, caster, _currentTargets, mouseWorld): void {
        drawClampedLine(gr, caster, mouseWorld, THROW_RANGE);
    },
    getTooltipText(gameState?: unknown): string[] {
        return formatTooltipLegacyLines(
            TOOLTIP_LINES,
            TOOLTIP_BINDINGS,
            resolveTooltipContext(gameState, { ability: { id: THROW_SHIELD_ABILITY_ID } }),
        );
    },
});

export const ThrowShieldCard: CardDef = {
    abilityId: THROW_SHIELD_ABILITY_ID,
};

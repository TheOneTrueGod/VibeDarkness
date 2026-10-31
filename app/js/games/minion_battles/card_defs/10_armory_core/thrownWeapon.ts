/**
 * Shared flight for the Armory's thrown conjured weapons.
 * `launchThrownWeapon` fires along the aim pick and puts the held weapon away.
 * `leaveThrownWeapon` drops the token where the projectile stopped; call it from `onProjectileExpired`.
 */
import { Projectile, type ProjectileHitPolicy } from '../../game/projectiles/Projectile';
import type { SpriteProjectileConfig } from '../../game/projectiles/projectile_defs/types';
import type { ResolvedTarget } from '../../game/types';
import type { Unit } from '../../game/units/Unit';
import type { CastBehaviourTickContext } from '../../abilities/castBehaviourTypes';
import { releaseHeldConjuredWeapon, type ConjureHost } from '../../game/conjuredWeapons/runtime';
import { THROW_PROJECTILE_SPEED, THROW_RANGE } from '../throwSharedTimings';

export interface ThrownWeaponSpec {
    abilityId: string;
    aimLabel: string;
    damage: number;
    /** Pixels per second. Omitted uses the shared throw speed. */
    speed?: number;
    spriteConfig: SpriteProjectileConfig;
    /** Omitted stops on the first enemy. */
    hitPolicy?: ProjectileHitPolicy;
    /** See `Projectile.bounceRange`. */
    bounceRange?: number;
    /** Hit radius in pixels. Omitted keeps the projectile default. */
    hitRadius?: number;
    trailRadius?: number;
    trailTaper?: boolean;
    trailColor?: number;
}

export function launchThrownWeapon(ctx: CastBehaviourTickContext, spec: ThrownWeaponSpec): void {
    if (!ctx.caster.heldConjuredWeapon) return;
    const aim = aimPoint(ctx, spec.aimLabel);
    const dx = aim.x - ctx.caster.x;
    const dy = aim.y - ctx.caster.y;
    const len = Math.hypot(dx, dy) || 1;
    const speed = spec.speed ?? THROW_PROJECTILE_SPEED;
    const projectile = new Projectile({
        x: ctx.caster.x,
        y: ctx.caster.y,
        velocityX: (dx / len) * speed,
        velocityY: (dy / len) * speed,
        damage: spec.damage,
        sourceTeamId: ctx.caster.teamId,
        sourceUnitId: ctx.caster.id,
        sourceAbilityId: spec.abilityId,
        maxDistance: THROW_RANGE,
        projectileType: 'sprite_projectile',
        spriteConfig: spec.spriteConfig,
        ...(spec.hitPolicy ? { hitPolicy: spec.hitPolicy } : {}),
        ...(spec.bounceRange != null ? { bounceRange: spec.bounceRange } : {}),
        ...(spec.trailRadius != null ? { trailRadius: spec.trailRadius } : {}),
        ...(spec.trailTaper ? { trailTaper: true } : {}),
        ...(spec.trailColor != null ? { trailColor: spec.trailColor } : {}),
    });
    if (spec.hitRadius != null) projectile.radius = spec.hitRadius;
    ctx.engine.addProjectile(projectile);
    releaseHeldConjuredWeapon(ctx.caster, ctx.engine, { leaveToken: false });
}

export function leaveThrownWeapon(
    engine: unknown,
    caster: Unit,
    projectile: Projectile,
    kind: string,
    abilityId: string,
): void {
    const host = engine as ConjureHost;
    host.state?.fieldObjects?.spawnDroppedWeapon(host, {
        originX: projectile.x,
        originY: projectile.y,
        directionRad: Math.atan2(projectile.velocityY, projectile.velocityX),
        kind,
        ownerUnitId: caster.id,
        teamId: caster.teamId,
        abilityId,
    });
}

function aimPoint(ctx: CastBehaviourTickContext, aimLabel: string): { x: number; y: number } {
    const active = ctx.caster.activeAbilities.find((entry) => entry.abilityId === ctx.abilityId);
    const fromLabel = pointOf(active?.targetsByLabel?.[aimLabel]);
    if (fromLabel) return fromLabel;
    for (const target of ctx.allTargets) {
        const point = pointOf(target);
        if (point) return point;
    }
    return { x: ctx.caster.x + THROW_RANGE, y: ctx.caster.y };
}

function pointOf(target: ResolvedTarget | undefined): { x: number; y: number } | null {
    return target?.position ?? null;
}

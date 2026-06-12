import type {
    CastBehaviour,
    CastBehaviourSetupContext,
} from '../castBehaviourTypes';
import type { AbilityEngineContext } from '../AbilityEngineContext';
import type { ResolvedTarget } from '../../game/types';
import { Projectile } from '../../game/projectiles/Projectile';
import { clampToMaxRange } from '../previewHelpers';
import { getDirectionFromTo, getPixelTargetPosition } from '../targetHelpers';

type DamageResolver = (ctx: CastBehaviourSetupContext) => number;

function resolveLaunchTarget(ctx: CastBehaviourSetupContext): { x: number; y: number } | null {
    const t: ResolvedTarget | undefined = ctx.target;
    if (t?.type === 'pixel' && t.position) return t.position;
    return getPixelTargetPosition(ctx.allTargets, 0);
}

/**
 * Fires a projectile toward a pixel target when its timing window opens (onSetup).
 * Pair with `ability.onProjectileExpired` or `abilityEvents[ON_PROJECTILE_EXPIRED]` for
 * impact / AoE effects at max range or on hit.
 */
export class ProjectileLaunchBehaviour implements CastBehaviour {
    private speed: number = 400;
    private radius: number = 5;
    private projectileType: 'default' | 'charged_rock' | 'energy_blast' | 'throwing_knife' = 'default';
    private maxRange: number = 200;
    private baseDamage: number = 0;
    private resolveDamage: DamageResolver | null = null;
    private pierce: number = 0;
    private passThroughEnemies: boolean = false;

    withSpeed(speed: number): this {
        this.speed = speed;
        return this;
    }

    withRadius(radius: number): this {
        this.radius = radius;
        return this;
    }

    withProjectileType(type: 'default' | 'charged_rock' | 'energy_blast' | 'throwing_knife'): this {
        this.projectileType = type;
        return this;
    }

    withMaxRange(range: number): this {
        this.maxRange = range;
        return this;
    }

    /** Flat damage on direct contact. Ignored when `withResolveDamage` is set. */
    withBaseDamage(damage: number): this {
        this.baseDamage = damage;
        return this;
    }

    /** Runtime damage (research, modifiers, etc.). Takes precedence over `withBaseDamage`. */
    withResolveDamage(fn: DamageResolver): this {
        this.resolveDamage = fn;
        return this;
    }

    withPierce(pierce: number): this {
        this.pierce = pierce;
        return this;
    }

    withPassThroughEnemies(): this {
        this.passThroughEnemies = true;
        return this;
    }

    onSetup(ctx: CastBehaviourSetupContext): void {
        const targetPos = resolveLaunchTarget(ctx);
        if (!targetPos) return;

        const engine = ctx.engine as AbilityEngineContext;
        const clamped = clampToMaxRange(ctx.caster, targetPos, this.maxRange);
        const { dirX, dirY, dist } = getDirectionFromTo(ctx.caster.x, ctx.caster.y, clamped.endX, clamped.endY);
        if (dist === 0) return;

        const travelDistance = Math.min(dist, this.maxRange);
        const damage = this.resolveDamage ? this.resolveDamage(ctx) : this.baseDamage;

        const projectile = new Projectile({
            x: ctx.caster.x,
            y: ctx.caster.y,
            velocityX: dirX * this.speed,
            velocityY: dirY * this.speed,
            damage,
            sourceTeamId: ctx.caster.teamId,
            sourceUnitId: ctx.caster.id,
            sourceAbilityId: ctx.abilityId,
            maxDistance: travelDistance,
            projectileType: this.projectileType,
            passThroughEnemies: this.passThroughEnemies,
            pierce: this.pierce,
        });
        projectile.radius = this.radius;
        engine.addProjectile(projectile);
    }
}

import type { CastBehaviour, CastBehaviourSetupContext } from '../castBehaviourTypes';
import type { AbilityEngineContext } from '../AbilityEngineContext';
import { Projectile } from '../../game/projectiles/Projectile';
import { clampToMaxRange } from '../previewHelpers';
import { getDirectionFromTo, getPixelTargetPosition } from '../targetHelpers';

export class ProjectileLaunchBehaviour implements CastBehaviour {
    private speed: number = 400;
    private radius: number = 5;
    private projectileType: 'default' | 'charged_rock' | 'energy_blast' | 'throwing_knife' = 'default';
    private maxRange: number = 200;
    private baseDamage: number = 0;

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

    /** Base damage dealt by the projectile on direct contact (before onProjectileExpired effects). Default 0. */
    withBaseDamage(damage: number): this {
        this.baseDamage = damage;
        return this;
    }

    onSetup(ctx: CastBehaviourSetupContext): void {
        const targetPos = getPixelTargetPosition(ctx.allTargets, 0);
        if (!targetPos) return;

        const engine = ctx.engine as AbilityEngineContext;
        const clamped = clampToMaxRange(ctx.caster, targetPos, this.maxRange);
        const { dirX, dirY, dist } = getDirectionFromTo(ctx.caster.x, ctx.caster.y, clamped.endX, clamped.endY);
        if (dist === 0) return;

        const projectile = new Projectile({
            x: ctx.caster.x,
            y: ctx.caster.y,
            velocityX: dirX * this.speed,
            velocityY: dirY * this.speed,
            damage: this.baseDamage,
            sourceTeamId: ctx.caster.teamId,
            sourceUnitId: ctx.caster.id,
            sourceAbilityId: ctx.abilityId,
            maxDistance: Math.min(dist, this.maxRange),
            projectileType: this.projectileType,
        });
        projectile.radius = this.radius;
        engine.addProjectile(projectile);
    }
}

import { Projectile } from '../objects/Projectile';
import type { Unit } from '../objects/Unit';

interface GameEngineLikeForGuns {
    addProjectile(projectile: Projectile): void;
    generateRandomInteger(min: number, max: number): number;
}

export interface GunShotParams {
    engine: unknown;
    caster: Unit;
    targetX: number;
    targetY: number;
    damage: number;
    maxDistance: number;
    speed: number;
    abilityId: string;
}

export function spawnGunProjectile(params: GunShotParams): void {
    const { engine, caster, targetX, targetY, damage, maxDistance, speed, abilityId } = params;
    const eng = engine as GameEngineLikeForGuns;
    if (typeof eng.addProjectile !== 'function') return;

    const dx = targetX - caster.x;
    const dy = targetY - caster.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist === 0) return;

    const velocityX = (dx / dist) * speed;
    const velocityY = (dy / dist) * speed;

    const projectile = new Projectile({
        x: caster.x,
        y: caster.y,
        velocityX,
        velocityY,
        damage,
        sourceTeamId: caster.teamId,
        sourceUnitId: caster.id,
        sourceAbilityId: abilityId,
        maxDistance,
        trailType: 'bullet',
    });
    projectile.radius = 3;

    eng.addProjectile(projectile);
}

/**
 * Distance-based inaccuracy helper.
 *
 * - At distance >= maxAccurateDist (200): penalty = baseInaccuracy.
 * - At distance <= minDistance (50):      penalty = baseInaccuracy * 1.1.
 * - Between: linearly interpolated between those two values.
 */
export function getDistanceBasedInaccuracy(
    distance: number,
    baseInaccuracy: number,
    minDistance: number = 50,
    maxAccurateDist: number = 400,
): number {
    if (!Number.isFinite(distance) || distance <= 0) return baseInaccuracy;
    if (distance <= minDistance) return baseInaccuracy * 2;
    if (distance >= maxAccurateDist) return baseInaccuracy;
    const t = (distance - minDistance) / (maxAccurateDist - minDistance);
    const factor = 2 - 1 * t;
    return baseInaccuracy * factor;
}

export function getRandomConeAngle(
    engine: unknown,
    centerAngle: number,
    maxOffsetRad: number,
): number {
    const eng = engine as GameEngineLikeForGuns;
    const minInt = 0;
    const maxInt = 10000;
    const n = typeof eng.generateRandomInteger === 'function'
        ? eng.generateRandomInteger(minInt, maxInt)
        : Math.floor(Math.random() * (maxInt - minInt + 1)) + minInt;
    const t = n / (maxInt - minInt);
    const offset = (t * 2 - 1) * maxOffsetRad;
    return centerAngle + offset;
}


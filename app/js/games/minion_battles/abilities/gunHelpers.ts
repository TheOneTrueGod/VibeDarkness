import { Projectile } from '../game/projectiles/Projectile';
import type { Unit } from '../game/units/Unit';

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

export interface FireGunShotAtTargetParams {
    engine: unknown;
    caster: Unit;
    targetX: number;
    targetY: number;
    damage: number;
    maxDistance: number;
    speed: number;
    abilityId: string;
    baseInaccuracy: number;
}

/** Random speed factor in [minFactor, maxFactor] for pellet spread (e.g. 0.9–1.1). */
export function getRandomSpeedFactor(
    engine: unknown,
    minFactor: number,
    maxFactor: number,
): number {
    const eng = engine as GameEngineLikeForGuns;
    const n = typeof eng.generateRandomInteger === 'function'
        ? eng.generateRandomInteger(0, 1000)
        : Math.floor(Math.random() * 1001);
    const t = n / 1000;
    return minFactor + t * (maxFactor - minFactor);
}

/**
 * Fire one gun shot toward a target with distance-based inaccuracy.
 * Clamps to maxDistance and uses getDistanceBasedInaccuracy + getRandomConeAngle.
 */
export function fireGunShotAtTarget(params: FireGunShotAtTargetParams): void {
    const { engine, caster, targetX, targetY, damage, maxDistance, speed, abilityId, baseInaccuracy } = params;
    const dx = targetX - caster.x;
    const dy = targetY - caster.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist === 0) return;

    const baseAngle = Math.atan2(dy, dx);
    const inaccuracy = getDistanceBasedInaccuracy(dist, baseInaccuracy);
    const angle = getRandomConeAngle(engine, baseAngle, inaccuracy);
    const clampedDist = Math.min(dist, maxDistance);
    const tx = caster.x + Math.cos(angle) * clampedDist;
    const ty = caster.y + Math.sin(angle) * clampedDist;

    spawnGunProjectile({
        engine,
        caster,
        targetX: tx,
        targetY: ty,
        damage,
        maxDistance,
        speed,
        abilityId,
    });
}


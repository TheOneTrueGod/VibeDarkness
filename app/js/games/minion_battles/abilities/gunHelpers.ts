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


/**
 * Shared slingshot utilities — wall-exit direction finding and launch impulse.
 * Used by DiggingClaws and the generic tickWallUnstick slingshot path.
 */

import type { Unit } from './Unit';
import type { EventBus } from '../EventBus';
import { CELL_SIZE } from '../../terrain/TerrainGrid';

const NEAREST_PASSABLE_DIR_COUNT = 16;

/** Knockback travels ≈ 1.5× magnitude (air + slide). CELL_SIZE → ~1.5 tiles; ~CELL_SIZE*4/3 → ~2 tiles. */
export const GENERIC_SLINGSHOT_MAGNITUDE = CELL_SIZE;
export const GENERIC_SLINGSHOT_AIR_TIME = 0.4;
export const GENERIC_SLINGSHOT_SLIDE_TIME = 0.2;

export const CONTROLLED_SLINGSHOT_AIR_TIME = 0.2;
export const CONTROLLED_SLINGSHOT_SLIDE_TIME = 0;

/** Snap a direction vector to the nearest cardinal axis. Prefers X when |dx| === |dy|. */
export function snapToCardinal(dx: number, dy: number): { x: number; y: number } {
    if (Math.abs(dx) >= Math.abs(dy)) return { x: dx >= 0 ? 1 : -1, y: 0 };
    return { x: 0, y: dy >= 0 ? 1 : -1 };
}

interface PassableQuery {
    isPassable(x: number, y: number): boolean;
}

/**
 * Scan NEAREST_PASSABLE_DIR_COUNT evenly-spaced angles from (x, y);
 * return unit direction toward the nearest passable tile within 200px.
 */
export function findNearestPassableDirection(
    tm: PassableQuery,
    x: number,
    y: number,
): { x: number; y: number } | null {
    const STEP = 4;
    const MAX_STEPS = 50; // 200px
    let bestDist = Infinity;
    let bestDir: { x: number; y: number } | null = null;

    for (let i = 0; i < NEAREST_PASSABLE_DIR_COUNT; i++) {
        const angle = (i / NEAREST_PASSABLE_DIR_COUNT) * Math.PI * 2;
        const dx = Math.cos(angle);
        const dy = Math.sin(angle);
        for (let s = 1; s <= MAX_STEPS; s++) {
            const d = s * STEP;
            if (tm.isPassable(x + dx * d, y + dy * d)) {
                if (d < bestDist) {
                    bestDist = d;
                    bestDir = { x: dx, y: dy };
                }
                break;
            }
        }
    }
    return bestDir;
}

/**
 * Compute the unit direction to push a stuck unit out of a wall.
 * Prefers heading back toward the wall entry point; falls back to nearest-passable scan.
 */
export function computeSlingshotDirection(
    entryX: number | null | undefined,
    entryY: number | null | undefined,
    currentX: number,
    currentY: number,
    tm: PassableQuery,
): { x: number; y: number } | null {
    let dirX = 0;
    let dirY = 0;
    if (entryX != null && entryY != null) {
        const dx = entryX - currentX;
        const dy = entryY - currentY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 0) {
            dirX = dx / dist;
            dirY = dy / dist;
        }
    }
    if (dirX === 0 && dirY === 0) {
        const nearest = findNearestPassableDirection(tm, currentX, currentY);
        if (nearest) {
            dirX = nearest.x;
            dirY = nearest.y;
        }
    }
    return dirX !== 0 || dirY !== 0 ? { x: dirX, y: dirY } : null;
}

/** Apply a slingshot launch knockback to a unit (poiseDamage=0, always applies). */
export function applySlingshotLaunch(
    unit: Unit,
    dirX: number,
    dirY: number,
    magnitude: number,
    airTime: number,
    slideTime: number,
    eventBus: EventBus,
    sourceUnitId: string,
    sourceAbilityId: string,
): void {
    unit.applyKnockback(
        {
            knockbackVector: { x: dirX * magnitude, y: dirY * magnitude },
            knockbackAirTime: airTime,
            knockbackSlideTime: slideTime,
            knockbackSource: { unitId: sourceUnitId, abilityId: sourceAbilityId },
        },
        eventBus,
    );
}

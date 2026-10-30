/**
 * Landing cell for a discarded conjured weapon. The token is placed on the landing cell
 * immediately; the flight is only a visual.
 */
import type { Unit } from '../units/Unit';
import type { TerrainManager } from '../../terrain/TerrainManager';
import { CELL_SIZE } from '../../terrain/TerrainGrid';
import {
    DROPPED_WEAPON_ARC_ANGLE,
    DROPPED_WEAPON_ARC_DISTANCE,
} from '../../card_defs/10_armory_core/armoryConstants';

export interface LandingContext {
    terrainManager?: TerrainManager | null;
    units: readonly Unit[];
}

const LANDING_SEARCH_RINGS = 3;

export function isOpenLanding(ctx: LandingContext, x: number, y: number): boolean {
    if (ctx.terrainManager && !ctx.terrainManager.isPassable(x, y)) return false;
    for (const unit of ctx.units) {
        if (!unit.isAlive()) continue;
        if (Math.hypot(unit.x - x, unit.y - y) < unit.radius) return false;
    }
    return true;
}

export function resolveDroppedWeaponLanding(
    ctx: LandingContext,
    originX: number,
    originY: number,
    directionRad: number = DROPPED_WEAPON_ARC_ANGLE,
): { x: number; y: number; facing: number } {
    const preferred = {
        x: originX + Math.cos(directionRad) * DROPPED_WEAPON_ARC_DISTANCE,
        y: originY + Math.sin(directionRad) * DROPPED_WEAPON_ARC_DISTANCE,
    };
    const landing = isOpenLanding(ctx, preferred.x, preferred.y)
        ? preferred
        : searchOpenLanding(ctx, preferred.x, preferred.y) ?? preferred;
    return {
        x: landing.x,
        y: landing.y,
        facing: Math.atan2(landing.y - originY, landing.x - originX),
    };
}

function searchOpenLanding(
    ctx: LandingContext,
    originX: number,
    originY: number,
): { x: number; y: number } | null {
    for (let ring = 1; ring <= LANDING_SEARCH_RINGS; ring++) {
        for (let dy = -ring; dy <= ring; dy++) {
            for (let dx = -ring; dx <= ring; dx++) {
                if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
                const x = originX + dx * CELL_SIZE;
                const y = originY + dy * CELL_SIZE;
                if (isOpenLanding(ctx, x, y)) return { x, y };
            }
        }
    }
    return null;
}

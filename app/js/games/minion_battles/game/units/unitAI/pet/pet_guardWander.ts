/**
 * Guard wander — pacing loop while a pet waits near its owner in pet_follow.
 *
 * Picks a random point in a ring around the owner (> 1 unit radius, < tether range),
 * walks there, dwells briefly (0.5–1 s, deterministic per stop), then repeats.
 */

import type { Unit } from '../../Unit';
import type { AIContext } from '../types';
import type { PetAITreeContext } from './context';
import { distance } from '../utils';
import { CELL_SIZE } from '../../../../terrain/TerrainGrid';

/** Distance to guard target considered "arrived" (px). */
const ARRIVAL_THRESHOLD_PX = 30;

/** Dwell duration bounds (seconds), inclusive — randomized per stop via AIContext RNG. */
const DWELL_MIN_SEC = 0.5;
const DWELL_MAX_SEC = 1.0;

export function clearPetGuardWander(ctx: PetAITreeContext): void {
    ctx.guardTargetX = undefined;
    ctx.guardTargetY = undefined;
    ctx.guardDwellUntilGameTime = undefined;
}

function guardTargetStillValid(
    owner: Unit,
    targetX: number,
    targetY: number,
    minDist: number,
    maxDist: number,
): boolean {
    const d = distance(owner.x, owner.y, targetX, targetY);
    return d >= minDist && d <= maxDist;
}

function pickGuardDwellSeconds(context: AIContext): number {
    const minTenths = Math.round(DWELL_MIN_SEC * 100);
    const maxTenths = Math.round(DWELL_MAX_SEC * 100);
    return context.generateRandomInteger(minTenths, maxTenths) / 100;
}

function pickNewGuardTarget(
    owner: Unit,
    context: AIContext,
    ctx: PetAITreeContext,
    minDist: number,
    maxDist: number,
): void {
    const angle = context.generateRandomInteger(0, 628) / 100;
    const dist = context.generateRandomInteger(minDist, maxDist);
    ctx.guardTargetX = Math.max(0, Math.min(context.WORLD_WIDTH, owner.x + Math.cos(angle) * dist));
    ctx.guardTargetY = Math.max(0, Math.min(context.WORLD_HEIGHT, owner.y + Math.sin(angle) * dist));
    ctx.guardDwellUntilGameTime = undefined;
}

function walkTowardGuardTarget(unit: Unit, context: AIContext, ctx: PetAITreeContext): void {
    if (ctx.guardTargetX == null || ctx.guardTargetY == null) return;
    const col = Math.floor(ctx.guardTargetX / CELL_SIZE);
    const row = Math.floor(ctx.guardTargetY / CELL_SIZE);
    const inTargetCell = Math.floor(unit.x / CELL_SIZE) === col && Math.floor(unit.y / CELL_SIZE) === row;
    if (!inTargetCell && !context.nav.isReachable(unit, col, row)) {
        // Unreachable — forget it; a new point is picked next turn.
        clearPetGuardWander(ctx);
        return;
    }
    context.nav.moveToPoint(unit, ctx.guardTargetX, ctx.guardTargetY, { exact: true });
}

/**
 * Run one guard-wander tick while the pet is within tether range of its owner.
 * Returns false when the ring is too tight to wander (caller should idle in place).
 */
export function runPetGuardWander(
    unit: Unit,
    owner: Unit,
    context: AIContext,
    ctx: PetAITreeContext,
    tetherRange: number,
): boolean {
    const unitSize = unit.radius;
    const minDist = unitSize + 1;
    const maxDist = tetherRange - 1;
    if (minDist >= maxDist) return false;

    if (
        ctx.guardTargetX != null
        && ctx.guardTargetY != null
        && !guardTargetStillValid(owner, ctx.guardTargetX, ctx.guardTargetY, minDist, maxDist)
    ) {
        clearPetGuardWander(ctx);
    }

    if (ctx.guardTargetX != null && ctx.guardTargetY != null) {
        const distToTarget = distance(unit.x, unit.y, ctx.guardTargetX, ctx.guardTargetY);

        if (distToTarget <= ARRIVAL_THRESHOLD_PX) {
            if (ctx.guardDwellUntilGameTime == null) {
                ctx.guardDwellUntilGameTime = context.gameTime + pickGuardDwellSeconds(context);
            }
            if (context.gameTime < ctx.guardDwellUntilGameTime) {
                return true;
            }
            clearPetGuardWander(ctx);
        } else {
            walkTowardGuardTarget(unit, context, ctx);
            return true;
        }
    }

    pickNewGuardTarget(owner, context, ctx, minDist, maxDist);
    walkTowardGuardTarget(unit, context, ctx);
    return true;
}
